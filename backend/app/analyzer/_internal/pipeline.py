"""
분석 파이프라인 (v2 - 약대 자문 반영)
- medications 전달 (대사증후군 약물 결합 연산)
- age 전달 (노인 경고 강화)
- recommendations 생성 (5인자별 맞춤 권장사항)

핵심 함수:
    run_basic_analysis(ocr_json, user_info)              → 기본 리포트
    run_comprehensive_analysis(report, user_info)        → 종합 평가
    run_group_analysis(checkup, user_info)               → 그룹 분류 (신규)
    run_recommendations(group_analysis, user_info)       → 권장사항 (신규)
    run_full_pipeline(ocr_json, user_info)               → 전체 통합
"""
from datetime import datetime
from typing import Optional


# ============================================================
# 같은 _internal/ 패키지 안의 모듈 import (격리 규칙: 상대 import)
# ============================================================
from .ocr_adapter import parse_ocr_json
from .health_report import generate_report
from .thresholds import evaluate_value
from .clinical_targets import annotate_peer_difference


# ============================================================
# Step 1: OCR JSON → 기본 리포트
# ============================================================
def run_basic_analysis(
    ocr_json: dict,
    user_info: Optional[dict] = None,
) -> dict:
    """
    OCR JSON과 사용자 정보를 받아서 기본 리포트를 반환.
    파일을 읽거나 쓰지 않음.

    Args:
        ocr_json: OCR 결과 JSON
        user_info: {"name": ..., "gender": 1, "birth_year": 1990,
                    "medications": {...}}

    Returns:
        기본 리포트 dict
    """
    user_info = user_info or {}

    # 1. OCR 파싱
    try:
        parsed = parse_ocr_json(ocr_json)
    except Exception as e:
        raise ValueError(f"OCR 파싱 실패: {type(e).__name__}: {e}") from e

    # 2. 사용자 정보 보완
    gender = parsed["gender"] or user_info.get("gender")
    age = parsed["age"]
    if age is None and user_info.get("birth_year") and parsed["exam_year"]:
        age = parsed["exam_year"] - user_info["birth_year"]

    # 3. 검증
    if gender is None:
        raise ValueError("성별 정보 없음 (OCR meta.patient_gender 또는 user_info.gender 필요)")
    if age is None:
        raise ValueError("나이 정보 없음 (OCR meta.patient_birth + exam_date, 또는 user_info.birth_year 필요)")
    if not parsed["checkup"]:
        raise ValueError("검진 수치 없음")

    exam_year = parsed["exam_year"] or datetime.now().year

    # 4. 기본 리포트 생성
    try:
        report = generate_report(
            checkup_raw=parsed["checkup"],
            gender=gender,
            age=age,
            year=exam_year,
        )
    except Exception as e:
        raise ValueError(f"리포트 생성 실패: {type(e).__name__}: {e}") from e

    # 5. 메타 정보 추가 (medications도 포함)
    report["_meta"] = {
        "user_id": user_info.get("user_id"),
        "user_name": user_info.get("name"),
        "exam_year": exam_year,
        "gender": gender,
        "age": age,
        "medications": user_info.get("medications", {}) or {},
        "analyzed_at": datetime.now().isoformat(timespec="seconds"),
        "ocr_warnings": parsed["warnings"],
        "ocr_metadata": parsed["metadata"],
    }

    return report


