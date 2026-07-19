"""조합 그룹(복합 질환군) 분석 — 발표 수치를 실서비스에 연결하는 모듈.

`health_project/scripts/combo_group_analysis.py`(모집단 분석)에서 조합 정의를 이식하고,
그 산출물 `combo_groups.json`(2024년 공단 표본 994,018명)을 참조해
"당신은 이 조합에 해당하며, 이 조합은 모집단에서 이런 특성을 보입니다"를 제시한다.

핵심 지표 O/E비(observed_to_expected):
    각 요소가 독립이라면 기대되는 동반 빈도 대비 실제 관찰 빈도.
    1.0=독립, >1.0=같이 다니는 경향(시너지).
    예) 메타볼릭 트라이어드(당뇨+고혈압+이상지질혈증) O/E=2.93

⚠️ 모집단 통계와 서비스 판정의 기준 차이 (의도된 차이, 반드시 인지할 것)
    모집단 통계는 공단 원자료로 계산돼 다음 두 가지가 서비스와 다르다:
      1) 지방간 의심: 모집단 GGT>60  /  서비스 GGT>75 (약대 자문 v2로 상향)
      2) 약물 복용: 모집단은 약물 정보가 없어 수치만으로 판정.
         서비스는 "수치 OR 해당 약물 복용"으로 판정.
    따라서 서비스 판정이 모집단보다 약간 더 넓게(약물 복용자 포함) 잡힌다.
    모집단을 재계산해 맞출 수도 있으나 그러면 발표에 쓰는 수치가 바뀌므로,
    차이를 숨기지 않고 응답의 `caveats`로 명시해 내보낸다.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
COMBO_STATS_PATH = PROJECT_ROOT / "data" / "combo_groups.json"


# ============================================================
# 조합 정의 12개 (모집단 분석 스크립트와 동일한 이름·구성)
# ============================================================
# combo_name은 combo_groups.json의 키와 정확히 일치해야 통계가 붙는다.

COMBO_DEFINITIONS: dict[str, dict[str, Any]] = {
    # A. 심혈관 위험 조합
    "당뇨+고혈압": {
        "components": ["g_diabetes", "g_hypertension"],
        "category": "심혈관",
        "meaning": "당뇨 합병증 위험 가중 (신장, 심혈관)",
    },
    "고혈압+이상지질혈증": {
        "components": ["g_hypertension", "g_dyslipidemia"],
        "category": "심혈관",
        "meaning": "동맥경화 가속화",
    },
    "당뇨+이상지질혈증": {
        "components": ["g_diabetes", "g_dyslipidemia"],
        "category": "심혈관",
        "meaning": "당뇨성 이상지질혈증",
    },
    "대사증후군+흡연": {
        "components": ["g_metabolic_syndrome", "g_smoker_current"],
        "category": "심혈관",
        "meaning": "심혈관 위험 매우 증가",
    },
    # B. 간 질환 조합
    "음주+지방간의심": {
        "components": ["g_drinker", "g_fatty_liver_suspect"],
        "category": "간 질환",
        "meaning": "알코올성 지방간 의심",
    },
    "비만+지방간의심": {
        "components": ["g_obesity", "g_fatty_liver_suspect"],
        "category": "간 질환",
        "meaning": "대사이상 관련 지방간 (MASLD)",
    },
    "당뇨+지방간의심": {
        "components": ["g_diabetes", "g_fatty_liver_suspect"],
        "category": "간 질환",
        "meaning": "지방간 + 당뇨 (지방간염 진행 위험)",
    },
    # C. 대사 조합
    "비만+당뇨전단계": {
        "components": ["g_obesity", "g_pre_diabetes"],
        "category": "대사",
        "meaning": "당뇨 진행 위험군",
    },
    "대사증후군+비만": {
        "components": ["g_metabolic_syndrome", "g_obesity"],
        "category": "대사",
        "meaning": "대사 이상 가중",
    },
    # D. 다중 위험 조합 (3개)
    "흡연+음주+비만": {
        "components": ["g_smoker_current", "g_drinker", "g_obesity"],
        "category": "생활습관 트리플",
        "meaning": "생활습관 위험 가중",
    },
    "당뇨+고혈압+이상지질혈증": {
        "components": ["g_diabetes", "g_hypertension", "g_dyslipidemia"],
        "category": "메타볼릭 트라이어드",
        "meaning": "전형적인 대사 위험 조합",
    },
    "비만+이상지질혈증+지방간의심": {
        "components": ["g_obesity", "g_dyslipidemia", "g_fatty_liver_suspect"],
        "category": "메타볼릭 트리오",
        "meaning": "대사이상 지방간 증후군 패턴",
    },
}


# ASCVD(동맥경화성 심혈관질환) 고위험으로 보는 조합.
# ⚠️ 이건 ASCVD 10년 위험도 "계산"이 아니라, 학회 지침이 고위험군으로 분류하는
#    위험인자 동반 패턴에 해당하는지를 보는 것이다. 점수 산출과 혼동하지 말 것.
ASCVD_RISK_COMBOS = {
    "당뇨+고혈압",
    "고혈압+이상지질혈증",
    "당뇨+이상지질혈증",
    "대사증후군+흡연",
    "당뇨+고혈압+이상지질혈증",
}

# 그룹 id → 한글 라벨 (모집단 스크립트와 동일)
GROUP_LABELS = {
    "g_hypertension": "고혈압",
    "g_diabetes": "당뇨",
    "g_pre_diabetes": "당뇨 전단계",
    "g_metabolic_syndrome": "대사증후군",
    "g_obesity": "비만",
    "g_dyslipidemia": "이상지질혈증",
    "g_fatty_liver_suspect": "지방간 의심",
    "g_smoker_current": "현재 흡연자",
    "g_drinker": "음주자",
}


# ============================================================
# 모집단 통계 로딩 (캐시)
# ============================================================

_combo_stats: Optional[dict[str, Any]] = None


def load_combo_stats() -> dict[str, Any]:
    """combo_groups.json 로드. 파일이 없으면 빈 통계로 동작(판정은 계속 가능)."""
    global _combo_stats
    if _combo_stats is None:
        try:
            with open(COMBO_STATS_PATH, encoding="utf-8") as f:
                _combo_stats = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"[ComboGroup] 모집단 통계 로드 실패 ({type(e).__name__}) "
                  f"— 판정만 수행하고 통계는 생략합니다: {COMBO_STATS_PATH}")
            _combo_stats = {"year": None, "total_n": None, "combo_groups": []}
    return _combo_stats


def _stats_by_name() -> dict[str, dict[str, Any]]:
    stats = load_combo_stats()
    return {c["combo_name"]: c for c in stats.get("combo_groups", [])}


# ============================================================
# 조합 판정
# ============================================================

def _evaluate_components(
    user_groups: dict[str, bool],
    components: list[str],
) -> tuple[str, list[str], list[str]]:
    """조합의 구성요소 충족 여부 판정.

    Returns:
        (status, met_labels, missing_labels)
        status: "matched" | "not_matched" | "not_evaluable"

    판정 불가(not_evaluable)를 not_matched와 구분하는 이유:
        검사를 안 해서 모르는 것과, 검사해서 해당 없는 것은 전혀 다르다.
        예) 흡연 정보가 없으면 "흡연 조합 아님"이 아니라 "판정 불가"다.
    """
    met: list[str] = []
    unknown: list[str] = []
    unmet: list[str] = []

    for comp in components:
        label = GROUP_LABELS.get(comp, comp)
        if comp not in user_groups or user_groups[comp] is None:
            unknown.append(label)
        elif user_groups[comp]:
            met.append(label)
        else:
            unmet.append(label)

    if unmet:
        # 하나라도 확실히 아니면 조합 아님 (모르는 항목이 있어도 결론은 같다)
        return "not_matched", met, unknown
    if unknown:
        # 확실히 아닌 건 없는데 모르는 게 있음 → 판정 불가
        return "not_evaluable", met, unknown
    return "matched", met, unknown


def classify_combo_groups(user_groups: dict[str, bool]) -> dict[str, Any]:
    """사용자가 어떤 조합 그룹에 해당하는지 판정하고 모집단 통계를 붙인다.

    Args:
        user_groups: user_group_analysis.classify_user_groups 결과.

    Returns:
        {
          "matched": [ {combo_name, category, meaning, components,
                        population: {n, pct_of_total, observed_to_expected,
                                     expected_n_if_independent, top_metrics},
                        is_ascvd_risk: bool}, ... ],   # O/E 내림차순
          "not_evaluable": [ {combo_name, met, missing}, ... ],
          "matched_count": int,
          "ascvd_risk_combos": [combo_name, ...],
          "highest_synergy": {...} | None,
          "population": {"year": 2024, "total_n": 994018},
          "caveats": [...],
        }
    """
    stats_map = _stats_by_name()
    stats_root = load_combo_stats()

    matched: list[dict[str, Any]] = []
    not_evaluable: list[dict[str, Any]] = []

    for combo_name, info in COMBO_DEFINITIONS.items():
        status, met, missing = _evaluate_components(user_groups, info["components"])

        if status == "not_evaluable":
            not_evaluable.append({
                "combo_name": combo_name,
                "category": info["category"],
                "met": met,
                "missing": missing,
                "reason": f"{', '.join(missing)} 정보가 없어 판정할 수 없습니다.",
            })
            continue

        if status != "matched":
            continue

        pop = stats_map.get(combo_name)
        entry: dict[str, Any] = {
            "combo_name": combo_name,
            "category": info["category"],
            "meaning": info["meaning"],
            "components": [GROUP_LABELS.get(c, c) for c in info["components"]],
            "is_ascvd_risk": combo_name in ASCVD_RISK_COMBOS,
            "population": None,
        }
        if pop:
            entry["population"] = {
                "n_in_combo": pop.get("n_in_combo"),
                "pct_of_total": pop.get("pct_of_total"),
                "expected_n_if_independent": pop.get("expected_n_if_independent"),
                "observed_to_expected": pop.get("observed_to_expected"),
                "top_metrics": pop.get("top_metrics", [])[:3],
            }
        matched.append(entry)

    # O/E 높은 순 = 시너지가 큰 조합 먼저 (통계 없으면 뒤로)
    matched.sort(
        key=lambda e: (e["population"] or {}).get("observed_to_expected") or 0,
        reverse=True,
    )

    ascvd = [e["combo_name"] for e in matched if e["is_ascvd_risk"]]

    return {
        "matched": matched,
        "not_evaluable": not_evaluable,
        "matched_count": len(matched),
        "ascvd_risk_combos": ascvd,
        "highest_synergy": matched[0] if matched else None,
        "population": {
            "year": stats_root.get("year"),
            "total_n": stats_root.get("total_n"),
            "source": "국민건강보험공단 표본 (최신 연도)",
        },
        "caveats": _caveats(),
    }


def _caveats() -> list[str]:
    return [
        "모집단 통계는 공단 원자료 기준이라 약물 복용 정보가 없습니다. "
        "서비스 판정은 '수치 또는 해당 약물 복용'을 함께 보므로, "
        "약을 드시는 분은 모집단 기준보다 넓게 잡힐 수 있습니다.",
        "모집단의 지방간 의심 기준은 GGT>60이고 서비스 기준은 GGT>75입니다 "
        "(약대 자문 반영). 두 기준이 달라 비교 시 참고가 필요합니다.",
        "O/E비는 '함께 나타나는 경향'을 뜻하며 인과관계나 개인의 위험도 예측이 아닙니다.",
    ]


# ============================================================
# 지방간 유형 구분 (MASLD / ALD)
# ============================================================
# 2023년 국제 합의로 NAFLD → MASLD(대사이상 관련 지방간)로 용어가 바뀌었다.
#   MASLD: 지방간 + 심대사 위험인자 1개 이상 + 과음 아님
#   ALD  : 지방간 + 과음 (주당 순알코올 남 210g / 여 140g 초과)
#   MetALD: 둘 다 해당하는 중간 구간
#
# ⚠️ 현재 수집 데이터의 한계
#   OCR이 뽑는 생활습관은 흡연·음주 "여부"(0/1)뿐이고 음주량이 없다.
#   따라서 210g/140g 기준을 곧바로 적용할 수 없어, 음주량이 주어지면 정식 판정하고
#   없으면 음주 여부만으로 '잠정' 판정한다(provisional=True).

ALCOHOL_WEEKLY_G_THRESHOLD = {1: 210, 2: 140}  # 1=남, 2=여

# MASLD 심대사 위험인자 (하나라도 있으면 대사이상 동반으로 봄)
_CARDIOMETABOLIC_GROUPS = (
    "g_obesity", "g_diabetes", "g_pre_diabetes",
    "g_hypertension", "g_metabolic_syndrome", "g_dyslipidemia",
)


def classify_fatty_liver_type(
    checkup: dict[str, Any],
    gender: int,
    user_groups: dict[str, bool],
) -> dict[str, Any]:
    """지방간 의심자의 유형(MASLD / ALD / MetALD)을 구분.

    Args:
        checkup: 표준 키 검진 dict. 음주량이 있으면 "주당알코올ग" 대신
                 "주당순알코올(g)" 키로 전달 (없으면 음주여부로 잠정 판정).
        gender: 1=남, 2=여
        user_groups: classify_user_groups 결과

    Returns:
        {"applicable": bool, "type": str|None, "provisional": bool,
         "basis": str, "cardiometabolic_factors": [...], "note": str}
    """
    if not user_groups.get("g_fatty_liver_suspect"):
        return {
            "applicable": False,
            "type": None,
            "provisional": False,
            "basis": "지방간 의심에 해당하지 않아 유형 구분 대상이 아닙니다.",
            "cardiometabolic_factors": [],
        }

    # 동반된 심대사 위험인자
    factors = [
        GROUP_LABELS.get(g, g)
        for g in _CARDIOMETABOLIC_GROUPS
        if user_groups.get(g)
    ]
    has_cardiometabolic = bool(factors)

    # 음주량 (있으면 정식 기준, 없으면 여부로 잠정)
    weekly_g = checkup.get("주당순알코올(g)")
    threshold = ALCOHOL_WEEKLY_G_THRESHOLD.get(gender, 210)

    if isinstance(weekly_g, (int, float)):
        heavy_drinking = weekly_g > threshold
        provisional = False
        basis = (
            f"주당 순알코올 {weekly_g}g "
            f"({'남' if gender == 1 else '여'} 기준 {threshold}g "
            f"{'초과' if heavy_drinking else '이하'})"
        )
    else:
        # 음주량 미수집 → 음주 여부만으로 잠정 판정
        drinker = user_groups.get("g_drinker")
        if drinker is None:
            return {
                "applicable": True,
                "type": None,
                "provisional": True,
                "basis": "음주 정보가 없어 유형을 구분할 수 없습니다.",
                "cardiometabolic_factors": factors,
                "note": "음주량을 입력하시면 MASLD/ALD 구분이 가능합니다.",
            }
        heavy_drinking = bool(drinker)
        provisional = True
        basis = (
            f"음주 여부만 확인됨({'음주' if drinker else '비음주'}) — "
            f"음주량 미수집으로 {threshold}g 기준을 적용하지 못했습니다."
        )

    if heavy_drinking and has_cardiometabolic:
        fl_type = "MetALD 의심 (대사이상 + 알코올 동반)"
    elif heavy_drinking:
        fl_type = "ALD 의심 (알코올 관련 지방간)"
    elif has_cardiometabolic:
        fl_type = "MASLD 의심 (대사이상 관련 지방간)"
    else:
        fl_type = "분류 미상 (대사 위험인자·음주 모두 확인되지 않음)"

    result = {
        "applicable": True,
        "type": fl_type,
        "provisional": provisional,
        "basis": basis,
        "cardiometabolic_factors": factors,
    }
    if provisional:
        result["note"] = (
            "음주량(주당 순알코올)이 없어 잠정 분류입니다. "
            f"정식 기준은 남 {ALCOHOL_WEEKLY_G_THRESHOLD[1]}g/주, "
            f"여 {ALCOHOL_WEEKLY_G_THRESHOLD[2]}g/주 초과 시 알코올 관련으로 봅니다."
        )
    return result


# ============================================================
# 통합 진입점
# ============================================================

def run_combo_analysis(
    checkup: dict[str, Any],
    gender: int,
    user_groups: dict[str, bool],
) -> dict[str, Any]:
    """조합 그룹 판정 + 지방간 유형 구분을 한 번에.

    Returns:
        {"combo_groups": {...}, "fatty_liver": {...}, "disclaimer": str}
    """
    combos = classify_combo_groups(user_groups)
    fatty_liver = classify_fatty_liver_type(checkup, gender, user_groups)

    return {
        "combo_groups": combos,
        "fatty_liver": fatty_liver,
        "disclaimer": (
            "조합 그룹 결과는 국민건강보험공단 표본과의 통계 비교이며, "
            "진단이 아닙니다. 판단은 의료진과 상담하세요."
        ),
    }
