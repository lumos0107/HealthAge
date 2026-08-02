"""
사용자 검진 수치 → 모집단 백분위 비교 함수
"""
import polars as pl
from pathlib import Path
from typing import Optional

# 검진 의무 시작 연령 (한국 일반건강검진 기준)
SCREENING_AGE_MIN = {
    "총콜레스테롤": 40,
    "LDL콜레스테롤": 40,
    "HDL콜레스테롤": 40,
    "트리글리세라이드": 40,
    "non_HDL": 40,
}

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
STATS_PATH = PROJECT_ROOT / "data" / "stats" / "peer_stats.parquet"

# 통계 테이블 캐시
_peer_stats: Optional[pl.DataFrame] = None


def load_stats() -> pl.DataFrame:
    """통계 테이블 로드 (한 번만 로드, 이후 캐시)"""
    global _peer_stats
    if _peer_stats is None:
        _peer_stats = pl.read_parquet(STATS_PATH)
    return _peer_stats


def age_to_code(age: int, year: int) -> int:
    """실제 나이 → 연령대코드 변환"""
    if year <= 2013:
        # 코드 1=20~24, 2=25~29, ..., 14=85+
        if age < 20:
            return 1
        if age >= 85:
            return 14
        return (age - 20) // 5 + 1
    else:
        # 코드 1=0~4, 2=5~9, ..., 18=85+
        if age >= 85:
            return 18
        return age // 5 + 1


def estimate_percentile(value: float, p10, p25, p50, p75, p90, p95) -> float:
    """백분위 기준값들 사이에서 사용자 값이 어느 백분위에 해당하는지 선형 보간"""
    breakpoints = [
        (0, p10 - (p25 - p10)),
        (10, p10),
        (25, p25),
        (50, p50),
        (75, p75),
        (90, p90),
        (95, p95),
        (100, p95 + (p95 - p90)),
    ]
    
    for i in range(len(breakpoints) - 1):
        pct_lo, val_lo = breakpoints[i]
        pct_hi, val_hi = breakpoints[i + 1]
        
        if value <= val_hi:
            if val_hi == val_lo:
                return pct_lo
            ratio = (value - val_lo) / (val_hi - val_lo)
            return pct_lo + ratio * (pct_hi - pct_lo)
    
    return 100.0


def compare_to_peers(
    metric: str,
    value: float,
    gender: int,
    age: int,
    year: int = 2024,
) -> dict:
    """
    사용자 수치를 동연령/동성별 모집단과 비교
    
    Args:
        metric: 검사 항목명 (예: "LDL콜레스테롤")
        value: 사용자 측정값
        gender: 1(남) / 2(여)
        age: 만 나이
        year: 비교 기준 연도
    
    Returns:
        백분위 비교 결과 dict (error 키가 있으면 비교 불가)
    """
    stats = load_stats()
    age_code = age_to_code(age, year)
    
    # 검진 의무 연령 체크
    min_age = SCREENING_AGE_MIN.get(metric)
    if min_age and age < min_age:
        return {
            "metric": metric,
            "value": value,
            "error": (
                f"{metric}은(는) 만 {min_age}세부터 일반건강검진 항목입니다. "
                f"{age}세 표본이 부족해 백분위 비교가 어렵습니다."
            ),
            "note": "결과지에 수치가 있다면 개인적으로 추가 검사한 것입니다."
        }
    
    row = stats.filter(
        (pl.col("항목") == metric) &
        (pl.col("기준년도") == year) &
        (pl.col("성별코드") == gender) &
        (pl.col("연령대코드(5세단위)") == age_code)
    )
    
    if len(row) == 0:
        return {"error": f"비교 데이터 없음: {metric}, {age}세"}
    
    r = row.row(0, named=True)
    
    if r["n"] < 100:
        return {
            "metric": metric,
            "value": value,
            "error": (
                f"비교군 표본이 너무 작아 신뢰할 수 없음 (n={r['n']}). "
                f"{metric}은(는) 이 연령대에서 거의 측정되지 않는 항목일 수 있습니다."
            )
        }
    
    percentile = estimate_percentile(
        value, r["p10"], r["p25"], r["p50"],
        r["p75"], r["p90"], r["p95"]
    )
    
    if percentile < 10:
        interp = f"하위 {percentile:.0f}% (매우 낮은 편)"
    elif percentile < 25:
        interp = f"하위 {percentile:.0f}% (낮은 편)"
    elif percentile < 75:
        interp = f"중간 ({percentile:.0f}%분위)"
    elif percentile < 90:
        interp = f"상위 {100-percentile:.0f}% (높은 편)"
    else:
        interp = f"상위 {100-percentile:.0f}% (매우 높은 편)"
    
    return {
        "metric": metric,
        "value": value,
        "percentile": round(percentile, 1),
        "interpretation": interp,
        "group_mean": r["mean"],
        "group_p50": r["p50"],
        "diff_from_mean": round(value - r["mean"], 2),
        "n_in_group": r["n"],
    }

def peer_median(metric: str, gender: int, age: Optional[int], year: int = 2017) -> Optional[float]:
    """같은 성별·연령대의 그 항목 중앙값(p50). 없으면 None(추정 금지).

    쓰임 — 계산기가 «어느 입력이 이 값을 끌어올렸나»를 가릴 때 기준점이 된다.
    TyG처럼 두 수치를 곱해 만든 값은 결과만 봐서는 무엇 때문에 높은지 알 수 없는데,
    각 입력을 또래 중앙값으로 바꿔 보면 어느 쪽이 더 크게 기여했는지 정확히 나온다.
    """
    if age is None:
        return None
    try:
        stats = load_stats()
    except Exception:
        return None
    code = age_to_code(age, year)
    row = stats.filter(
        (pl.col("항목") == metric)
        & (pl.col("기준년도") == year)
        & (pl.col("성별코드") == gender)
        & (pl.col("연령대코드(5세단위)") == code)
    )
    if len(row) == 0:
        return None
    r = row.row(0, named=True)
    if r["n"] < 100 or not r["p50"]:
        return None
    return float(r["p50"])