# ============================================================
# Step 2: 기본 리포트 → 종합 평가 (약물 결합 + 노인 경고)
# ============================================================
def run_comprehensive_analysis(
    report: dict,
    user_info: Optional[dict] = None,
) -> dict:
    """
    기본 리포트를 받아서 양방향 종합 평가 반환.
    - medications 전달 (약물 복용 보정)
    - age 전달 (노인 경고)
    """
    user_info = user_info or {}
    meta = report.get("_meta", {})

    gender = meta.get("gender") or user_info.get("gender", 1)
    age = meta.get("age") or report.get("기본정보", {}).get("나이")
    medications = meta.get("medications") or user_info.get("medications", {}) or {}
    target_year = (
        meta.get("exam_year")
        or report.get("기본정보", {}).get("비교연도")
    )

    # ========== 모든 항목 평가 (age, medications 전달) ==========
    all_evaluations = []

    # BMI 자동 계산용
    height_cm = None
    weight_kg = None
    has_bmi_already = False

    for item in report.get("전체결과", []):
        metric = item["항목"]
        value = item["값"]
        if value is None:
            continue

        if metric == "신장":
            height_cm = value
        elif metric == "체중":
            weight_kg = value
        elif metric == "BMI":
            has_bmi_already = True

        eval_result = evaluate_value(
            metric, value,
            gender=gender,
            age=age,
            medications=medications,
        )
        eval_result["percentile"] = item.get("백분위")
        eval_result["peer_mean"] = item.get("동연령_평균")
        # 또래 평균과의 차이가 임상적으로 의미 있는 수준인지 판정 (약대 자문 20% 기준).
        # 값을 숨기지는 않고, 화면이 "사실상 차이 없음"으로 표현할 수 있게 신호만 준다.
        eval_result["peer_comparison"] = annotate_peer_difference(
            value, eval_result["peer_mean"],
        )
        all_evaluations.append(eval_result)

    # BMI 자동 계산
    if not has_bmi_already and height_cm and weight_kg:
        h_m = height_cm / 100
        bmi = round(weight_kg / (h_m ** 2), 1)
        bmi_eval = evaluate_value(
            "BMI", bmi,
            gender=gender,
            age=age,
            medications=medications,
        )
        bmi_eval["percentile"] = None
        bmi_eval["peer_mean"] = None
        bmi_eval["auto_calculated"] = True
        all_evaluations.append(bmi_eval)

    # ========== 상태별 분류 (extremely_low, caution 추가) ==========
    by_status = {
        "extremely_high": [],
        "very_high": [],
        "extremely_low": [],
        "very_low": [],
        "high": [],
        "low": [],
        "caution": [],
        "normal": [],
        "normal_good": [],
        "info": [],
    }
    for e in all_evaluations:
        status = e["status"]
        if status in by_status:
            by_status[status].append(e)

    # ========== 위험도 점수 (extremely_low, caution 반영) ==========
    risk_score = (
        len(by_status["extremely_high"]) * 5
        + len(by_status["extremely_low"]) * 5
        + len(by_status["very_high"]) * 3
        + len(by_status["very_low"]) * 3
        + len(by_status["high"]) * 1
        + len(by_status["low"]) * 1
        + len(by_status["caution"]) * 0.5
    )

    if risk_score == 0:
        overall = "건강 양호"
    elif risk_score <= 2:
        overall = "관리 필요"
    elif risk_score <= 5:
        overall = "주의 필요"
    elif risk_score <= 10:
        overall = "위험 - 의료 상담 권장"
    else:
        overall = "고위험 - 즉시 의료 진료 권장"

    # 노인 경고 항목 카운트
    elderly_warning_count = sum(
        1 for e in all_evaluations if e.get("is_elderly_warning")
    )

    # 약물 복용 요약
    med_summary = {
        "hypertension": medications.get("hypertension", False),
        "diabetes": medications.get("diabetes", False),
        "dyslipidemia": medications.get("dyslipidemia", False),
    }
    on_any_medication = any(med_summary.values())

    return {
        "user_id": user_info.get("user_id"),
        "user_name": user_info.get("name") or meta.get("user_name"),
        "gender": "남" if gender == 1 else "여",
        "age": age,
        "year": target_year,
        "medications": med_summary,
        "on_any_medication": on_any_medication,
        "all_evaluations": all_evaluations,
        "by_status": by_status,
        "summary": {
            "total_metrics": len(all_evaluations),
            "risk_count": (
                len(by_status["extremely_high"])
                + len(by_status["extremely_low"])
                + len(by_status["very_high"])
                + len(by_status["very_low"])
            ),
            "warning_count": (
                len(by_status["high"])
                + len(by_status["low"])
                + len(by_status["caution"])
            ),
            "normal_count": (
                len(by_status["normal"]) + len(by_status["normal_good"])
            ),
            "elderly_warning_count": elderly_warning_count,
            "risk_score": risk_score,
            "overall_status": overall,
        },
        "_meta": {
            "analyzed_at": datetime.now().isoformat(timespec="seconds"),
            "thresholds_version": "v2 (약대 자문 반영)",
        },
    }


