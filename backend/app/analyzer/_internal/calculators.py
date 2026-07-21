"""추가 수치 계산기 — 검진 기본검사 값만으로 산출하는 검증된 정량 지표.

기존 계산기(FLI·HSI in clinical_targets.py, ASCVD, eGFR/CrCl in app/renal)와
같은 축의 모듈이다. 여기에는 발표 근거 보강을 위해 추가한 3종을 담는다.

  1. TyG index  — 인슐린저항성 대리지표 (Simental-Mendía 2008)
  2. Non-HDL-C  — 죽상형성 지단백 총량 (NCEP ATP III / 2022 한국 이상지질혈증 지침)
  3. BARD score — 진행 간섬유화 '배제' 지표, 혈소판 불필요 (Harrison 2008)

공통 원칙 (clinical_targets.py와 동일):
  · 입력값이 하나라도 없으면 계산하지 않고 None을 돌려준다(추정 금지).
  · 반환 dict는 {value, level, interpretation, cutoffs, formula, ...}로 통일.
  · 선별·참고용이며 진단이 아님을 disclaimer로 명시.
  · 해석 컷오프는 원 문헌 근거를 그대로 쓰고, 연구별로 다른 경우 그 사실을 표기.
"""
from __future__ import annotations

import math
from typing import Any, Optional


def _bmi_of(checkup: dict[str, Any]) -> Optional[float]:
    """검진 dict에서 BMI를 얻고, 없으면 신장·체중으로 역산."""
    bmi = checkup.get("BMI")
    if isinstance(bmi, (int, float)) and bmi > 0:
        return float(bmi)
    h, w = checkup.get("신장"), checkup.get("체중")
    if isinstance(h, (int, float)) and isinstance(w, (int, float)) and h > 0:
        return w / ((h / 100) ** 2)
    return None


# ============================================================
# 1. TyG index (Triglyceride-Glucose index)
# ============================================================

def calculate_tyg(
    tg: Optional[float],
    fbs: Optional[float],
) -> Optional[dict[str, Any]]:
    """TyG index — 인슐린저항성 대리지표 (Simental-Mendía 2008).

    TyG = ln( TG[mg/dL] × 공복혈당[mg/dL] / 2 )

    ⚠️ 컷오프는 연구·인구집단마다 다르다. 인슐린저항성 선별 컷오프로
       흔히 8.5 전후가 쓰이고(한국인 코호트도 대개 8.5~8.8 범위),
       단일 표준값은 없다. 아래 구간은 '참고용'이며 진단이 아니다.

    TG·공복혈당 중 하나라도 없거나 0 이하면 계산하지 않는다(None).
    """
    if not all(isinstance(v, (int, float)) and v > 0 for v in (tg, fbs)):
        return None

    tyg = round(math.log(tg * fbs / 2), 2)

    if tyg < 8.5:
        interp, level = "인슐린저항성 가능성 낮음", "low"
    elif tyg < 9.0:
        interp, level = "경계 (참고 구간)", "intermediate"
    else:
        interp, level = "인슐린저항성 가능성 높음", "high"

    return {
        "value": tyg,
        "level": level,
        "interpretation": interp,
        "inputs": {"tg": tg, "fbs": fbs},
        "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
        "formula": "TyG = ln(TG × 공복혈당 / 2)  [Simental-Mendía 2008]",
    }


# ============================================================
# 2. Non-HDL 콜레스테롤
# ============================================================
# NCEP ATP III 범주 (mg/dL):
#   <130 적정 / 130~159 적정 상회 / 160~189 경계고 / 190~219 높음 / ≥220 매우 높음
# ⚠️ '목표치'는 위험도에 따라 달라진다(비-HDL 목표 = LDL 목표 + 30).
#    아래 범주는 일반 참고 분류이며, 개인 목표는 위험군에 따라 판단해야 한다.

