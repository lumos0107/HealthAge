"""위험도별 임상 목표치 + 지방간 보조지표 + 임상 유의성 필터.

4단계(의학 로직 보강)에서 추가된 모듈. 세 가지를 담는다:

1. LDL 위험도별 세분 타겟 (2022 한국 이상지질혈증 진료지침)
   기존 코드는 "당뇨면 100" 하나뿐이었다. 실제 지침은 위험도를 4단계로 나눠
   목표를 다르게 준다. 같은 LDL 130이라도 초고위험군에겐 크게 초과한 값이다.

2. 지방간 보조지표 FLI / HSI
   영상 검사 없이 검진 수치만으로 지방간 가능성을 추정하는 공개 지표.
   ⚠️ 진단이 아니라 선별용 참고치다. 결과에 반드시 그렇게 표기한다.

3. 임상 유의성 필터 (20%)
   또래 평균과의 차이가 통계적으로는 있어도 임상적으로 의미 없는 경우가 많다.
   약대 자문의 "임상 유의차는 20% 수준" 발언을 반영해, 그 미만 차이는
   '사실상 차이 없음'으로 표시하도록 판정만 제공한다(값을 숨기지는 않는다).
"""
from __future__ import annotations

import math
from typing import Any, Optional


# ============================================================
# 1. LDL 위험도별 목표치
# ============================================================
# 2022 한국지질·동맥경화학회 이상지질혈증 진료지침 기준.
# 위험도가 높을수록 목표가 낮아진다.

LDL_TARGETS: dict[str, dict[str, Any]] = {
    # 초고위험/고위험은 병력(관상동맥질환 등)이 있어야 판정되는데 검진 데이터로는
    # 그 병력을 알 수 없다. 따라서 검진만으로 도달 가능한 등급은
    # diabetes(<100)·moderate(<130)·low(<160)이며, very_high/high는 참고용으로만 둔다.
    "very_high": {
        "target": 55,
        "label": "초고위험군",
        "desc": "관상동맥질환 (병력 확인 필요 — 검진만으로는 판정 불가)",
    },
    "high": {
        "target": 70,
        "label": "고위험군",
        "desc": "뇌경색·TIA·말초동맥·경동맥질환·복부대동맥류, 또는 당뇨병+"
                "(표적장기손상·유병10년↑·위험인자 동반) (병력 확인 필요)",
    },
    "diabetes": {
        "target": 100,
        "label": "당뇨병(합병증 없음)",
        "desc": "당뇨병, 유병기간 10년 미만·주요 위험인자 없음",
    },
    "moderate": {
        "target": 130,
        "label": "중등도위험군",
        "desc": "주요 위험인자 2개 이상 (비당뇨)",
    },
    "low": {
        "target": 160,
        "label": "저위험군",
        "desc": "주요 위험인자 1개 이하",
    },
}

# 주요 위험인자 (지침의 관상동맥질환 위험인자)
#   흡연 / 고혈압 / 낮은 HDL / 연령(남 45세·여 55세 이상)
# ※ 가족력은 검진지에서 얻을 수 없어 제외 — 그래서 실제 위험도는
#   여기서 산출한 값보다 높을 수 있다. 응답에 그 한계를 함께 적는다.

# Friedewald 식(LDL = TC − HDL − TG/5)은 TG가 높으면 LDL을 과소평가한다.
# 약대 자문(교수 주석 p9) + 2022 이상지질혈증 지침: TG 400mg/dL 이상이면 계산식 부적용.
# 검진지로는 LDL이 계산값인지 직접측정값인지 알 수 없으므로, 목표 달성 여부를
# 단정하지 않고(achieved=None) 확인 필요로 돌린다 — 지어내지 않는다는 원칙.
FRIEDEWALD_TG_LIMIT = 400


def _count_risk_factors(
    checkup: dict[str, Any],
    gender: int,
    age: Optional[int],
    user_groups: dict[str, bool],
) -> tuple[int, list[str]]:
    factors: list[str] = []

    if user_groups.get("g_smoker_current"):
        factors.append("현재 흡연")
    if user_groups.get("g_hypertension"):
        factors.append("고혈압")

    hdl = checkup.get("HDL콜레스테롤")
    if isinstance(hdl, (int, float)) and hdl < 40:
        factors.append("낮은 HDL(<40)")

    if age is not None:
        if gender == 1 and age >= 45:
            factors.append("연령(남 45세 이상)")
        elif gender == 2 and age >= 55:
            factors.append("연령(여 55세 이상)")

    return len(factors), factors