# ============================================================
# Step 3: 기본 리포트 → 그룹 분류 (대사증후군 약물 결합)
# ============================================================
def run_group_analysis(
    report: dict,
    user_info: Optional[dict] = None,
) -> dict:
    """
    검진 데이터로부터 그룹 분류 + 대사증후군 5인자 평가.
    파일 I/O 없음.

    Args:
        report: run_basic_analysis 결과
        user_info: medications 포함 사용자 정보

    Returns:
        그룹 분석 dict (user_group_analysis.py 결과와 동일 구조)
    """
    # user_group_analysis 모듈 import (지연 import - 순환 의존성 방지)
    from .user_group_analysis import (
        classify_user_groups,
        evaluate_metabolic_syndrome,
        calculate_group_rarity,
        GROUP_INFO,
    )

    user_info = user_info or {}
    meta = report.get("_meta", {})

    gender = meta.get("gender") or user_info.get("gender", 1)
    age = meta.get("age") or report.get("기본정보", {}).get("나이")
    medications = meta.get("medications") or user_info.get("medications", {}) or {}
    year = meta.get("exam_year") or report.get("기본정보", {}).get("비교연도")

    # 검진 결과 dict로 추출
    checkup = {}
    for item in report.get("전체결과", []):
        checkup[item["항목"]] = item["값"]

    # 1. 그룹 분류 (약물 결합)
    user_groups = classify_user_groups(checkup, gender, medications)

    # 2. 대사증후군 세부 평가
    ms_evaluation = evaluate_metabolic_syndrome(checkup, gender, medications)

    # 3. 희귀도
    rarity = calculate_group_rarity(user_groups, gender, age, year)

    # 4. 조합 그룹(복합 질환군) + 지방간 유형 — 모집단 통계 파일에만 의존하므로
    #    실패해도 나머지 그룹 결과는 그대로 반환한다.
    from .combo_group_analysis import run_combo_analysis

    try:
        combo_result = run_combo_analysis(checkup, gender, user_groups)
    except Exception as e:
        combo_result = {
            "error": f"조합 그룹 분석 실패: {type(e).__name__}: {e}",
            "combo_groups": None,
            "fatty_liver": None,
        }

    # 5. 임상 목표치(LDL 위험도별) + 지방간 보조지표(FLI/HSI)
    from .clinical_targets import classify_ldl_risk, fatty_liver_indices

    try:
        ldl_target = classify_ldl_risk(checkup, gender, age, user_groups, medications)
    except Exception as e:
        ldl_target = {"error": f"LDL 목표 판정 실패: {type(e).__name__}: {e}"}

    try:
        fl_indices = fatty_liver_indices(checkup, gender, user_groups)
    except Exception as e:
        fl_indices = {"error": f"지방간 지표 계산 실패: {type(e).__name__}: {e}"}

    # 지방간 유형(MASLD/ALD) 옆에 보조지표를 같이 붙여 한 화면에서 읽히게 한다.
    if isinstance(combo_result.get("fatty_liver"), dict):
        combo_result["fatty_liver"]["indices"] = fl_indices

    # 5-2. 추가 수치 계산기 (TyG·Non-HDL-C·BARD) — FLI/HSI와 같은 축의 참고 지표.
    from .calculators import additional_calculators

    try:
        extra_calc = additional_calculators(checkup, user_groups)
    except Exception as e:
        extra_calc = {"error": f"추가 계산기 실패: {type(e).__name__}: {e}"}

    # 6. ASCVD 10년 위험도 — 참고용 시뮬레이션 (한국인 미검증, 진단 아님)
    from .ascvd import run_ascvd_simulation

    try:
        ascvd = run_ascvd_simulation(checkup, gender, age, user_groups, medications)
    except Exception as e:
        ascvd = {
            "available": False,
            "is_simulation": True,
            "reason": f"ASCVD 시뮬레이션 실패: {type(e).__name__}: {e}",
        }

    # 약물 요약
    med_summary = {
        "hypertension": medications.get("hypertension", False),
        "diabetes": medications.get("diabetes", False),
        "dyslipidemia": medications.get("dyslipidemia", False),
    }

    return {
        "user_id": user_info.get("user_id"),
        "user_name": user_info.get("name") or meta.get("user_name"),
        "gender": "남" if gender == 1 else "여",
        "age": age,
        "year": year,
        "medications": med_summary,
        "on_any_medication": any(med_summary.values()),
        "user_groups": user_groups,
        "metabolic_syndrome_detail": ms_evaluation,
        "rarity": rarity,
        "combo_analysis": combo_result,
        "ldl_target": ldl_target,
        "calculators": extra_calc,
        "ascvd_simulation": ascvd,
        "_meta": {
            "analyzed_at": datetime.now().isoformat(timespec="seconds"),
            "version": "v2 (약대 자문 - 약물 결합) + 조합그룹",
        },
    }