def calculate_non_hdl_c(
    total_cholesterol: Optional[float],
    hdl: Optional[float],
) -> Optional[dict[str, Any]]:
    """Non-HDL-C = 총콜레스테롤 − HDL. 죽상형성 지단백 총량(mg/dL).

    LDL보다 포괄적(VLDL·잔여 지단백 포함)이라, 고중성지방이거나
    비공복 채혈일 때 LDL(Friedewald)보다 신뢰도가 높다.

    총콜레스테롤·HDL 중 하나라도 없으면 계산하지 않는다(None).
    """
    if not all(isinstance(v, (int, float)) and v > 0 for v in (total_cholesterol, hdl)):
        return None
    if hdl >= total_cholesterol:
        return None  # 물리적으로 불가능한 값 조합 — 입력 오류로 보고 계산하지 않음

    non_hdl = round(total_cholesterol - hdl, 1)

    if non_hdl < 130:
        interp, level = "적정", "low"
    elif non_hdl < 160:
        interp, level = "적정 상회", "intermediate"
    elif non_hdl < 190:
        interp, level = "경계 고위험", "borderline"
    elif non_hdl < 220:
        interp, level = "높음", "high"
    else:
        interp, level = "매우 높음", "very_high"

    return {
        "value": non_hdl,
        "level": level,
        "interpretation": interp,
        "inputs": {"total_cholesterol": total_cholesterol, "hdl": hdl},
        "cutoffs": "<130 적정 / 130~159 적정상회 / 160~189 경계 / 190~219 높음 / ≥220 매우높음 (NCEP ATP III)",
        "note": "개인 목표치는 위험군에 따라 다릅니다(비-HDL 목표 = LDL 목표 + 30).",
        "formula": "Non-HDL-C = 총콜레스테롤 − HDL",
    }


# ============================================================
# 3. BARD score (진행 간섬유화 배제 지표)
# ============================================================
# Harrison et al. Gut 2008. NAFLD 환자에서 진행 섬유화를 '배제'하는 데 강한 지표.
#   BMI ≥ 28            → 1점
#   AST/ALT 비 ≥ 0.8    → 2점
#   당뇨병              → 1점
#   합계 0~4점. 0~1점이면 진행 섬유화 사실상 배제(음성예측도 ~96%).
# FIB-4와 달리 혈소판이 필요 없어 국가검진 기본검사만으로 매년 계산 가능.

def calculate_bard(
    bmi: Optional[float],
    ast: Optional[float],
    alt: Optional[float],
    has_diabetes: bool,
) -> Optional[dict[str, Any]]:
    """BARD score (Harrison 2008). 0~4점, 진행 간섬유화 '배제'용.

    BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1). 낮을수록(0~1) 진행 섬유화 배제 근거.

    BMI·AST·ALT 중 하나라도 없으면 계산하지 않는다(None).
    당뇨 여부는 그룹 판정에서 오므로 항상 주어진다(bool).
    """
    if not all(isinstance(v, (int, float)) and v > 0 for v in (bmi, ast, alt)):
        return None

    aar = ast / alt
    points: list[str] = []
    score = 0
    if bmi >= 28:
        score += 1
        points.append("BMI≥28 (+1)")
    if aar >= 0.8:
        score += 2
        points.append("AST/ALT≥0.8 (+2)")
    if has_diabetes:
        score += 1
        points.append("당뇨병 (+1)")

    # 0~1점: 진행 섬유화 배제 쪽(음성예측도 높음) / 2~4점: 배제 불가
    if score <= 1:
        interp, level = "진행 간섬유화 가능성 낮음 (배제 근거, NPV~96%)", "low"
    else:
        interp, level = "진행 간섬유화 배제 불가 (추가 평가 권장)", "high"

    return {
        "value": score,
        "level": level,
        "interpretation": interp,
        "components": points,
        "inputs": {"bmi": round(bmi, 1), "ast": ast, "alt": alt,
                   "ast_alt_ratio": round(aar, 2), "diabetes": has_diabetes},
        "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
        "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]",
    }


# ============================================================
# 통합 진입점
# ============================================================

def additional_calculators(
    checkup: dict[str, Any],
    user_groups: dict[str, bool],
) -> dict[str, Any]:
    """TyG·Non-HDL-C·BARD를 함께 계산해 반환. 계산 불가한 지표는 None."""
    bmi = _bmi_of(checkup)
    has_diabetes = bool(user_groups.get("g_diabetes"))

    tyg = calculate_tyg(
        checkup.get("트리글리세라이드"), checkup.get("식전혈당(공복혈당)"),
    )
    non_hdl = calculate_non_hdl_c(
        checkup.get("총콜레스테롤"), checkup.get("HDL콜레스테롤"),
    )
    bard = calculate_bard(
        bmi, checkup.get("혈청지오티(AST)"), checkup.get("혈청지피티(ALT)"), has_diabetes,
    )

    missing: list[str] = []
    if tyg is None:
        missing.append("TyG (중성지방·공복혈당 필요)")
    if non_hdl is None:
        missing.append("Non-HDL-C (총콜레스테롤·HDL 필요)")
    if bard is None:
        missing.append("BARD (BMI·AST·ALT 필요)")

    return {
        "tyg": tyg,
        "non_hdl_c": non_hdl,
        "bard": bard,
        "unavailable": missing,
        "disclaimer": (
            "TyG·Non-HDL-C·BARD는 검진 수치로 산출하는 선별용 참고 지표입니다. "
            "진단을 대체하지 않으며, 컷오프는 연구·위험군에 따라 달라질 수 있습니다."
        ),
    }