def classify_ldl_risk(
    checkup: dict[str, Any],
    gender: int,
    age: Optional[int],
    user_groups: dict[str, bool],
    medications: Optional[dict[str, bool]] = None,
) -> dict[str, Any]:
    """LDL 위험도 등급과 목표치를 판정.

    검진 데이터만으로는 관상동맥질환 병력·표적장기 손상을 알 수 없다.
    따라서 여기서 나오는 최고 등급은 '고위험군'이며, 초고위험군 판정은
    별도 병력 입력이 있어야 가능하다는 점을 명시한다.

    Returns:
        {"risk_level", "label", "target_ldl", "current_ldl", "achieved",
         "gap", "risk_factors", "basis", "limitations"}
    """
    medications = medications or {}
    ldl = checkup.get("LDL콜레스테롤")
    has_diabetes = bool(user_groups.get("g_diabetes"))
    n_factors, factor_names = _count_risk_factors(checkup, gender, age, user_groups)

    # 등급 판정 (검진 데이터로 도달 가능한 범위, 2022 이상지질혈증 지침 표2-4)
    #   - 당뇨병: 합병증·유병기간 정보가 없으므로 '당뇨병(무합병증)' 등급 <100로 본다.
    #     (지침상 유병 10년↑·위험인자 동반 시 고위험<70이나, 검진만으론 판정 불가)
    #   - 비당뇨: 주요 위험인자 2개 이상=중등도<130, 1개 이하=저위험<160
    if has_diabetes:
        risk_level = "diabetes"
        basis = "당뇨병 (유병기간·합병증 정보 없음 → 무합병증 기준 적용)"
    elif n_factors >= 2:
        risk_level = "moderate"
        basis = f"주요 위험인자 {n_factors}개: {', '.join(factor_names)}"
    else:
        risk_level = "low"
        basis = (
            f"주요 위험인자 {n_factors}개"
            + (f": {', '.join(factor_names)}" if factor_names else "")
        )

    info = LDL_TARGETS[risk_level]
    target = info["target"]

    achieved = None
    gap = None
    if isinstance(ldl, (int, float)):
        achieved = ldl < target
        gap = round(ldl - target, 1)

    # TG가 높으면 LDL 계산값의 신뢰도가 떨어진다 → 달성 판정을 보류한다.
    tg = checkup.get("트리글리세라이드")
    ldl_reliable = True
    reliability_note = None
    if isinstance(tg, (int, float)) and tg >= FRIEDEWALD_TG_LIMIT:
        ldl_reliable = False
        achieved = None  # 단정하지 않는다 — 화면의 '달성/초과' 배지를 띄우지 않는다
        reliability_note = (
            f"중성지방이 {tg:g}mg/dL({FRIEDEWALD_TG_LIMIT} 이상)로, LDL을 계산식"
            "(Friedewald)으로 구한 경우 실제보다 낮게 나올 수 있습니다. "
            "검진 결과지만으로는 직접측정 여부를 알 수 없어 목표 달성 여부는 "
            "판정을 보류했습니다. LDL 직접측정 또는 Non-HDL 콜레스테롤로 "
            "확인하시길 권합니다."
        )

    return {
        "risk_level": risk_level,
        "label": info["label"],
        "target_ldl": target,
        "target_text": f"LDL {target}mg/dL 미만",
        "current_ldl": ldl,
        "achieved": achieved,
        "gap": gap,
        "ldl_reliable": ldl_reliable,
        "reliability_note": reliability_note,
        "tg_value": tg if isinstance(tg, (int, float)) else None,
        "risk_factors": factor_names,
        "basis": basis,
        "on_medication": bool(medications.get("dyslipidemia")),
        "limitations": [
            "검진 결과만으로는 심혈관 질환 병력·가족력을 알 수 없어, "
            "실제 위험도는 여기 표시된 등급보다 높을 수 있습니다.",
            "고위험군·초고위험군 판정에는 관상동맥질환 등 병력 확인이 필요합니다.",
        ],
        "reference": "2022 한국지질·동맥경화학회 이상지질혈증 진료지침",
    }


# ============================================================
# 2. 지방간 보조지표 (FLI / HSI)
# ============================================================

def calculate_fli(
    bmi: Optional[float],
    waist: Optional[float],
    tg: Optional[float],
    ggt: Optional[float],
) -> Optional[dict[str, Any]]:
    """Fatty Liver Index (Bedogni 2006). 0~100.

    FLI = e^L / (1 + e^L) × 100
      L = 0.953·ln(TG) + 0.139·BMI + 0.718·ln(GGT) + 0.053·waist − 15.745

    해석: <30 지방간 가능성 낮음 / 30~59 중간 / >=60 지방간 가능성 높음

    ⚠️ 선별용 참고 지표이며 영상 진단을 대체하지 않는다.
    네 값 중 하나라도 없으면 계산하지 않는다(None).
    """
    if not all(isinstance(v, (int, float)) and v > 0 for v in (bmi, waist, tg, ggt)):
        return None

    L = (
        0.953 * math.log(tg)
        + 0.139 * bmi
        + 0.718 * math.log(ggt)
        + 0.053 * waist
        - 15.745
    )
    try:
        fli = round(math.exp(L) / (1 + math.exp(L)) * 100, 1)
    except OverflowError:
        fli = 100.0

    if fli < 30:
        interp, level = "지방간 가능성 낮음", "low"
    elif fli < 60:
        interp, level = "판단 보류 구간 (중간)", "intermediate"
    else:
        interp, level = "지방간 가능성 높음", "high"

    return {
        "value": fli,
        "level": level,
        "interpretation": interp,
        "cutoffs": "<30 낮음 / 30~59 중간 / ≥60 높음",
        "formula": "Fatty Liver Index (Bedogni 2006)",
    }