# ============================================================
# 약물 코멘트 3단계 차등 (4.7)
# ============================================================
# 같은 약을 먹어도 조절 상태가 다르면 필요한 말이 다르다.
#   controlled     : 약으로 수치가 목표 범위에 들어옴 → 유지·중단 금지 안내
#   partially      : 약을 먹는데 관련 인자가 아직 충족 → 추가 관리 안내
#   uncontrolled   : 약을 먹는데도 질환군 판정 유지 → 의료진 상담 안내

_MED_SPEC = {
    "hypertension": {
        "label": "고혈압약",
        "factor": "고혈압",
        "group": "g_hypertension",
        "controlled": "혈압이 목표 범위에서 관리되고 있습니다. 임의로 중단하지 마시고 현재 처방을 유지하세요.",
        "partial": "약을 드시는 중에도 혈압 인자가 남아 있습니다. 가정에서 아침·저녁 혈압을 기록해 진료 시 보여주세요.",
        "uncontrolled": "약을 드시는데도 혈압이 높게 유지됩니다. 용량·병용 조정이 필요할 수 있으니 의료진과 상담하세요.",
    },
    "diabetes": {
        "label": "당뇨약",
        "factor": "고혈당",
        "group": "g_diabetes",
        "controlled": "혈당이 목표 범위에서 관리되고 있습니다. 저혈당 증상(어지러움·식은땀·떨림)에 유의하며 식사를 거르지 마세요.",
        "partial": "약을 드시는 중에도 혈당 인자가 남아 있습니다. HbA1c로 3개월 평균 혈당을 확인해 보세요.",
        "uncontrolled": "약을 드시는데도 혈당이 높게 유지됩니다. HbA1c 검사와 함께 치료 조정을 상담하세요.",
    },
    "dyslipidemia": {
        "label": "이상지질혈증약 (스타틴 등)",
        "factor": None,  # 대사증후군 인자 2개(낮은 HDL·고중성지방)에 걸쳐 있어 아래에서 따로 판정
        "group": "g_dyslipidemia",
        "controlled": "지질 수치가 관리되고 있습니다. 간 효소와 근육통 여부는 정기적으로 확인하세요.",
        "partial": "약을 드시는 중에도 지질 인자가 남아 있습니다. 식사·운동 병행 효과를 함께 확인해 보세요.",
        "uncontrolled": "약을 드시는데도 지질 수치가 목표에 못 미칩니다. 근육통이 있으면 함께 알리고 치료 조정을 상담하세요.",
    },
}


def _medication_notes(
    medications: dict,
    ms_detail: dict,
    user_groups: dict,
) -> list[dict]:
    """복용 중인 약물별로 조절 상태에 맞는 코멘트를 만든다."""
    notes: list[dict] = []
    factors = (ms_detail or {}).get("factors", {}) or {}

    for med_key, spec in _MED_SPEC.items():
        if not medications.get(med_key):
            continue

        # 질환군 판정이 유지되는가 (약물 때문에 True가 된 경우는 제외해야 하므로
        # 대사증후군 인자의 by_medication 플래그로 "수치 때문인지"를 가른다)
        if med_key == "dyslipidemia":
            related = [factors.get("낮은 HDL"), factors.get("고중성지방")]
            by_value = any(
                f and f.get("met") and not f.get("by_medication") for f in related
            )
        else:
            f = factors.get(spec["factor"])
            by_value = bool(f and f.get("met") and not f.get("by_medication"))

        in_group = bool(user_groups.get(spec["group"]))

        if by_value:
            level, note = "uncontrolled", spec["uncontrolled"]
        elif in_group:
            # 약 때문에 그룹에 들어간 상태 = 수치는 잡혀 있음
            level, note = "controlled", spec["controlled"]
        else:
            level, note = "partially_controlled", spec["partial"]

        notes.append({
            "medication": spec["label"],
            "control_level": level,
            "note": note,
        })

    return notes


