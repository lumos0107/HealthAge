"""시계열 변화 종합 분석 (v3, 격리됨).

원본: scripts/timeseries_full.py
변경 사항:
- 진입점 시그니처: analyze_full_timeseries(user_info: dict, history: list) -> dict
- file I/O 함수 제거
- 상대 import 적용
"""
from datetime import datetime

from .thresholds import THRESHOLDS, evaluate_value, get_status_priority


def get_change_direction(metric: str, first_val: float, last_val: float, 
                          gender: int = 1) -> str:
    """
    변화의 의학적 방향 판단
    - high_bad: 높아지면 나쁨
    - low_bad: 낮아지면 나쁨
    - both/u_shape: 시작/끝 상태 비교해서 판단
    """
    if metric not in THRESHOLDS:
        return "neutral"
    
    config = THRESHOLDS[metric]
    direction = config.get("direction", "info_only")
    change = last_val - first_val
    
    # 변화 없음
    if abs(change) < 0.01:
        return "neutral"
    
    if direction == "high_bad":
        return "bad" if change > 0 else "good"
    
    elif direction == "low_bad":
        return "good" if change > 0 else "bad"
    
    elif direction in ["both", "u_shape"]:
        # ★ 양방향 항목: 시작값과 끝값의 상태를 비교
        first_eval = evaluate_value(metric, first_val, gender)
        last_eval = evaluate_value(metric, last_val, gender)
        
        # 상태 점수 (낮을수록 좋음)
        first_score = get_status_priority(first_eval["status"])
        last_score = get_status_priority(last_eval["status"])
        
        # 점수가 낮아짐 = 더 위험해짐 (priority 0 = 가장 위험)
        # 점수가 높아짐 = 더 정상에 가까워짐
        if last_score < first_score:
            return "bad"   # 위험해짐
        elif last_score > first_score:
            return "good"  # 좋아짐
        else:
            # 같은 상태인 경우 - 정상 범위 안에서 움직였는지 확인
            if first_eval["status"] in ["normal", "normal_good"] and last_eval["status"] in ["normal", "normal_good"]:
                # 둘 다 정상 - 정상 범위 안에서의 변화는 중립
                return "neutral"
            else:
                # 같은 비정상 상태 유지 - 비정상에서 더 멀어지는 방향이면 나쁨
                # 예: BMI 26 → 28 (둘 다 "high"인데 더 높아짐)
                if direction == "high_bad" or (direction == "both" and last_val > first_val):
                    # 비정상 쪽으로 더 갔는지
                    ideal = config.get("ideal", None)
                    if ideal:
                        # ideal 범위 중앙에서 더 멀어졌으면 나쁨
                        ideal_mid = (ideal[0] + ideal[1]) / 2
                        first_dist = abs(first_val - ideal_mid)
                        last_dist = abs(last_val - ideal_mid)
                        return "bad" if last_dist > first_dist else "good"
                return "neutral"
    
    else:
        return "neutral"


def analyze_full_timeseries(user_info: dict, history: list) -> dict:
    """사용자 시계열 변화 종합 분석.

    Args:
        user_info: {"user_id", "name", "gender", "birth_year", ...}
        history:   [{"year": int, "checkup": {"BMI": ..., "신장": ..., "체중": ..., ...}}, ...]

    Returns:
        시계열 변화 분석 dict.
        history < 2 이면 error 필드 반환.
    """
    if not user_info:
        return {"error": "사용자 정보 없음"}

    user_id = user_info.get("user_id")
    gender = user_info.get("gender", 1)
    name = user_info.get("name", user_id)

    if len(history) < 2:
        return {
            "error": f"{user_id}: 시계열 분석을 위해 2개 이상의 검진 필요 (현재 {len(history)}개)"
        }

    years = sorted(h["year"] for h in history)

    # 연도별 데이터 수집 + BMI 자동 계산
    yearly_data = {}
    for h in history:
        yr = h["year"]
        checkup = h.get("checkup", {})
        height_cm = None
        weight_kg = None
        has_bmi = False

        for metric, value in checkup.items():
            if value is None:
                continue

            if metric == "신장":
                height_cm = value
            elif metric == "체중":
                weight_kg = value
            elif metric == "BMI":
                has_bmi = True

            if metric not in yearly_data:
                yearly_data[metric] = {}
            yearly_data[metric][yr] = value

        # BMI 자동 계산
        if not has_bmi and height_cm and weight_kg:
            bmi = round(weight_kg / ((height_cm / 100) ** 2), 1)
            if "BMI" not in yearly_data:
                yearly_data["BMI"] = {}
            yearly_data["BMI"][yr] = bmi
    
    # 항목별 변화 분석
    analyses = []
    
    for metric, years_data in yearly_data.items():
        if len(years_data) < 2:
            continue
        
        sorted_years = sorted(years_data.keys())
        first_year = sorted_years[0]
        last_year = sorted_years[-1]
        first_val = years_data[first_year]
        last_val = years_data[last_year]
        
        change = last_val - first_val
        n_years = last_year - first_year
        
        # 현재 상태
        current_eval = evaluate_value(metric, last_val, gender)
        
        # ★ 변화 방향 (양방향 개선됨)
        direction = get_change_direction(metric, first_val, last_val, gender)
        
        # 변화 크기 분류
        if first_val == 0:
            magnitude = "stable" if abs(change) < 1 else "large"
        else:
            pct = abs(change) / abs(first_val)
            if pct < 0.05:
                magnitude = "stable"
            elif pct < 0.15:
                magnitude = "small"
            else:
                magnitude = "large"
        
        analyses.append({
            "metric": metric,
            "first_year": first_year,
            "last_year": last_year,
            "n_years": n_years,
            "first_value": first_val,
            "last_value": last_val,
            "change": round(change, 2),
            "pct_change": round(change / first_val * 100, 1) if first_val != 0 else None,
            "direction": direction,
            "magnitude": magnitude,
            "current_status": current_eval["status"],
            "current_label": current_eval["label"],
            "current_meaning": current_eval["meaning"],
        })
    
    # 분류
    by_direction = {
        "bad_large": [],
        "bad_small": [],
        "good_large": [],
        "good_small": [],
        "neutral_change": [],
        "stable": [],
    }
    
    for a in analyses:
        if a["direction"] == "bad":
            if a["magnitude"] == "large":
                by_direction["bad_large"].append(a)
            else:
                by_direction["bad_small"].append(a)
        elif a["direction"] == "good":
            if a["magnitude"] == "large":
                by_direction["good_large"].append(a)
            else:
                by_direction["good_small"].append(a)
        else:
            if a["magnitude"] == "stable":
                by_direction["stable"].append(a)
            else:
                by_direction["neutral_change"].append(a)
    
    bad_total = len(by_direction["bad_large"]) + len(by_direction["bad_small"])
    good_total = len(by_direction["good_large"]) + len(by_direction["good_small"])
    # (print removed in backend integration)
    
    return {
        "user_id": user_id,
        "user_name": name,
        "gender": "남" if gender == 1 else "여",
        "n_checkups": len(history),
        "years": years,
        "by_direction": by_direction,
        "summary": {
            "total_metrics_tracked": len(analyses),
            "bad_changes": bad_total,
            "good_changes": good_total,
            "neutral_or_stable": len(by_direction["neutral_change"]) + len(by_direction["stable"]),
        },
        "_meta": {
            "analyzed_at": datetime.now().isoformat(timespec='seconds'),
        }
    }
