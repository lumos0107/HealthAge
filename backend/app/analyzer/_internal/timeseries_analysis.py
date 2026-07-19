"""사용자 시계열 분석 (격리됨, backend 통합용).

원본: scripts/timeseries_analysis.py
변경 사항:
- 진입점 시그니처: analyze_timeseries(user_info: dict, history: list) -> dict
  (백엔드가 DB에서 history를 조회해서 넘김)
- file I/O 함수 제거 (load_users, collect_user_history, save_*, main 등)
- mkdir 제거 (격리 규칙)
- 상대 import 적용
"""
import polars as pl
from pathlib import Path
from typing import Optional
from datetime import datetime

from .peer_compare import age_to_code


# backend/app/analyzer/_internal/ → backend/ 까지 4단계
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
CHANGE_STATS_PATH = PROJECT_ROOT / "data" / "stats" / "change_stats.parquet"

_change_stats: Optional[pl.DataFrame] = None


# ============================================================
# 검진 주기 관련 함수
# ============================================================
def get_expected_exam_years(birth_year: int, start_year: int, end_year: int) -> list:
    """출생연도 홀짝 기준 정기 검진 예정 연도 목록"""
    parity = birth_year % 2
    return [y for y in range(start_year, end_year + 1) if y % 2 == parity]


def next_expected_exam_year(birth_year: int, after_year: Optional[int] = None) -> int:
    """다음 정기 검진 예정 연도"""
    if after_year is None:
        after_year = datetime.now().year
    
    parity = birth_year % 2
    y = after_year + 1
    while y % 2 != parity:
        y += 1
    return y


def classify_exam_pattern(birth_year: int, exam_years: list) -> dict:
    """검진 패턴 분류 + 누락/추가 분석"""
    if not exam_years:
        return {
            "parity": "홀수년 검진" if birth_year % 2 == 1 else "짝수년 검진",
            "expected_in_range": [],
            "actual": [],
            "missed": [],
            "extra": [],
            "next_expected": next_expected_exam_year(birth_year),
        }
    
    sorted_years = sorted(exam_years)
    expected = get_expected_exam_years(birth_year, sorted_years[0], sorted_years[-1])
    expected_set = set(expected)
    actual_set = set(sorted_years)
    
    return {
        "parity": "홀수년 검진" if birth_year % 2 == 1 else "짝수년 검진",
        "expected_in_range": expected,
        "actual": sorted_years,
        "missed": sorted(expected_set - actual_set),
        "extra": sorted(actual_set - expected_set),
        "next_expected": next_expected_exam_year(birth_year, sorted_years[-1]),
    }


# ============================================================
# 데이터 로드
# ============================================================
def load_change_stats() -> pl.DataFrame:
    global _change_stats
    if _change_stats is None:
        _change_stats = pl.read_parquet(CHANGE_STATS_PATH)
    return _change_stats


# ============================================================
# 모집단 변화량 조회
# ============================================================
def get_population_change(metric: str, gender: int, age: int,
                          from_year: int, to_year: int) -> Optional[float]:
    """from_year → to_year 사이의 모집단 평균 변화량 누적"""
    if from_year >= to_year:
        return None
    
    stats = load_change_stats()
    total_change = 0.0
    found_any = False
    
    for year in range(from_year + 1, to_year + 1):
        years_diff_to_now = to_year - year
        age_at_year = age - years_diff_to_now
        code_at_year = age_to_code(age_at_year, year)
        
        row = stats.filter(
            (pl.col("항목") == metric) &
            (pl.col("기준년도") == year) &
            (pl.col("성별코드") == gender) &
            (pl.col("연령대코드(5세단위)") == code_at_year)
        )
        
        if len(row) > 0:
            change = row.row(0, named=True)["mean_change"]
            if change is not None:
                total_change += change
                found_any = True
    
    return round(total_change, 2) if found_any else None


# ============================================================
# 변화량 비교
# ============================================================
def compare_change(user_change: float, pop_change: Optional[float],
                   metric: str, n_years: int) -> str:
    """본인 변화 vs 모집단 변화 → 텍스트 해석"""
    if pop_change is None:
        return "모집단 데이터 없음"
    
    if abs(user_change) < 0.5 * (n_years / 2):
        return "변화 없음"
    
    is_higher_better = (metric == "HDL콜레스테롤")
    
    if is_higher_better:
        if user_change > 0 and user_change > pop_change + 2:
            return "평균보다 빠른 개선"
        elif user_change > 0:
            return "약간 개선"
        elif user_change < pop_change - 2:
            return "평균보다 빠른 악화"
        else:
            return "평균 수준 변화"
    else:
        if user_change > pop_change + 2:
            return "평균보다 빠른 악화"
        elif user_change > 0 and abs(user_change - pop_change) <= 2:
            return "평균 수준 변화"
        elif user_change < pop_change - 2:
            return "평균보다 빠른 개선"
        elif user_change < 0:
            return "약간 개선"
        else:
            return "평균 수준 변화"