def calculate_hsi(
    alt: Optional[float],
    ast: Optional[float],
    bmi: Optional[float],
    gender: int,
    has_diabetes: bool,
) -> Optional[dict[str, Any]]:
    """Hepatic Steatosis Index (Lee 2010, 한국인 코호트에서 도출).

    HSI = 8 × (ALT/AST) + BMI + (2 if 여성) + (2 if 당뇨)

    해석: <30 지방간 배제 쪽 / 30~35.9 중간 / >36 지방간 시사

    한국인 데이터로 만들어진 지표라 국내 검진 맥락에 특히 적합하다.
    """
    if not all(isinstance(v, (int, float)) and v > 0 for v in (alt, ast, bmi)):
        return None

    hsi = 8.0 * (alt / ast) + bmi
    if gender == 2:
        hsi += 2.0
    if has_diabetes:
        hsi += 2.0
    hsi = round(hsi, 1)

    if hsi < 30:
        interp, level = "지방간 가능성 낮음", "low"
    elif hsi <= 36:
        interp, level = "판단 보류 구간 (중간)", "intermediate"
    else:
        interp, level = "지방간 시사", "high"

    return {
        "value": hsi,
        "level": level,
        "interpretation": interp,
        "cutoffs": "<30 낮음 / 30~36 중간 / >36 시사",
        "formula": "Hepatic Steatosis Index (Lee 2010, 한국인 기반)",
    }


def fatty_liver_indices(
    checkup: dict[str, Any],
    gender: int,
    user_groups: dict[str, bool],
) -> dict[str, Any]:
    """FLI·HSI를 함께 계산해 반환. 계산 불가한 지표는 None."""
    bmi = checkup.get("BMI")
    if bmi is None:
        h, w = checkup.get("신장"), checkup.get("체중")
        if isinstance(h, (int, float)) and isinstance(w, (int, float)) and h > 0:
            bmi = w / ((h / 100) ** 2)

    fli = calculate_fli(
        bmi, checkup.get("허리둘레"),
        checkup.get("트리글리세라이드"), checkup.get("감마지티피"),
    )
    hsi = calculate_hsi(
        checkup.get("혈청지피티(ALT)"), checkup.get("혈청지오티(AST)"),
        bmi, gender, bool(user_groups.get("g_diabetes")),
    )

    missing: list[str] = []
    if fli is None:
        missing.append("FLI (BMI·허리둘레·중성지방·GGT 필요)")
    if hsi is None:
        missing.append("HSI (ALT·AST·BMI 필요)")

    return {
        "fli": fli,
        "hsi": hsi,
        "unavailable": missing,
        "disclaimer": (
            "FLI·HSI는 검진 수치로 지방간 가능성을 가늠하는 선별용 참고 지표입니다. "
            "초음파 등 영상 검사에 의한 진단을 대체하지 않습니다."
        ),
    }


# ============================================================
# 3. 임상 유의성 필터 (20%)
# ============================================================

CLINICAL_SIGNIFICANCE_RATIO = 0.20


def is_clinically_significant(
    user_value: Optional[float],
    reference_value: Optional[float],
    ratio: float = CLINICAL_SIGNIFICANCE_RATIO,
) -> Optional[bool]:
    """또래 평균 대비 차이가 임상적으로 의미 있는 수준인지.

    약대 자문: "임상적으로 유의한 차이는 대체로 20% 수준."
    통계적 유의성과 임상적 유의성은 다르다 — 표본이 크면 1% 차이도
    통계적으로는 유의하지만 환자에게는 아무 의미가 없다.

    Returns:
        True/False, 판단 불가면 None. (값을 숨기라는 뜻이 아니라
        '사실상 차이 없음'으로 표시하라는 신호로 쓴다.)
    """
    if not isinstance(user_value, (int, float)):
        return None
    if not isinstance(reference_value, (int, float)) or reference_value == 0:
        return None
    return abs(user_value - reference_value) / abs(reference_value) >= ratio


def annotate_peer_difference(
    user_value: Optional[float],
    peer_mean: Optional[float],
) -> dict[str, Any]:
    """또래 비교 결과에 임상 유의성 판정을 붙인다."""
    significant = is_clinically_significant(user_value, peer_mean)
    diff = None
    pct = None
    if isinstance(user_value, (int, float)) and isinstance(peer_mean, (int, float)):
        diff = round(user_value - peer_mean, 2)
        if peer_mean != 0:
            pct = round((user_value - peer_mean) / abs(peer_mean) * 100, 1)

    if significant is None:
        text = None
    elif significant:
        text = f"또래 평균과 의미 있는 차이가 있습니다 ({pct:+.1f}%)" if pct is not None else None
    else:
        text = "또래 평균과 큰 차이는 없습니다"

    return {
        "diff": diff,
        "diff_pct": pct,
        "clinically_significant": significant,
        "text": text,
        "threshold_pct": int(CLINICAL_SIGNIFICANCE_RATIO * 100),
    }
