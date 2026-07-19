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
        "_meta": {
            "analyzed_at": datetime.now().isoformat(timespec="seconds"),
            "version": "v2 (약대 자문 - 약물 결합)",
        },
    }


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

    # 4. 약물 복용 주의사항
    if medications.get("hypertension"):
        recommendations["medication_notes"].append({
            "medication": "고혈압약",
            "note": "혈압이 정상이더라도 임의로 약물을 중단하지 마세요. 가정 혈압 측정으로 변화를 추적하세요.",
        })
    if medications.get("diabetes"):
        recommendations["medication_notes"].append({
            "medication": "당뇨약",
            "note": "저혈당 증상(어지러움, 식은땀, 떨림)에 주의하세요. 식사를 거르지 마세요.",
        })
    if medications.get("dyslipidemia"):
        recommendations["medication_notes"].append({
            "medication": "이상지질혈증약 (스타틴 등)",
            "note": "간 효소 수치가 높아질 수 있으니 정기 검사가 필요합니다. 근육통이 있으면 의료진과 상담하세요.",
        })

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