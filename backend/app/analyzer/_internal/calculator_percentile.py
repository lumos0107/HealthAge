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


def _load() -> pl.DataFrame:
    global _stats
    if _stats is None:
        _stats = pl.read_parquet(STATS_PATH)
    return _stats


def _age_to_code(age: int) -> int:
    """실제 나이 → 연령대코드(5세단위). 코드 5=20~24 … 18=85+.
    (2014년 이후 공단 코드 체계와 동일: age//5+1, 5~18로 클램프)."""
    return max(5, min(18, age // 5 + 1))


def peer_percentile(
    key: str,
    value: float,
    gender: int,
    age: Optional[int],
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
    try:
        df = _load()
    except Exception:
        return None

    code = _age_to_code(int(age))
    row = df.filter(
        (pl.col("indicator") == ind)
        & (pl.col("성별코드") == gender)
        & (pl.col("연령대코드(5세단위)") == code)
    )
    if len(row) == 0:
        return None
    r = row.row(0, named=True)
    if r["n"] < 100:
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
        "peer_year": 2017,
    }
