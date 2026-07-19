"""자연어 인사이트 생성 (격리됨).

원본: scripts/insight_generator.py
변경 사항:
- 진입점 시그니처: generate_insight(user_info, basic_report, timeseries) -> dict
- file I/O 함수 제거
- mkdir 제거
"""
from datetime import datetime


# ============================================================
# 항목별 의학 설명
# ============================================================
METRIC_DESCRIPTIONS = {
    "HDL콜레스테롤": {
        "name": "HDL 콜레스테롤",
        "alias": "좋은 콜레스테롤",
        "decrease_meaning": "심혈관 위험 증가 신호",
        "increase_meaning": "심혈관 건강 개선",
        "is_higher_better": True,
    },
    "LDL콜레스테롤": {
        "name": "LDL 콜레스테롤",
        "alias": "나쁜 콜레스테롤",
        "increase_meaning": "동맥경화 및 심혈관 위험 증가",
        "decrease_meaning": "심혈관 위험 감소",
        "is_higher_better": False,
    },
    "총콜레스테롤": {
        "name": "총 콜레스테롤",
        "increase_meaning": "심혈관 위험 증가 가능성",
        "is_higher_better": False,
    },
    "트리글리세라이드": {
        "name": "중성지방",
        "increase_meaning": "대사 이상 및 췌장염 위험",
        "is_higher_better": False,
    },
    "감마지티피": {
        "name": "감마GTP",
        "alias": "γ-GTP",
        "increase_meaning": "음주 또는 지방간 가능성",
        "is_higher_better": False,
    },
    "혈청지피티(ALT)": {
        "name": "ALT",
        "alias": "간 효소",
        "increase_meaning": "간 손상 또는 지방간 의심",
        "is_higher_better": False,
    },
    "혈청지오티(AST)": {
        "name": "AST",
        "alias": "간 효소",
        "increase_meaning": "간 손상 가능성",
        "is_higher_better": False,
    },
    "수축기혈압": {
        "name": "수축기혈압",
        "increase_meaning": "고혈압 진행 위험",
        "is_higher_better": False,
    },
    "이완기혈압": {
        "name": "이완기혈압",
        "increase_meaning": "고혈압 진행 위험",
        "is_higher_better": False,
    },
    "식전혈당(공복혈당)": {
        "name": "공복혈당",
        "increase_meaning": "당뇨 전단계 또는 당뇨 진입",
        "is_higher_better": False,
    },
    "BMI": {
        "name": "BMI",
        "alias": "체질량지수",
        "increase_meaning": "비만 위험",
        "is_higher_better": False,
    },
    "허리둘레": {
        "name": "허리둘레",
        "increase_meaning": "복부비만 (대사증후군 위험)",
        "is_higher_better": False,
    },
}


# ============================================================
# 데이터 로드
# ============================================================



# ============================================================
# 인사이트 생성 함수들
# ============================================================
def get_metric_name(metric: str) -> str:
    """항목명 → 사용자 친화 이름"""
    desc = METRIC_DESCRIPTIONS.get(metric, {})
    return desc.get("name", metric)


def generate_overall_summary(report: dict, timeseries: dict) -> str:
    """전체 요약 (종합 평가)"""
    info = report["기본정보"]
    name = report.get("_meta", {}).get("user_name", "")
    
    lines = []
    
    if timeseries and not timeseries.get("error"):
        years_str = timeseries["year_range"]
        history_count = len(timeseries["years"])
        lines.append(
            f"{name}님은 지난 {years_str} 동안 {history_count}회의 검진을 받으셨습니다."
        )
    
    # 대사증후군 상태
    ms = report["대사증후군"]
    if ms["diagnosis"]:
        lines.append(
            f"⚠️ 현재 대사증후군 진단 기준 5가지 중 {ms['score']}가지를 충족하여 "
            f"대사증후군에 해당합니다. 즉각적인 생활습관 개선과 의료 진료가 필요합니다."
        )
    elif ms["score"] >= 2:
        lines.append(
            f"⚠️ 대사증후군 5가지 기준 중 {ms['score']}가지를 충족하고 있습니다. "
            f"앞으로 추가 충족 시 대사증후군이 될 수 있으므로 주의가 필요합니다."
        )
    elif ms["score"] >= 1:
        lines.append(
            f"대사증후군 기준 중 1가지에 해당합니다. 추가 진행을 막기 위한 관리가 필요합니다."
        )
    else:
        lines.append("대사증후군 관련 위험 요인은 현재 없습니다.")
    
    return " ".join(lines)