# ============================================================
# Step 4: 그룹 분석 → 맞춤 권장사항
# ============================================================
def run_recommendations(
    group_analysis: dict,
    user_info: Optional[dict] = None,
) -> dict:
    """
    그룹 분석 결과로부터 맞춤 권장사항 생성.
    
    Args:
        group_analysis: run_group_analysis 결과
        user_info: 사용자 정보 (옵션)

    Returns:
        권장사항 dict
    """
    # recommendation_generator의 로직만 import해서 활용
    from .recommendation_generator import (
        COMMON_RECOMMENDATIONS,
        FACTOR_RECOMMENDATIONS,
        GROUP_RECOMMENDATIONS,
    )

    user_info = user_info or {}

    age = group_analysis.get("age")
    medications = group_analysis.get("medications", {})
    user_groups = group_analysis.get("user_groups", {})
    ms_detail = group_analysis.get("metabolic_syndrome_detail", {})

    recommendations = {
        "common": [],
        "metabolic_factors": [],
        "group_specific": [],
        "medication_notes": [],
        "elderly_notes": [],
    }

    # 1. 공통 기본 권장사항
    has_any_risk = (
        ms_detail.get("count", 0) >= 1 or
        any(user_groups.get(g, False) for g in [
            "g_obesity", "g_fatty_liver_suspect",
            "g_smoker_current", "g_drinker"
        ])
    )

    if has_any_risk:
        for name, items in COMMON_RECOMMENDATIONS.items():
            recommendations["common"].append({
                "category": name,
                "items": items,
            })

    # 2. 대사증후군 인자별
    if ms_detail and "factors" in ms_detail:
        for factor_name, factor_info in ms_detail["factors"].items():
            if not factor_info.get("met"):
                continue

            factor_rec = FACTOR_RECOMMENDATIONS.get(factor_name)
            if not factor_rec:
                continue

            entry = {
                "factor": factor_name,
                "title": factor_rec["title"],
                "target": factor_rec.get("target"),
                "details": factor_rec["details"].copy(),
                "by_medication": factor_info.get("by_medication", False),
                "reason": factor_info.get("reason"),
            }

            if entry["by_medication"]:
                entry["details"].insert(0,
                    "✓ 현재 약물 치료로 관리 중입니다. 임의 중단 없이 의료진과 상담하세요."
                )

            recommendations["metabolic_factors"].append(entry)

    # 3. 단일 그룹별
    for group_id, info in GROUP_RECOMMENDATIONS.items():
        if user_groups.get(group_id, False):
            recommendations["group_specific"].append({
                "group_id": group_id,
                "title": info["title"],
                "details": info["details"],
            })

    # 4. 약물 복용 주의사항 — 조절 상태에 따라 3단계로 차등한다.
    #    같은 "고혈압약 복용 중"이라도 혈압이 잘 잡힌 사람과 여전히 높은 사람에게
    #    같은 문구를 주면 둘 다에게 쓸모가 없다.
    for note in _medication_notes(medications, ms_detail, user_groups):
        recommendations["medication_notes"].append(note)

    # 5. 65세 이상 안내
    if age and age >= 65:
        recommendations["elderly_notes"] = [
            "저혈압/저혈당 시 어지러움으로 인한 낙상 위험이 매우 높습니다.",
            "약물 복용 후 일어설 때 천천히 움직이세요.",
            "혈압 측정을 자세 변화 시에도 확인하세요 (기립성 저혈압).",
            "수분 섭취를 충분히 하세요 (1일 1.5~2L).",
        ]

    # 우선순위 메시지
    priority_messages = []

    if ms_detail.get("is_metabolic_syndrome"):
        priority_messages.append(
            f"🚨 대사증후군에 해당합니다 ({ms_detail['count']}/{ms_detail['evaluable']}개 충족). "
            "심혈관 질환 위험이 매우 높으니 의료진 상담을 권장합니다."
        )

    if user_groups.get("g_diabetes"):
        priority_messages.append(
            "💊 당뇨 관리 - HbA1c 검사로 3개월 평균 혈당을 확인하고 합병증 예방에 신경 쓰세요."
        )

    if user_groups.get("g_fatty_liver_suspect"):
        priority_messages.append(
            "🩺 지방간 의심 - 간 초음파 검사 및 절주 권장."
        )

    if age and age >= 65:
        priority_messages.append(
            "👴 65세 이상 - 낙상 예방을 위해 저혈압/저혈당 증상에 특히 주의하세요."
        )

    return {
        "user_id": group_analysis.get("user_id"),
        "user_name": group_analysis.get("user_name"),
        "age": age,
        "priority_messages": priority_messages,
        "recommendations": recommendations,
        "_meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "version": "v1 (약대 자문)",
            "disclaimer": "본 권장사항은 일반 가이드라인이며, 개인별 의료 상담을 대체할 수 없습니다.",
        },
    }