# ============================================================
# 메인 분석 함수
# ============================================================
def analyze_timeseries(user_info: dict, history: list) -> dict:
    """사용자 시계열 종합 분석.

    Args:
        user_info: {"user_id", "name", "gender", "birth_year", ...}
        history:   여러 회차 검진 데이터.
                   각 항목 = {"year": int, "checkup": {"BMI": ..., "수축기혈압": ..., ...}}
                   백엔드가 DB의 checkup_records + analysis_results.basic_report에서 조립.

    Returns:
        시계열 분석 결과 dict.
        history < 2 이면 error 필드 포함 + exam_pattern (가능한 안내) 반환.
    """
    if not user_info:
        return {"error": "사용자 정보 없음"}

    user_id = user_info.get("user_id")
    gender = user_info["gender"]
    birth_year = user_info["birth_year"]

    if len(history) < 2:
        exam_years = [h["year"] for h in history]
        pattern = classify_exam_pattern(birth_year, exam_years)
        return {
            "error": f"시계열 분석엔 2개 이상의 검진 데이터가 필요합니다 (현재 {len(history)}개)",
            "user_id": user_id,
            "user_name": user_info.get("name"),
            "exam_pattern": pattern,
        }
    
    years = [h["year"] for h in history]
    from_year = years[0]
    to_year = years[-1]
    n_years = to_year - from_year
    current_age = to_year - birth_year
    
    exam_pattern = classify_exam_pattern(birth_year, years)
    
    # 공통 항목
    all_metrics = set(history[0]["checkup"].keys())
    for h in history[1:]:
        all_metrics &= set(h["checkup"].keys())
    
    target_metrics = {
        "BMI", "허리둘레", "수축기혈압", "이완기혈압", "맥압",
        "식전혈당(공복혈당)",
        "총콜레스테롤", "LDL콜레스테롤", "HDL콜레스테롤", "트리글리세라이드", "non_HDL",
        "혈색소", "혈청크레아티닌",
        "혈청지오티(AST)", "혈청지피티(ALT)", "감마지티피", "AST_ALT비",
    }
    analyzable = all_metrics & target_metrics
    
    metrics_analysis = {}
    highlights = []
    
    for metric in sorted(analyzable):
        value_pairs = []
        for h in history:
            v = h["checkup"].get(metric)
            if v is None:
                continue
            try:
                value_pairs.append((h["year"], float(v)))
            except (ValueError, TypeError):
                continue
        
        if len(value_pairs) < 2:
            continue
        
        values = [v for _, v in value_pairs]
        value_years = [y for y, _ in value_pairs]
        actual_span = value_years[-1] - value_years[0]
        
        user_change = round(values[-1] - values[0], 2)
        annual_change = round(user_change / actual_span, 2) if actual_span > 0 else 0
        
        pop_change = get_population_change(
            metric, gender, current_age, value_years[0], value_years[-1]
        )
        
        comparison = compare_change(user_change, pop_change, metric, actual_span)
        
        if user_change > 0:
            trend = "상승"
        elif user_change < 0:
            trend = "하락"
        else:
            trend = "변화 없음"
        
        metrics_analysis[metric] = {
            "values": values,
            "years": value_years,
            "span_years": actual_span,
            "user_change": user_change,
            "annual_change": annual_change,
            "population_change": pop_change,
            "comparison": comparison,
            "trend": trend,
        }
        
        # Highlights
        if pop_change is not None and abs(pop_change) > 0.1:
            ratio = abs(user_change) / max(abs(pop_change), 0.1)
            if ratio >= 2.5 and abs(user_change) >= 5:
                direction = "증가" if user_change > 0 else "감소"
                highlights.append({
                    "metric": metric,
                    "type": "빠른 변화",
                    "severity": "high" if ratio >= 4 else "medium",
                    "message": (
                        f"{metric}이(가) {actual_span}년간 {direction} 폭이 "
                        f"같은 연령대 평균({pop_change:+.1f})보다 큽니다 "
                        f"(본인 {user_change:+.1f})"
                    )
                })
        
        if len(values) >= 3:
            increasing = all(values[i] <= values[i+1] for i in range(len(values)-1))
            decreasing = all(values[i] >= values[i+1] for i in range(len(values)-1))
            is_higher_better = (metric == "HDL콜레스테롤")
            
            if increasing and user_change >= 5:
                msg_type = "지속 악화" if not is_higher_better else "지속 개선"
                highlights.append({
                    "metric": metric,
                    "type": msg_type,
                    "severity": "high",
                    "message": (
                        f"{metric}이(가) {len(values)}회 연속 상승 중입니다 "
                        f"({values[0]} → {values[-1]})"
                    )
                })
            elif decreasing and user_change <= -5:
                msg_type = "지속 악화" if is_higher_better else "지속 개선"
                highlights.append({
                    "metric": metric,
                    "type": msg_type,
                    "severity": "high",
                    "message": (
                        f"{metric}이(가) {len(values)}회 연속 하락 중입니다 "
                        f"({values[0]} → {values[-1]})"
                    )
                })
    
    return {
        "user_id": user_id,
        "user_name": user_info.get("name"),
        "gender": "남" if gender == 1 else "여",
        "current_age": current_age,
        "years": years,
        "year_range": f"{from_year}~{to_year} ({n_years}년간)",
        "exam_pattern": exam_pattern,
        "metrics": metrics_analysis,
        "highlights": highlights,
        "_meta": {
            "analyzed_at": datetime.now().isoformat(timespec='seconds'),
            "history_count": len(history),
        }
    }