def generate_top_concerns(report: dict, timeseries: dict, max_count: int = 3) -> list:
    """가장 우려되는 변화 TOP N"""
    concerns = []
    
    # 위험 항목 우선
    risk_items = [w for w in report.get("주의항목", []) if w["수준"] == "위험"]
    warn_items = [w for w in report.get("주의항목", []) if w["수준"] == "주의"]
    
    # 시계열에서 highlights 가져오기 (있을 때만)
    highlights = []
    if timeseries and not timeseries.get("error"):
        highlights = sorted(
            timeseries.get("highlights", []),
            key=lambda x: 0 if x.get("severity") == "high" else 1
        )
    
    # 우려 항목 만들기 - 시계열 변화 + 임상 상태 결합
    processed_metrics = set()
    
    # 1) 위험 항목 + 시계열 highlight 결합
    for risk in risk_items:
        metric = risk["항목"]
        if metric in processed_metrics:
            continue
        
        concern = build_concern(metric, risk, timeseries, report)
        if concern:
            concerns.append(concern)
            processed_metrics.add(metric)
        
        if len(concerns) >= max_count:
            return concerns
    
    # 2) 시계열 highlights 중 빠른 변화
    for h in highlights:
        metric = h["metric"]
        if metric in processed_metrics:
            continue
        if h.get("severity") != "high":
            continue
        
        # 임상 상태도 확인
        clinical_item = next(
            (item for item in report["전체결과"] if item["항목"] == metric),
            None
        )
        
        concern = build_concern(metric, clinical_item, timeseries, report)
        if concern:
            concerns.append(concern)
            processed_metrics.add(metric)
        
        if len(concerns) >= max_count:
            return concerns
    
    # 3) 일반 주의 항목
    for warn in warn_items:
        metric = warn["항목"]
        if metric in processed_metrics:
            continue
        
        concern = build_concern(metric, warn, timeseries, report)
        if concern:
            concerns.append(concern)
            processed_metrics.add(metric)
        
        if len(concerns) >= max_count:
            return concerns
    
    return concerns


def build_concern(metric: str, clinical_item, timeseries, report) -> dict:
    """한 항목의 우려 사항 텍스트 만들기"""
    if not clinical_item:
        return None
    
    desc = METRIC_DESCRIPTIONS.get(metric, {})
    display_name = desc.get("name", metric)
    
    current_value = clinical_item.get("값")
    level = clinical_item.get("수준") or clinical_item.get("임상판정", "")
    
    # 시계열 변화
    ts_data = None
    if timeseries and not timeseries.get("error"):
        ts_data = timeseries.get("metrics", {}).get(metric)
    
    # 제목 만들기
    title_parts = [display_name]
    if desc.get("alias"):
        title_parts.append(f"({desc['alias']})")
    title = " ".join(title_parts)
    
    # 상세 설명
    details = []
    
    # 1. 현재 값과 임상 의미
    if level == "위험":
        details.append(f"현재 {current_value}로 위험 수준입니다.")
    elif level == "주의":
        details.append(f"현재 {current_value}로 주의 수준입니다.")
    
    # 2. 동연령 비교
    all_item = next(
        (item for item in report["전체결과"] if item["항목"] == metric),
        None
    )
    if all_item and "백분위" in all_item:
        details.append(all_item["해석"])
    
    # 3. 시계열 변화
    if ts_data:
        values = ts_data["values"]
        user_change = ts_data["user_change"]
        pop_change = ts_data.get("population_change")
        is_higher_better = desc.get("is_higher_better", False)
        
        change_str = f"{values[0]} → {values[-1]} ({user_change:+.1f})"
        
        # 좋은 변화인지 나쁜 변화인지
        if is_higher_better:
            is_bad = user_change < 0
        else:
            is_bad = user_change > 0
        
        if abs(user_change) >= 5:
            if is_bad:
                details.append(f"{ts_data['span_years']}년간 {change_str}로 변했습니다.")
                if desc.get("decrease_meaning" if is_higher_better else "increase_meaning"):
                    meaning = desc.get("decrease_meaning" if is_higher_better else "increase_meaning")
                    details.append(meaning)
            else:
                details.append(f"개선되었습니다 ({change_str})")
        
        # 모집단 대비
        if pop_change is not None and abs(pop_change) > 0.1:
            ratio = abs(user_change) / max(abs(pop_change), 0.1)
            if ratio >= 2 and abs(user_change) >= 3:
                if (user_change > 0 and pop_change < 0) or (user_change < 0 and pop_change > 0):
                    details.append(
                        f"같은 연령대 평균({pop_change:+.1f})과 반대 방향으로 변화 중입니다."
                    )
                elif abs(user_change) > abs(pop_change) * 2:
                    details.append(
                        f"같은 연령대 평균({pop_change:+.1f})보다 빠르게 변화하고 있습니다."
                    )
    
    return {
        "title": title,
        "metric": metric,
        "level": level,
        "current_value": current_value,
        "details": details,
    }