# ============================================================
# Step 5: 통합 파이프라인 (API에서 주로 사용)
# ============================================================
def run_full_pipeline(
    ocr_json: dict,
    user_info: Optional[dict] = None,
) -> dict:
    """
    OCR JSON → 기본 리포트 + 종합 평가 + 그룹 분류 + 권장사항.

    Returns:
        {
            "basic_report": {...},
            "comprehensive": {...},
            "group_analysis": {...},
            "recommendations": {...},
        }
    """
    basic = run_basic_analysis(ocr_json, user_info)
    comprehensive = run_comprehensive_analysis(basic, user_info)
    
    # 그룹 분석 + 권장사항 (실패해도 다른 결과는 반환)
    group_analysis = None
    recommendations = None
    try:
        group_analysis = run_group_analysis(basic, user_info)
        recommendations = run_recommendations(group_analysis, user_info)
    except Exception as e:
        # 그룹 분석은 group_stats.parquet 등 의존성이 있어 실패 가능
        # 기본 분석은 성공했으므로 경고만 추가
        if "_meta" in basic:
            basic["_meta"].setdefault("warnings", []).append(
                f"그룹 분석 실패: {type(e).__name__}: {e}"
            )

    return {
        "basic_report": basic,
        "comprehensive": comprehensive,
        "group_analysis": group_analysis,
        "recommendations": recommendations,
    }


# ============================================================
# 직접 실행 시 동작 확인
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("🔧 pipeline.py v2 동작 테스트")
    print("=" * 60)

    sample_ocr = {
        "meta": {
            "exam_date": "2024-03-15",
            "patient_birth": "1980-05-20",
            "patient_gender": "M",
        },
        "measurements": {
            "height": {"value": 172},
            "weight": {"value": 78},
            "waist": {"value": 88},
            "sbp": {"value": 135},
            "dbp": {"value": 88},
            "fbs": {"value": 105},
            "total_cholesterol": {"value": 215},
            "ldl": {"value": 135},
            "hdl": {"value": 42},
            "tg": {"value": 180},
            "ast": {"value": 35},
            "alt": {"value": 48},
            "ggt": {"value": 72},
            "hb": {"value": 15.2},
            "creatinine": {"value": 1.0},
            "urine_protein": {"value": "정상"},
        },
        "lifestyle": {
            "smoking": "current",
            "drinking": "yes",
        },
    }
    sample_user = {
        "user_id": "test_user",
        "name": "홍길동",
        "gender": 1,
        "birth_year": 1980,
        "medications": {
            "hypertension": True,
            "diabetes": False,
            "dyslipidemia": True,
        },
    }

    try:
        result = run_full_pipeline(sample_ocr, sample_user)
        basic = result["basic_report"]
        comp = result["comprehensive"]
        groups = result.get("group_analysis")
        recs = result.get("recommendations")

        print(f"\n✅ 파이프라인 정상 동작")
        print(f"\n📊 기본 리포트:")
        print(f"   - 검진연도: {basic.get('기본정보', {}).get('비교연도')}")
        print(f"   - 분석 항목: {len(basic.get('전체결과', []))}개")

        print(f"\n🏥 종합 평가:")
        s = comp["summary"]
        print(f"   - 총 항목: {s['total_metrics']}개")
        print(f"   - 위험: {s['risk_count']}개 / 주의: {s['warning_count']}개 / 정상: {s['normal_count']}개")
        print(f"   - 위험도 점수: {s['risk_score']}점")
        print(f"   - 종합 평가: {s['overall_status']}")
        print(f"   - 약물 복용: {comp.get('on_any_medication')}")

        if groups:
            ms = groups.get("metabolic_syndrome_detail", {})
            print(f"\n🔬 대사증후군: {ms.get('count')}/{ms.get('evaluable')} 충족")
            print(f"   - 해당 여부: {ms.get('is_metabolic_syndrome')}")

        if recs:
            print(f"\n📋 권장사항:")
            print(f"   - 우선순위 메시지: {len(recs.get('priority_messages', []))}개")
            r = recs.get("recommendations", {})
            print(f"   - 인자별 가이드: {len(r.get('metabolic_factors', []))}개")
            print(f"   - 약물 주의사항: {len(r.get('medication_notes', []))}개")

    except Exception as e:
        print(f"\n❌ 에러 발생: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()