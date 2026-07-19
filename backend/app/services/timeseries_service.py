"""시계열 분석 흐름.

핵심 함수:
    refresh_timeseries: DB → 모든 회차 조립 → 분석 모듈 호출 → DB 저장
    get_latest_timeseries: DB에서 가장 최근 시계열 캐시 조회

자동 트리거 패턴:
    POST /analyze save=true 후에 checkup_service.analyze_and_save가 호출.
    history < 2 면 분석 모듈이 알아서 "available: false" 반환 — 백엔드는 그냥 호출.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.analyzer import analyze_timeseries

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────
# 진입점
# ──────────────────────────────────────────────────────────────────

async def refresh_timeseries(
    user_client: Client,
    user_id: str,
) -> dict[str, Any]:
    """user의 모든 회차 검진 → 시계열 분석 → DB 저장.

    동작:
        1. profiles에서 user_info 조회
        2. checkup_records + analysis_results JOIN해서 history 조립
        3. 최근 검진의 basic_report 추출 (인사이트 입력)
        4. analyze_timeseries 호출
        5. available=true면 timeseries_analyses에 UPSERT

    Returns:
        분석 결과 dict (라우터 응답용).
        history < 2 면 {"available": false, "reason": "...", ...} 반환.

    Raises:
        HTTPException: profiles 조회 실패 등 치명적 에러.
    """
    # 1. user_info
    user_info = _fetch_user_info(user_client, user_id)
    if not user_info or not user_info.get("birth_year"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="프로필 정보가 부족합니다 (birth_year 필요).",
        )

    # 2. history 조립
    history, latest_basic_report = _fetch_history(user_client, user_id)

    # 3. 분석 모듈 호출
    try:
        result = await analyze_timeseries(user_info, history, latest_basic_report)
    except Exception as e:
        logger.exception("analyze_timeseries 실패 (user_id=%s)", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"시계열 분석 실패: {e}",
        )

    # 4. available=true면 DB 저장
    if result.get("available"):
        try:
            _save_timeseries(user_client, user_id, result)
        except Exception as e:
            # 저장 실패해도 분석 결과는 반환
            logger.exception("timeseries_analyses 저장 실패 (user_id=%s)", user_id)
            result.setdefault("_meta", {})["save_warning"] = f"DB 저장 실패: {e}"

    return result


def get_latest_timeseries(
    user_client: Client,
    user_id: str,
) -> dict[str, Any]:
    """가장 최근 시계열 분석 캐시 조회.

    Returns:
        {
            "user_id": ...,
            "year_from": 2022,
            "year_to": 2024,
            "timeseries_data": {...},
            "insights": {...},
            "analyzed_at": "..."
        }

    Raises:
        404: 시계열 캐시 없음. POST /timeseries/refresh로 갱신하라고 안내.
    """
    resp = (
        user_client.table("timeseries_analyses")
        .select("*")
        .eq("user_id", user_id)
        .order("analyzed_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not resp or not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "시계열 분석 결과가 없습니다. "
                "검진을 2회 이상 등록한 후 POST /timeseries/refresh로 갱신하세요."
            ),
        )
    return resp.data


# ──────────────────────────────────────────────────────────────────
# 보조 함수
# ──────────────────────────────────────────────────────────────────

def _fetch_user_info(client: Client, user_id: str) -> dict[str, Any]:
    """profiles에서 분석에 필요한 정보 조회."""
    try:
        resp = (
            client.table("profiles")
            .select("name, gender, birth_year")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not resp or not resp.data:
            return {}
        info = dict(resp.data)
        info["user_id"] = user_id
        return info
    except Exception as e:
        logger.warning("profiles 조회 실패 (user_id=%s): %s", user_id, e)
        return {}


def _fetch_history(
    client: Client, user_id: str
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """사용자의 모든 회차 검진 + 최근 회차의 basic_report 조회.

    Returns:
        (history, latest_basic_report)
        - history: [{"year": int, "checkup": {"BMI": ..., "신장": ..., ...}}, ...]
          분석 모듈이 요구하는 형식. analysis_results.basic_report["전체결과"]에서 조립.
        - latest_basic_report: 가장 최근 회차의 basic_report (없으면 None)
    """
    resp = (
        client.table("analysis_results")
        .select("basic_report, analyzed_at, record_id, checkup_records!inner(exam_year)")
        .eq("user_id", user_id)
        .order("analyzed_at", desc=False)  # 오래된 순
        .execute()
    )
    rows = resp.data or []

    history: list[dict[str, Any]] = []
    latest_basic_report: dict[str, Any] | None = None

    # 같은 exam_year에 여러 분석이 있을 수 있음 → year별로 최근 것만 유지
    by_year: dict[int, dict[str, Any]] = {}

    for row in rows:
        basic_report = row.get("basic_report") or {}
        # exam_year 추출 (JOIN 결과 또는 basic_report._meta에서)
        exam_year = None
        cr = row.get("checkup_records") or {}
        if isinstance(cr, dict):
            exam_year = cr.get("exam_year")
        if exam_year is None:
            meta = basic_report.get("_meta", {}) or {}
            exam_year = meta.get("exam_year")
        if exam_year is None:
            continue

        # checkup dict 조립: 전체결과 list → {"BMI": value, ...}
        checkup: dict[str, Any] = {}
        for item in basic_report.get("전체결과", []) or []:
            metric = item.get("항목")
            value = item.get("값")
            if metric is not None and value is not None:
                checkup[metric] = value

        by_year[int(exam_year)] = {
            "year": int(exam_year),
            "checkup": checkup,
            "_basic_report": basic_report,  # 인사이트용 임시 저장
        }

    # 연도순 정렬 (인사이트 입력은 가장 최근 연도의 basic_report)
    sorted_years = sorted(by_year.keys())
    if sorted_years:
        latest_basic_report = by_year[sorted_years[-1]].pop("_basic_report", None)
    history = [by_year[y] for y in sorted_years]
    # _basic_report 키 다른 연도에서도 제거
    for h in history:
        h.pop("_basic_report", None)

    return history, latest_basic_report

    return history, latest_basic_report


def _save_timeseries(
    client: Client,
    user_id: str,
    result: dict[str, Any],
) -> None:
    """timeseries_analyses에 UPSERT.

    UNIQUE (user_id, year_from, year_to) 제약 활용.
    """
    years = result.get("years") or []
    if not years:
        return
    year_from = int(min(years))
    year_to = int(max(years))

    row = {
        "user_id": user_id,
        "year_from": year_from,
        "year_to": year_to,
        "timeseries_data": result,
        "insights": result.get("insight"),
        "analyzed_at": datetime.now().isoformat(timespec="seconds"),
    }

    # supabase-py upsert (on_conflict로 UNIQUE 키 명시)
    (
        client.table("timeseries_analyses")
        .upsert(row, on_conflict="user_id,year_from,year_to")
        .execute()
    )