def generate_recommendations(report: dict, timeseries: dict, concerns: list) -> list:
    """권장 사항"""
    recommendations = []
    
    ms = report["대사증후군"]
    
    # 대사증후군이면 강력한 권고
    if ms["diagnosis"]:
        recommendations.append(
            "대사증후군에 해당하므로 가까운 시일 내 내과 또는 가정의학과 진료를 권장합니다."
        )
    elif ms["score"] >= 2:
        recommendations.append(
            "대사증후군에 근접한 상태입니다. 생활습관 개선을 시작할 시점입니다."
        )
    
    # 각 우려 항목별 권장 사항
    concern_metrics = {c["metric"] for c in concerns}
    
    # 음주 관련 (감마GTP, ALT 동시 상승)
    if "감마지티피" in concern_metrics:
        ts = timeseries.get("metrics", {}) if timeseries and not timeseries.get("error") else {}
        ggt_data = ts.get("감마지티피", {})
        alt_data = ts.get("혈청지피티(ALT)", {})
        
        if ggt_data.get("user_change", 0) > 10:
            if alt_data.get("user_change", 0) > 10:
                recommendations.append(
                    "감마GTP와 ALT가 동반 상승 중입니다. 음주량 감소와 간 검사 추가가 필요합니다."
                )
            else:
                recommendations.append(
                    "감마GTP가 빠르게 상승 중입니다. 음주량 조절과 지방간 검사를 권장합니다."
                )
    
    # 당뇨 위험
    if "식전혈당(공복혈당)" in concern_metrics:
        all_item = next(
            (item for item in report["전체결과"] if item["항목"] == "식전혈당(공복혈당)"),
            None
        )
        if all_item and all_item.get("값", 0) >= 100:
            recommendations.append(
                "공복혈당이 100 이상으로 당뇨 전단계 영역입니다. "
                "HbA1c(당화혈색소) 검사 추가를 권장합니다."
            )
    
    # 콜레스테롤
    if "LDL콜레스테롤" in concern_metrics or "HDL콜레스테롤" in concern_metrics:
        recommendations.append(
            "콜레스테롤 수치 관리를 위해 포화지방 섭취 줄이기, 유산소 운동, "
            "필요시 약물 치료를 의사와 상의하세요."
        )
    
    # 혈압
    if "수축기혈압" in concern_metrics or "이완기혈압" in concern_metrics:
        recommendations.append(
            "혈압 관리가 필요합니다. 저염식, 체중 관리, 규칙적인 운동을 권장합니다."
        )
    
    # 비만
    if "BMI" in concern_metrics or "허리둘레" in concern_metrics:
        recommendations.append(
            "체중 관리가 필요합니다. 식이 조절과 주 150분 이상의 중강도 운동을 권장합니다."
        )
    
    # 일반적 권고
    if not recommendations:
        recommendations.append("현재 특별한 위험 요인은 없습니다. 현재 생활습관을 유지하세요.")
    
    return recommendations


def find_positive_changes(timeseries: dict) -> list:
    """긍정적 변화 찾기"""
    if not timeseries or timeseries.get("error"):
        return []
    
    positives = []
    metrics = timeseries.get("metrics", {})
    
    for metric, data in metrics.items():
        desc = METRIC_DESCRIPTIONS.get(metric, {})
        is_higher_better = desc.get("is_higher_better", False)
        user_change = data.get("user_change", 0)
        
        # 좋아진 케이스
        improved = False
        if is_higher_better and user_change > 5:
            improved = True
        elif not is_higher_better and user_change < -5:
            improved = True
        
        if improved:
            display_name = desc.get("name", metric)
            values = data["values"]
            positives.append({
                "metric": metric,
                "name": display_name,
                "change_text": f"{values[0]} → {values[-1]} ({user_change:+.1f})"
            })
    
    return positives


# ============================================================
# 메인 인사이트 생성
# ============================================================
def generate_insight(user_info: dict, basic_report: dict, timeseries: dict | None) -> dict:
    """사용자 자연어 인사이트 생성.

    Args:
        user_info:    {"user_id", "name", "gender", "birth_year", ...}
        basic_report: pipeline.run_basic_analysis 결과
        timeseries:   analyze_timeseries 결과 (없으면 None)
    """
    if not user_info:
        return {"error": "사용자 정보 없음"}
    if not basic_report:
        return {"error": "리포트 없음"}

    user_id = user_info.get("user_id")
    report = basic_report

    summary = generate_overall_summary(report, timeseries)
    concerns = generate_top_concerns(report, timeseries, max_count=3)
    recommendations = generate_recommendations(report, timeseries, concerns)
    positives = find_positive_changes(timeseries) if timeseries else []

    next_exam_year = None
    if timeseries and timeseries.get("exam_pattern"):
        next_exam_year = timeseries["exam_pattern"].get("next_expected")

    return {
        "user_id": user_id,
        "user_name": user_info.get("name"),
        "gender": "남" if user_info.get("gender") == 1 else "여",
        "age": report.get("기본정보", {}).get("나이"),
        "summary": summary,
        "top_concerns": concerns,
        "recommendations": recommendations,
        "positive_changes": positives,
        "next_exam_year": next_exam_year,
        "_meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "based_on_report": report.get("_meta", {}).get("exam_year"),
            "has_timeseries": timeseries is not None and not timeseries.get("error"),
        }
    }
