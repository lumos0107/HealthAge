"""검진 + 분석 흐름.

핵심 함수:
    analyze_and_save: OCR JSON → analyzer 호출 → 결과 반환 (+ 옵션으로 DB 저장)

분석 측 기존 명세와 POST /analyze 호환:
    Request:  {"ocr": {...}, "user_id": ..., "user_info": {...}, "save": bool}
    Response: {"basic_report", "comprehensive", "recommendations",
               "medications_known", "saved", "saved_paths", "warnings"}
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.analyzer import ANALYZER_VERSION, analyze
from app.medication.categorizer import categorize_medications, has_any_records

from app.services.timeseries_service import refresh_timeseries

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────
# 분석 흐름
# ──────────────────────────────────────────────────────────────────

async def analyze_and_save(
    *,
    user_client: Client,
    user_id: str,
    ocr_json: dict[str, Any],
    user_info: dict[str, Any] | None = None,
    save: bool = False,
) -> dict[str, Any]:
    """OCR JSON → 분석 → (옵션) DB 저장.

    분석 전 처리:
        - user_info가 없으면 profiles에서 조회
        - medication_records에서 현재 복용 중인 약물 카테고리 계산
          (HIRA 이력 + drug_categories.json + 윈도우 로직)
        - 분석 모듈에 medications + age 자동 주입

    분석 후 처리:
        - basic_report, comprehensive, recommendations 반환
        - medications_known flag로 약물 정보 반영 여부 표시
        - save=True면 checkup_records + analysis_results 저장

    Args:
        user_client: 사용자 JWT가 부착된 Supabase 클라이언트.
        user_id: 토큰에서 추출한 user_id (검증 완료 가정).
        ocr_json: 사용자가 검수한 OCR JSON.
        user_info: 분석에 필요한 추가 정보 ({gender, birth_year, ...}).
                   None이면 profiles에서 조회.
        save: True면 DB에 분석 결과 저장.

    Returns:
        기존 명세 호환 응답:
        {
            "basic_report": {...},
            "comprehensive": {...},
            "recommendations": {...},
            "medications_known": bool,
            "saved": bool,
            "saved_paths": list[str] | None,
            "warnings": list[str],
        }
    """
    warnings: list[str] = []

    # 1. user_info 보완 (profiles에서 조회)
    if user_info is None:
        user_info = _fetch_user_info(user_client, user_id, warnings)

    # 1-b. 프로필에 저장된 생활습관(흡연/음주/음주량)을 분석 입력(lifestyle)에 주입.
    #      검진 업로드 때 매번 묻지 않고, 회원가입/내정보에서 받은 값을 자동 사용한다.
    #      (ocr에 lifestyle이 이미 있으면 그 값을 우선한다.)
    _lifestyle = ocr_json.setdefault("lifestyle", {})
    if user_info.get("smoking") and "smoking" not in _lifestyle:
        _lifestyle["smoking"] = user_info["smoking"]
    if user_info.get("drinking") and "drinking" not in _lifestyle:
        _lifestyle["drinking"] = user_info["drinking"]
    if user_info.get("alcohol_weekly_g") is not None and "alcohol_weekly_g" not in _lifestyle:
        _lifestyle["alcohol_weekly_g"] = user_info["alcohol_weekly_g"]

    # 2. age 계산 (분석 모듈이 노인층 경고에 사용)
    age = _compute_age(user_info, ocr_json)
    if age is not None:
        user_info["age"] = age

    # 3. HIRA 투약이력 → medications 자동 추론
    medications, medications_known = _fetch_medications_from_hira(
        user_client, user_id, warnings,
    )
    user_info["medications"] = medications

    # 4. 분석 모듈 호출
    try:
        result = await analyze(ocr_json, user_info)
    except NotImplementedError as e:
        logger.warning("analyze: _internal stub 상태 (%s)", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "분석 모듈이 아직 구현되지 않았습니다. "
                "health_project의 분석 코드를 app/analyzer/_internal/로 배포하세요."
            ),
        )
    except Exception as e:
        logger.exception("analyze 실패")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"분석 실패: {e}",
        )

    basic_report = result.get("basic_report", {})
    comprehensive = result.get("comprehensive", {})
    recommendations = result.get("recommendations", {})
    # 그룹 분석(대사증후군 세부 + 조합 그룹)은 그동안 계산만 하고 버려지고 있었다.
    group_analysis = result.get("group_analysis") or {}
    combo_analysis = group_analysis.get("combo_analysis") or {}
    # 단일그룹 판정(13개)·ASCVD 참고 시뮬도 combo_analysis(jsonb)에 함께 담아
    # 저장·조회 API로 내려준다. 구버전 저장 행에는 이 필드가 없다 → 프론트 null 처리.
    if combo_analysis and group_analysis:
        combo_analysis["single_groups"] = _single_groups_for_display(
            group_analysis.get("user_groups") or {}
        )
        combo_analysis["ascvd_simulation"] = group_analysis.get("ascvd_simulation")
    if "warnings" in result:
        warnings.extend(result.get("warnings", []))

    # 5. save=True면 DB 저장 (트랜잭션 보장은 별도 후속 작업)
    saved_paths: list[str] | None = None
    if save:
        try:
            saved_paths = _save_to_db(
                user_client,
                user_id,
                ocr_json,
                basic_report,
                comprehensive,
                recommendations,
                combo_analysis,
            )
        except Exception as e:
            logger.exception("DB 저장 실패 (분석 결과는 반환)")
            warnings.append(f"DB 저장 실패: {e}")

        # 시계열 자동 갱신 (회차 ≥ 2 이면 분석 모듈이 알아서 분석)
        # 실패해도 분석 응답에는 영향 없음 (warning만 추가)
        if saved_paths:
            try:
                await refresh_timeseries(user_client, user_id)
            except Exception as e:
                logger.warning("시계열 자동 갱신 실패 (분석 결과는 정상): %s", e)
                warnings.append(f"시계열 갱신 실패: {e}")

    return {
        "basic_report": basic_report,
        "comprehensive": comprehensive,
        "recommendations": recommendations,
        "group_analysis": group_analysis,
        "combo_analysis": combo_analysis,
        "medications_known": medications_known,
        "saved": saved_paths is not None,
        "saved_paths": saved_paths,
        "warnings": warnings,
    }


# ──────────────────────────────────────────────────────────────────
# 보조 함수: 정보 조회/계산
# ──────────────────────────────────────────────────────────────────

def _fetch_user_info(
    client: Client, user_id: str, warnings: list[str]
) -> dict[str, Any]:
    """profiles에서 분석에 필요한 정보 추출."""
    try:
        resp = (
            client.table("profiles")
            .select("name, gender, birth_year, birth_md, smoking, drinking, alcohol_weekly_g")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not resp or not resp.data:
            warnings.append("profiles에 사용자 정보가 없습니다.")
            return {"user_id": user_id}
        info = resp.data
        info["user_id"] = user_id
        return info
    except Exception as e:
        warnings.append(f"profiles 조회 실패: {e}")
        return {"user_id": user_id}


def _compute_age(user_info: dict[str, Any], ocr_json: dict[str, Any]) -> int | None:
    """검진 연도 - birth_year로 나이 계산.

    검진 연도가 없으면 오늘 기준 연도를 사용.
    birth_year가 없으면 None 반환.
    """
    birth_year = user_info.get("birth_year")
    if not birth_year:
        return None

    # 검진 연도 우선 (OCR meta에서)
    meta = ocr_json.get("meta", {}) or {}
    exam_date = meta.get("exam_date")
    if exam_date:
        try:
            exam_year = int(str(exam_date)[:4])
            return exam_year - int(birth_year)
        except (ValueError, TypeError):
            pass

    # fallback: 오늘 연도
    return datetime.now().year - int(birth_year)


def _fetch_medications_from_hira(
    client: Client, user_id: str, warnings: list[str]
) -> tuple[dict[str, bool], bool]:
    """HIRA 투약이력 조회 + 현재 복용 중인 약물 카테고리 계산.

    Returns:
        (medications, medications_known)
        - medications: {"hypertension": bool, "diabetes": bool, "dyslipidemia": bool}
        - medications_known: HIRA 이력이 1건이라도 있으면 True
                            (= 약물 정보가 분석에 반영되었다는 flag)

    Notes:
        조회 실패 또는 이력 없음 → 모두 False + known=False.
        프론트는 medications_known=False일 때
        "약물을 복용하지 않을 경우의 값입니다" 안내를 추가로 보여주면 됨.
    """
    try:
        resp = (
            client.table("medication_records")
            .select("dispensed_date, ingredient_en, total_days")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        warnings.append(f"medication_records 조회 실패: {e}")
        return _empty_medications(), False

    records = resp.data or []
    medications_known = has_any_records(records)

    try:
        medications = categorize_medications(records)
    except FileNotFoundError as e:
        # drug_categories.json 누락 시 분석 자체는 계속 진행
        warnings.append(f"약물 카테고리 매핑 누락: {e}")
        return _empty_medications(), False

    return medications, medications_known


def _empty_medications() -> dict[str, bool]:
    return {"hypertension": False, "diabetes": False, "dyslipidemia": False}


# ──────────────────────────────────────────────────────────────────
# 보조 함수: 단일그룹 표시용 변환
# ──────────────────────────────────────────────────────────────────

def _single_groups_for_display(user_groups: dict[str, Any]) -> list[dict[str, Any]]:
    """classify_user_groups 결과(g_* → bool)를 표시용 목록으로 변환.

    GROUP_INFO(13개) 순서대로 이름·분류·기준을 붙인다.
    판정 불가(입력값 없음)한 그룹은 applies=None.
    """
    from app.analyzer._internal.user_group_analysis import GROUP_INFO

    return [
        {
            "key": key,
            "name": info.get("name", key),
            "category": info.get("category", ""),
            "desc": info.get("desc"),
            "applies": user_groups.get(key),
        }
        for key, info in GROUP_INFO.items()
    ]


# ──────────────────────────────────────────────────────────────────
# 보조 함수: DB 저장
# ──────────────────────────────────────────────────────────────────

def _save_to_db(
    client: Client,
    user_id: str,
    ocr_json: dict[str, Any],
    basic_report: dict[str, Any],
    comprehensive: dict[str, Any],
    recommendations: dict[str, Any],
    combo_analysis: dict[str, Any] | None = None,
) -> list[str]:
    """checkup_records + analysis_results 저장.

    Returns:
        [record_id, analysis_id] 저장된 행의 ID들.

    Raises:
        Exception: DB 에러 그대로 전파. 호출 측에서 warnings 처리.

    Notes:
        PostgREST는 두 INSERT를 하나의 트랜잭션으로 묶지 못하므로,
        analysis_results INSERT 실패 시 방금 넣은 checkup_records 행을
        보상 삭제하여 고아 행을 방지한다.
    """
    # 1. checkup_records INSERT
    checkup_row = _ocr_to_checkup_row(ocr_json)
    checkup_row["user_id"] = user_id

    r_checkup = client.table("checkup_records").insert(checkup_row).execute()
    if not r_checkup.data:
        raise RuntimeError("checkup_records INSERT 결과 비어있음")
    record_id = r_checkup.data[0]["record_id"]

    # 2. analysis_results INSERT — 실패 시 1번 행을 보상 삭제
    analysis_row = {
        "record_id": record_id,
        "user_id": user_id,
        "analyzer_version": ANALYZER_VERSION,
        "basic_report": basic_report,
        "comprehensive": comprehensive,
        "recommendations": recommendations or None,
        "combo_analysis": combo_analysis or None,
    }
    try:
        r_analysis = client.table("analysis_results").insert(analysis_row).execute()
        if not r_analysis.data:
            raise RuntimeError("analysis_results INSERT 결과 비어있음")
    except Exception:
        try:
            client.table("checkup_records").delete().eq("record_id", record_id).execute()
        except Exception as cleanup_err:
            logger.error(
                "고아 행 보상 삭제 실패 (record_id=%s): %s", record_id, cleanup_err
            )
        raise
    analysis_id = r_analysis.data[0]["analysis_id"]

    return [record_id, analysis_id]


def _ocr_to_checkup_row(ocr_json: dict[str, Any]) -> dict[str, Any]:
    """OCR JSON의 measurements/lifestyle → checkup_records 컬럼."""
    measurements = ocr_json.get("measurements", {}) or {}
    lifestyle = ocr_json.get("lifestyle", {}) or {}
    meta = ocr_json.get("meta", {}) or {}

    exam_date = meta.get("exam_date")
    exam_year = None
    if exam_date:
        try:
            exam_year = int(str(exam_date)[:4])
        except (ValueError, TypeError):
            pass

    if not exam_date or not exam_year:
        today = date.today()
        exam_date = today.isoformat()
        exam_year = today.year

    def _val(key: str) -> Any:
        v = measurements.get(key)
        if isinstance(v, dict):
            return v.get("value")
        return v

    def _code(key: str) -> Any:
        v = measurements.get(key)
        if isinstance(v, dict):
            return v.get("code")
        return v

    def _urine_protein_code() -> Any:
        """요단백: 코드(1-6) 또는 문자열을 정수로 변환."""
        v = measurements.get("urine_protein")
        raw = v.get("code") if isinstance(v, dict) else v
        if isinstance(raw, int):
            return raw
        if isinstance(v, dict) and raw is None:
            raw = v.get("value")
        if isinstance(raw, int):
            return raw
        if raw is None:
            return None
        protein_mapping = {
            "정상": 1, "음성": 1, "negative": 1, "-": 1,
            "±": 2, "trace": 2,
            "1+": 3, "+": 3,
            "2+": 4, "++": 4,
            "3+": 5, "+++": 5,
            "4+": 6, "++++": 6,
        }
        return protein_mapping.get(str(raw).strip())

    def _lifestyle_code(key: str, mapping: dict[str, int]) -> Any:
        v = lifestyle.get(key)
        if v is None:
            return None
        if isinstance(v, int):
            return v
        return mapping.get(str(v).lower())

    return {
        "exam_date": exam_date,
        "exam_year": exam_year,
        "hospital": meta.get("hospital"),
        "height_cm": _val("height"),
        "weight_kg": _val("weight"),
        "bmi": _val("bmi"),
        "waist_cm": _val("waist"),
        "sbp": _val("sbp"),
        "dbp": _val("dbp"),
        "fbs": _val("fbs"),
        "total_cholesterol": _val("total_cholesterol"),
        "ldl": _val("ldl"),
        "hdl": _val("hdl"),
        "tg": _val("tg"),
        "ast": _val("ast"),
        "alt": _val("alt"),
        "ggt": _val("ggt"),
        "hb": _val("hb"),
        "creatinine": _val("creatinine"),
        "urine_protein": _urine_protein_code(),
        "smoking": _lifestyle_code("smoking", {"non": 1, "former": 2, "current": 3}),
        "drinking": _lifestyle_code("drinking", {"no": 0, "yes": 1, "non": 0}),
    }


# ──────────────────────────────────────────────────────────────────
# 리포트 조회
# ──────────────────────────────────────────────────────────────────

def list_report_years(client: Client, user_id: str) -> dict[str, Any]:
    """사용자의 검진 연도 목록.

    Returns:
        {"user_id": "...", "years": [2022, 2023, 2024], "count": 3}
    """
    resp = (
        client.table("checkup_records")
        .select("exam_year")
        .eq("user_id", user_id)
        .order("exam_year", desc=False)
        .execute()
    )
    years = sorted({row["exam_year"] for row in (resp.data or []) if row.get("exam_year")})
    return {"user_id": user_id, "years": years, "count": len(years)}


def get_report_by_year(
    client: Client, user_id: str, year: int
) -> dict[str, Any]:
    """특정 연도의 검진 + 분석 결과 + 권장사항.

    여러 분석이 있으면 가장 최근 것 반환.
    """
    r_checkup = (
        client.table("checkup_records")
        .select("*")
        .eq("user_id", user_id)
        .eq("exam_year", year)
        .order("exam_date", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not r_checkup or not r_checkup.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{year}년 검진 기록이 없습니다.",
        )
    checkup = r_checkup.data

    r_analysis = (
        client.table("analysis_results")
        .select("*")
        .eq("record_id", checkup["record_id"])
        .order("analyzed_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    analysis = (r_analysis.data if r_analysis else None) or {}

    return {
        "user_id": user_id,
        "year": year,
        "checkup": checkup,
        "basic_report": analysis.get("basic_report"),
        "comprehensive": analysis.get("comprehensive"),
        "recommendations": analysis.get("recommendations"),
        # 구버전 분석(07 마이그레이션 이전)에는 없다 → 프론트는 null 처리 필요
        "combo_analysis": analysis.get("combo_analysis"),
        "analyzed_at": analysis.get("analyzed_at"),
    }


def get_latest_comprehensive(client: Client, user_id: str) -> dict[str, Any]:
    """가장 최근 종합 분석 결과 (+ 권장사항)."""
    r = (
        client.table("analysis_results")
        .select("*")
        .eq("user_id", user_id)
        .order("analyzed_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not r or not r.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="분석 결과가 없습니다.",
        )
    return {
        "user_id": user_id,
        "comprehensive": r.data.get("comprehensive"),
        "basic_report": r.data.get("basic_report"),
        "recommendations": r.data.get("recommendations"),
        "combo_analysis": r.data.get("combo_analysis"),
        "analyzed_at": r.data.get("analyzed_at"),
    }


# ──────────────────────────────────────────────────────────────────
# 리포트 삭제 (기존 기능, 변경 없음)
# ──────────────────────────────────────────────────────────────────

def delete_report_by_year(
    client: Client, user_id: str, year: int
) -> dict[str, Any]:
    """특정 연도의 검진 기록 삭제.

    동작:
        1. checkup_records에서 (user_id, year) 행 삭제
           → analysis_results는 record_id CASCADE로 자동 삭제
        2. timeseries_analyses 전체 삭제 (해당 user의 모든 캐시)
           → 한 해 데이터가 빠지면 시계열 전체가 stale해지므로 통째로 무효화.
             다음 분석 요청 때 재생성됨.

    RLS:
        user_client로 호출되므로 본인 데이터만 지울 수 있음.

    Returns:
        {"deleted": {"checkup_records": N, "analysis_results": N, "timeseries_analyses": N}}

    Raises:
        404: 해당 연도 기록이 없음.
    """
    # 1. 존재 확인 + record_id 확보
    r_check = (
        client.table("checkup_records")
        .select("record_id")
        .eq("user_id", user_id)
        .eq("exam_year", year)
        .execute()
    )
    record_ids = [row["record_id"] for row in (r_check.data or [])]
    if not record_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{year}년 검진 기록이 없습니다.",
        )

    # 2. analysis_results 카운트 (CASCADE 전에)
    r_analysis_count = (
        client.table("analysis_results")
        .select("analysis_id", count="exact")
        .in_("record_id", record_ids)
        .execute()
    )
    analysis_count = r_analysis_count.count or 0

    # 3. checkup_records 삭제 → analysis_results CASCADE
    r_checkup_del = (
        client.table("checkup_records")
        .delete()
        .eq("user_id", user_id)
        .eq("exam_year", year)
        .execute()
    )
    checkup_count = len(r_checkup_del.data or [])

    # 4. timeseries_analyses 통째 삭제
    r_ts_del = (
        client.table("timeseries_analyses")
        .delete()
        .eq("user_id", user_id)
        .execute()
    )
    ts_count = len(r_ts_del.data or [])

    return {
        "deleted": {
            "checkup_records": checkup_count,
            "analysis_results": analysis_count,
            "timeseries_analyses": ts_count,
        }
    }