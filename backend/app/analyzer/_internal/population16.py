"""16년(2009~2024, 1,596만 행) 모집단 통계 조회.

산출: 정리/데이터_16년5축분석/stats16_build.py → data/stats/*_16yr.parquet
분석 근거·한계: 정리/28_16년1596만_5축전면분석_2026-07-29.md

여기서 하는 일은 **조회뿐**이다. 새 판정을 만들지 않는다.
개인 결과에 "같은 조건인 사람들이 모집단에서 어땠는지"만 붙여준다.

⚠️ 원자료에 약물 복용 정보가 없다 → 모집단 유병률은 '수치 기준만'.
   제품 판정은 "수치 OR 약 복용"이라 항상 모집단보다 넓게 잡힌다(응답 note에 명시).
⚠️ 지질 기반은 2018년부터 측정율이 34%로 떨어졌고, 측정 여부가 질환 유무와 상관돼
   '측정자 한정' 집계는 O/E를 끌어내린다(트라이어드 2017년 2.97 → 2018년 2.29로 불연속 하락,
   이후 평평). 그래서 지질 조합은 전원 측정 시기인 2009~2017년만 쓴다.
⚠️ 흡연은 2019년 원자료 코딩 오류(현재/과거 병합)로 그 해를 제외했다.
⚠️ 음주는 2019년 이전 결측이라 2020~2024 5년만.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import polars as pl

logger = logging.getLogger(__name__)

STATS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "stats"

_cache: dict[str, pl.DataFrame] = {}

# 흡연 관련 조합 — 2019년 원자료 결함으로 집계에서 뺀다.
_SMOKE_COMBOS = {"대사증후군+흡연", "흡연+음주+비만"}

# 지질(이상지질혈증·대사증후군)이 들어간 조합 — 전원 측정 시기만 쓴다.
#
# 2018년부터 지질검사가 선택 항목이 되며 측정율이 34%로 떨어졌고, 검사를 받는 사람이
# 이미 당뇨·고혈압 관리 중인 쪽으로 쏠려 있다. 그 부분집합에서 O/E를 세면 구성요소가
# 서로 덜 연관돼 보여 값이 눌린다. 연도별로 보면 정책이 바뀐 해에 정확히 계단이 생긴다:
#     트라이어드 2009~2017 = 2.93~3.09 (n_eval 약 100만)
#                2018~2024 = 2.18~2.43 (n_eval 약 34만)
# 실제 역학 변화가 1년 만에 23% 점프하고 그 뒤 평평할 수는 없다 → 선택편향으로 본다.
# 그래서 지질 조합은 2009~2017년(전원 측정)만 집계한다. 범위도 훨씬 좁아진다
# (트라이어드 2.18~3.09 → 2.93~3.09).
_LIPID_COMBOS = {
    "고혈압+이상지질혈증", "당뇨+이상지질혈증", "대사증후군+흡연", "대사증후군+비만",
    "당뇨+고혈압+이상지질혈증", "비만+이상지질혈증+지방간의심",
}

# 지질검사가 사실상 전원에게 실시된 마지막 해.
_LIPID_FULL_MEASURE_LAST_YEAR = 2017


def _load(name: str) -> Optional[pl.DataFrame]:
    """통계 parquet 로드(1회, 이후 캐시). 파일이 없으면 None — 기능만 조용히 빠진다."""
    if name in _cache:
        return _cache[name]
    path = STATS_DIR / f"{name}.parquet"
    if not path.exists():
        logger.warning("population16: %s 없음 — 16년 통계 생략", path.name)
        return None
    _cache[name] = pl.read_parquet(path)
    return _cache[name]


def age_to_code(age: int) -> int:
    """실제 나이 → 연령대코드(5세단위). 5=20~24 … 18=85+ (공단 코드 체계)."""
    return max(5, min(18, age // 5 + 1))


def age_band_label(code: int) -> str:
    if code >= 18:
        return "85세 이상"
    lo = (code - 1) * 5
    return f"{lo}~{lo + 4}세"


# ──────────────────────────────────────────────────────────────────
# ① 조합 그룹 — 16년 O/E (중앙값·범위)
# ──────────────────────────────────────────────────────────────────

def combo_oe_16yr(combo_names: list[str]) -> dict[str, dict[str, Any]]:
    """해당한 조합들의 16년 O/E 요약.

    한 해 단면값 하나보다 "16년간 2.2~3.1배로 꾸준했다"가 훨씬 강한 근거다.
    """
    df = _load("combo_groups_16yr")
    if df is None or not combo_names:
        return {}

    out: dict[str, dict[str, Any]] = {}
    for name in combo_names:
        sub = df.filter(pl.col("combo") == name)
        if name in _SMOKE_COMBOS:
            sub = sub.filter(pl.col("year") != 2019)
        if name in _LIPID_COMBOS:
            sub = sub.filter(pl.col("year") <= _LIPID_FULL_MEASURE_LAST_YEAR)
        sub = sub.filter(pl.col("observed_to_expected").is_not_null())
        if sub.height == 0:
            continue
        oe = sub["observed_to_expected"]
        years = sorted(sub["year"].to_list())
        out[name] = {
            "median": round(float(oe.median()), 2),
            "min": round(float(oe.min()), 2),
            "max": round(float(oe.max()), 2),
            "n_years": len(years),
            "year_from": years[0],
            "year_to": years[-1],
            # 지질검사 전원 측정 시기(2009~2017)만 쓴 조합인지 — 화면에서 기준을 밝히는 데 쓴다.
            "lipid_era_only": name in _LIPID_COMBOS,
            # 연도별 값 — 화면에서 흐름을 그릴 수 있게
            "by_year": [
                {"year": r[0], "oe": r[1]}
                for r in sub.select(["year", "observed_to_expected"]).sort("year").rows()
            ],
        }
    return out


# ──────────────────────────────────────────────────────────────────
# ② 관리 참고군 — 몇 개나 걸렸는지의 모집단 분포
# ──────────────────────────────────────────────────────────────────

def care_group_distribution(sex: int, age: int, year: int = 2024) -> dict[str, Any]:
    """같은 성별·연령대에서 '참고군별 벗어난 항목 수' 분포.

    앱은 "5개 항목 중 5개 해당"이라고만 말한다. 여기에
    "5개 다 걸린 사람은 100명 중 1.3명"을 붙이면 처음으로 모집단 근거가 생긴다.
    """
    df = _load("care_groups_16yr")
    if df is None:
        return {}

    sub = df.filter(
        (pl.col("기준년도") == year)
        & (pl.col("성별코드") == sex)
        & (pl.col("연령대코드(5세단위)") == age_to_code(age))
    )
    if sub.height == 0:
        return {}

    out: dict[str, Any] = {}
    for name in sub["care_group"].unique().to_list():
        g = sub.filter(pl.col("care_group") == name).sort("hits")
        total = int(g["n"].sum())
        if total == 0:
            continue
        rows = [{"hits": int(r[0]), "n": int(r[1]), "pct": round(r[1] / total * 100, 1)}
                for r in g.select(["hits", "n"]).rows()]
        out[name] = {"total": total, "dist": rows}
    return out


def care_group_rank(dist: dict[str, Any], care_group: str, hits: int) -> Optional[dict[str, Any]]:
    """내 '걸린 개수'가 모집단에서 어느 위치인지 — 같은 개수 비율 + 나보다 많이 걸린 비율."""
    g = dist.get(care_group)
    if not g:
        return None
    same = next((r["pct"] for r in g["dist"] if r["hits"] == hits), 0.0)
    worse = sum(r["pct"] for r in g["dist"] if r["hits"] > hits)
    return {
        "hits": hits,
        "pct_same": round(same, 1),
        "pct_worse": round(worse, 1),
        # 나보다 상태가 같거나 나쁜 사람 비율 = 상위 몇 %인지
        "pct_at_or_worse": round(same + worse, 1),
    }


# ──────────────────────────────────────────────────────────────────
# ③ 단일 집단군 — 같은 또래의 유병률 + 연령 고정 16년 변화
# ──────────────────────────────────────────────────────────────────

# 앱에 의미 있는 그룹만. 흡연/음주는 연도 제약이 달라 별도 취급.
_TREND_GROUPS = {
    "g_obesity": "비만",
    "g_pre_diabetes": "당뇨 전단계",
    "g_pre_hypertension": "고혈압 전단계",
    "g_diabetes": "당뇨",
    "g_fatty_liver_suspect": "지방간 의심",
    "g_hypertension": "고혈압",
    "g_dyslipidemia": "이상지질혈증",
    "g_metabolic_syndrome": "대사증후군",
}
# 여기 있는 것은 전부 «수치 기준» 임상군이다. parquet에는 13개가 다 있지만
# 흡연 3종(현재·과거·비흡연)과 음주 2종은 일부러 넣지 않는다 —
# 이것들은 문진 기반 **행동**이라, 「또래 100명 중 32명이 흡연해요」가 판단을 돕기보다
# 「나만 그런 게 아니네」로 읽혀 행동을 막는다. 유병률은 상태를 상대화할 때 쓰는 것이지
# 행동을 상대화할 때 쓰는 것이 아니다.
# (`g_pre_hypertension`은 당뇨 전단계가 이미 있는데 혼자 빠져 있던 누락이다 — 2026-08-03 추가.)


def peer_prevalence(sex: int, age: int, year: int = 2024) -> dict[str, Any]:
    """같은 성별·연령대의 집단군 유병률(수치 기준)."""
    df = _load("single_groups_16yr")
    if df is None:
        return {}
    code = age_to_code(age)
    sub = df.filter(
        (pl.col("year") == year) & (pl.col("sex") == sex) & (pl.col("age_code") == code)
    )
    out = {}
    for r in sub.select(["group", "n_yes", "n_eval"]).rows():
        g, yes, ev = r
        if g not in _TREND_GROUPS or not ev:
            continue
        out[g] = {"name": _TREND_GROUPS[g], "pct": round(yes / ev * 100, 1), "n_eval": int(ev)}
    return out


def age_fixed_trend(sex: int, age: int) -> dict[str, Any]:
    """⭐ 같은 나이대의 2009 vs 2024 — 고령화 효과를 제거한 '세대 악화' 근거.

    28번 문서 §4: 55~59세 남성 비만 21.0%→46.1%(2.2배), 지방간 의심 11.9%→25.1%.
    인구 구성 변화가 아니라 같은 나이대 자체가 나빠졌다는 뜻이라,
    "또래 중 몇 등"이 '기준선이 내려앉은 집단 안에서의 순위'임을 보여준다.
    """
    df = _load("single_groups_16yr")
    if df is None:
        return {}
    code = age_to_code(age)
    sub = df.filter(
        (pl.col("sex") == sex)
        & (pl.col("age_code") == code)
        & (pl.col("year").is_in([2009, 2024]))
        & (pl.col("group").is_in(list(_TREND_GROUPS)))
    ).with_columns(
        (pl.col("n_yes") / pl.col("n_eval") * 100).alias("pct")
    )
    if sub.height == 0:
        return {}

    items = []
    for g, label in _TREND_GROUPS.items():
        rows = {r[0]: r[1] for r in sub.filter(pl.col("group") == g).select(["year", "pct"]).rows()}
        a, b = rows.get(2009), rows.get(2024)
        if a is None or b is None or a <= 0:
            continue
        items.append({
            "group": g, "name": label,
            "y2009": round(a, 1), "y2024": round(b, 1),
            "diff": round(b - a, 1), "ratio": round(b / a, 2),
        })
    # 악화 폭이 큰 순
    items.sort(key=lambda x: x["diff"], reverse=True)
    return {
        "age_band": age_band_label(code),
        "sex": "남성" if sex == 1 else "여성",
        "items": items,
    }


# ──────────────────────────────────────────────────────────────────
# 통합 — 분석 응답에 실을 payload 한 덩어리
# ──────────────────────────────────────────────────────────────────

DISCLAIMER = (
    "국민건강보험공단 표본 2009~2024년 15,957,665건을 재분석한 모집단 통계입니다. "
    "원자료에 약 복용 정보가 없어 모집단 유병률은 '검진 수치 기준'이며, "
    "서비스 판정('수치 또는 해당 약 복용')보다 좁게 잡힙니다. "
    "개인식별자가 없어 연도별 독립 단면이므로 개인의 경과가 아니라 집단 비교입니다. "
    "지질검사가 들어간 조합은 검사가 전원에게 실시된 2009~2017년만 집계했습니다."
)


def build_population16(
    sex: Optional[int],
    age: Optional[int],
    matched_combos: Optional[list[str]] = None,
) -> Optional[dict[str, Any]]:
    """16년 모집단 통계 묶음. 성별·나이를 모르면 조합 O/E만 담는다."""
    try:
        combos = combo_oe_16yr(matched_combos or [])
        payload: dict[str, Any] = {
            "source": {
                "years": "2009~2024",
                "total_rows": 15957665,
                "label": "국민건강보험공단 표본 1,596만 건",
            },
            "combo_oe": combos,
            "disclaimer": DISCLAIMER,
        }
        if sex in (1, 2) and isinstance(age, int) and age > 0:
            payload["peer_prevalence"] = peer_prevalence(sex, age)
            payload["age_fixed_trend"] = age_fixed_trend(sex, age)
            payload["care_distribution"] = care_group_distribution(sex, age)
        # 아무것도 못 채웠으면 굳이 빈 껍데기를 내려보내지 않는다.
        if not combos and not payload.get("peer_prevalence"):
            return None
        return payload
    except Exception:
        logger.exception("population16 생성 실패 — 이 기능만 생략")
        return None
