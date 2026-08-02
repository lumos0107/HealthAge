"""계산기 파생지표 → 한국인 또래(성별·연령대) 백분위 비교.

컷오프가 미확립인 5종(TyG·METS-IR·AIP·LAP·VAI)에 "한국인 55세 남성 중 상위 X%"를
붙이기 위한 조회 모듈. 기준분포는 2017년 국가검진(지질 전수측정 = 셀렉션 편향 없음,
약 100만 complete-case)에서 성별×연령대(5세)별로 산출한 백분위 테이블이다.
산출 근거·문헌 대조: 정리/20_16년데이터_ABD분석.

peer_compare.py와 동일한 age_to_code·estimate_percentile 규약을 재사용한다.
"""
import polars as pl
from pathlib import Path
from typing import Optional, Any

from .peer_compare import estimate_percentile

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
STATS_PATH = PROJECT_ROOT / "data" / "stats" / "calculator_percentiles_2017.parquet"
# 연도별 분포(2009~2024). 아래 YEAR_SAFE 지표에만 쓴다 — 이유는 그 주석에.
STATS_16YR_PATH = PROJECT_ROOT / "data" / "stats" / "calculator_percentiles_16yr.parquet"

# 검진 연도의 또래와 견줘도 되는 지표 = **전수 측정되는** 것.
#
# 나머지(지질 기반 8종)는 2017 고정이 맞다. 2018년 지질검사 4년주기 전환 이후
# 지질을 잰 사람만 분모에 들어가는데, 그 부분집합은 이미 관리 중인 쪽으로 쏠려 있다.
# 2026-07-29 재분석 §3-B가 조합 O/E에서 관찰한 것과 같은 편향이고, 표본 수로도 보인다:
#
#   2024년 · 남 55~59세    TyG 16,295 · Non-HDL 16,307   ← 지질: 1/3만 측정
#                          De Ritis 50,466 · MAP 50,466  ← 전수
#
# 그래서 2017(지질 전수측정 마지막 해)을 기준분포로 고정한 것은 실수가 아니라 의도다.
# ⚠️ 어느 해 기준인지는 `peer_year`로 함께 내려보내 화면이 밝힌다.
YEAR_SAFE = {"De_Ritis", "MAP"}
_FALLBACK_YEAR = 2017

# 계산기 item key → parquet indicator 컬럼값 (컷오프 미확립 5종만)
KEY_TO_INDICATOR = {
    "tyg": "TyG",
    "mets_ir": "METS_IR",
    "aip": "AIP",
    "lap": "LAP",
    "vai": "VAI",
    # 아래 5종은 표에 있는데 매핑이 없어 조회되지 않고 있었다(2026-08-03).
    # ⚠️ 이들은 «컷오프가 있는» 지표다. 그래서 또래는 판정을 대신하지 않고 **보조**로만
    #    쓴다 — 화면 결론은 학회 기준(level·interpretation)이 말하고, 백분위는 그 아래
    #    작은 줄이다. 「또래 평균 근처면 괜찮다」로 읽히면 ③층 「또래 자체가 나빠졌나」가
    #    경고하는 바로 그 오독이 된다(기준선이 내려앉은 집단 안의 순위).
    "non_hdl_c": "Non_HDL",
    "castelli_1": "Castelli_I",
    "castelli_2": "Castelli_II",
    "de_ritis": "De_Ritis",
    "map": "MAP",
}

_stats: Optional[pl.DataFrame] = None
_stats16: Optional[pl.DataFrame] = None


def _load() -> pl.DataFrame:
    global _stats
    if _stats is None:
        _stats = pl.read_parquet(STATS_PATH)
    return _stats


def _load16() -> pl.DataFrame:
    global _stats16
    if _stats16 is None:
        _stats16 = pl.read_parquet(STATS_16YR_PATH)
    return _stats16


def _row_for(ind: str, gender: int, code: int, year: Optional[int]):
    """분포 한 줄과 그 기준연도. 전수 측정 지표는 검진 연도로, 나머지는 2017 고정."""
    if ind in YEAR_SAFE and year is not None:
        try:
            df = _load16()
        except Exception:
            df = None
        if df is not None:
            sub = df.filter(
                (pl.col("indicator") == ind)
                & (pl.col("성별코드") == gender)
                & (pl.col("연령대코드(5세단위)") == code)
            )
            if len(sub):
                years = sub["기준년도"].to_list()
                # 그 해가 없으면 가장 가까운 해로 — 없는 값을 지어내지 않되, 표본을 버리지도 않는다.
                pick = min(years, key=lambda y: (abs(y - year), y))
                r = sub.filter(pl.col("기준년도") == pick).row(0, named=True)
                if r["n"] >= 100:
                    return r, pick
    try:
        df = _load()
    except Exception:
        return None, None
    sub = df.filter(
        (pl.col("indicator") == ind)
        & (pl.col("성별코드") == gender)
        & (pl.col("연령대코드(5세단위)") == code)
    )
    if not len(sub):
        return None, None
    r = sub.row(0, named=True)
    return (r, _FALLBACK_YEAR) if r["n"] >= 100 else (None, None)


def _age_to_code(age: int) -> int:
    """실제 나이 → 연령대코드(5세단위). 코드 5=20~24 … 18=85+.
    (2014년 이후 공단 코드 체계와 동일: age//5+1, 5~18로 클램프)."""
    return max(5, min(18, age // 5 + 1))


def peer_percentile(
    key: str,
    value: float,
    gender: int,
    age: Optional[int],
    year: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """컷오프 미확립 5종의 한국인 또래 백분위. 조회 불가 시 None(추정 금지).

    반환: {percentile, peer_label, peer_n, peer_year}
      · percentile: 0~100, 값이 클수록 높음(모두 '높을수록 위험' 지표).
      · peer_label: "한국인 55세 남성 중 상위 15%" 형태.
    """
    ind = KEY_TO_INDICATOR.get(key)
    if ind is None or age is None or gender not in (1, 2):
        return None
    if not isinstance(value, (int, float)):
        return None

    code = _age_to_code(int(age))
    r, ref_year = _row_for(ind, gender, code, year)
    if r is None:
        return None

    pct = estimate_percentile(
        value, r["p10"], r["p25"], r["p50"], r["p75"], r["p90"], r["p95"]
    )
    pct = max(0.0, min(100.0, pct))
    top = 100.0 - pct
    g = "남성" if gender == 1 else "여성"

    if top <= 50:
        label = f"한국인 {int(age)}세 {g} 중 상위 {top:.0f}%"
    else:
        label = f"한국인 {int(age)}세 {g} 중 하위 {pct:.0f}%"

    return {
        "percentile": round(pct, 1),
        "peer_label": label,
        "peer_n": int(r["n"]),
        "peer_year": ref_year,
    }
