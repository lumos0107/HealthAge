"""심혈관 위험 계산 엔진 — 계수 기반 10년(±30년) 위험도.

ascvd.py(PCE 2013)와 같은 축의 '위험엔진' 모듈. 계수표가 커서 별도 파일로 둔다.
각 엔진은 검진 기본검사 + 나이·성별·흡연·약물로 계산하며, 원식 계수와
검산용 worked example을 주석에 남겨 재현성을 보장한다.

⚠️ 공통 원칙
  · 입력이 하나라도 없거나 나이 범위를 벗어나면 계산하지 않는다(None).
  · 한국인 코호트 검증이 아닌 서구 모델이므로 '참고용 시뮬레이션'으로만 제시.
  · 반환 dict는 calculators.py 계산기와 같은 {value, level, interpretation, ...} 형태.
"""
from __future__ import annotations

import math
from typing import Any, Optional


def _valid(*vals) -> bool:
    return all(isinstance(v, (int, float)) and v > 0 for v in vals)


def _risk_level(pct: float) -> tuple[str, str]:
    """10년 CVD 위험 %를 저/경계/중간/고위험으로 (ACC/AHA 관례)."""
    if pct < 5:
        return "낮음", "low"
    if pct < 7.5:
        return "경계", "intermediate"
    if pct < 20:
        return "중간", "borderline"
    return "높음", "high"


# ============================================================
# Framingham "Hard CHD" 10년 위험 (Wilson 1998, MDCalc calc/38)
# ============================================================
# Cox 비례위험 회귀식(점수표 아님). 당뇨 변수 없음(비당뇨 30~79세).
# 계수·기저생존율·상수는 MDCalc calc/38 원문 = framinghamheartstudy.org와 일치.
#
# 남성: Risk = (1 − 0.9402^exp(L)) × 100
#   L = 52.00961·lnAge + 20.014077·lnTC − 0.905964·lnHDL + 1.305784·lnSBP
#       + 0.241549·TreatedBP + 12.096316·Smoker
#       − 4.605038·lnAge·lnTC − 2.843670·lnAge*·Smoker − 2.933230·lnAge²
#       − 172.300168
# 여성: Risk = (1 − 0.98767^exp(L)) × 100   (lnAge² 항 없음)
#   L = 31.764001·lnAge + 22.465206·lnTC − 1.187731·lnHDL + 2.552905·lnSBP
#       + 0.420251·TreatedBP + 13.075430·Smoker
#       − 5.060998·lnAge·lnTC − 2.996945·lnAge*·Smoker − 146.5933061
#   * 흡연 상호작용 항의 lnAge: 남 age>70이면 ln70, 여 age>78이면 ln78 상한.
#
# 검산 worked example (MDCalc 식으로 산출):
#   A 남55 TC213 HDL50 SBP120 미치료 비흡연 → 6.51%
#   B 여55 TC213 HDL50 SBP120 미치료 비흡연 → 1.21%
#   C 남60 TC240 HDL35 SBP140 치료 흡연     → 29.99%
#   D 여60 TC240 HDL35 SBP140 치료 흡연     → 15.87%

FRAMINGHAM_AGE_MIN, FRAMINGHAM_AGE_MAX = 30, 79


def calculate_framingham_hard_chd(
    age: Optional[int],
    gender: int,
    tc: Optional[float],
    hdl: Optional[float],
    sbp: Optional[float],
    treated_bp: bool,
    smoker: bool,
) -> Optional[dict[str, Any]]:
    """Framingham Hard CHD 10년 위험(%). Wilson 1998 / MDCalc calc/38."""
    if age is None or not (FRAMINGHAM_AGE_MIN <= age <= FRAMINGHAM_AGE_MAX):
        return None
    if not _valid(tc, hdl, sbp):
        return None

    ln_age = math.log(age)
    ln_tc = math.log(tc)
    ln_hdl = math.log(hdl)
    ln_sbp = math.log(sbp)
    tbp = 1 if treated_bp else 0
    smk = 1 if smoker else 0

    if gender == 1:  # 남
        ln_age_smk = math.log(min(age, 70))
        L = (
            52.00961 * ln_age + 20.014077 * ln_tc - 0.905964 * ln_hdl
            + 1.305784 * ln_sbp + 0.241549 * tbp + 12.096316 * smk
            - 4.605038 * ln_age * ln_tc - 2.843670 * ln_age_smk * smk
            - 2.933230 * ln_age * ln_age - 172.300168
        )
        s0 = 0.9402
    else:  # 여
        ln_age_smk = math.log(min(age, 78))
        L = (
            31.764001 * ln_age + 22.465206 * ln_tc - 1.187731 * ln_hdl
            + 2.552905 * ln_sbp + 0.420251 * tbp + 13.075430 * smk
            - 5.060998 * ln_age * ln_tc - 2.996945 * ln_age_smk * smk
            - 146.5933061
        )
        s0 = 0.98767

    risk = (1 - s0 ** math.exp(L)) * 100
    risk = round(max(0.0, min(risk, 99.0)), 1)
    interp, level = _risk_level(risk)

    return {
        "value": risk,
        "unit": "%",
        "level": level,
        "interpretation": f"10년 관상동맥질환 위험 {interp}",
        "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
        "formula": "Framingham Hard CHD 10년 (Wilson 1998, MDCalc calc/38)",
        "note": "당뇨 미반영·서구 코호트 기반 참고용. 진단 아님.",
    }


# ============================================================
# AHA PREVENT — Total CVD 10년·30년 위험 (Khan SS 2024, MDCalc calc/10491)
# ============================================================
# PCE(2013)의 공식 후속. race-free, eGFR 반영, 30~79세, 30년 위험까지.
# 계수 원본: Khan SS et al. Circulation 2024;149:430-449 supplement
#   (CRAN preventr 패키지로 전사·검증). risk = logistic(Σβx), Constant는 β에 포함.
# ⚠️ Total CVD 모델에서 BMI 계수 = 0 (BMI는 HF 모델에만). 콜레스테롤 mg/dL×0.02586=mmol/L.
#
# 검산: 여50 SBP160 bp_tx1 TC200 HDL45 statin0 dm1 smk0 eGFR90 → 10년 14.7% / 30년 53% (검증됨).

_CHOL_MMOL = 0.02586  # mg/dL → mmol/L

# 계수(β) — x 벡터 순서와 정확히 일치. 10년 23항 / 30년 24항(Age² 추가), 마지막=Constant.
_PREVENT_CVD_10 = {
    2: [0.7939329, 0.0305239, -0.1606857, -0.2394003, 0.3600781, 0.8667604,
        0.5360739, 0.0, 0.0, 0.6045917, 0.0433769, 0.3151672, -0.1477655,
        -0.0663612, 0.1197879, -0.0819715, 0.0306769, -0.0946348, -0.2705700,
        -0.0787150, 0.0, -0.1637806, -3.3077280],
    1: [0.7688528, 0.0736174, -0.0954431, -0.4347345, 0.3362658, 0.7692857,
        0.4386871, 0.0, 0.0, 0.5378979, 0.0164827, 0.2888790, -0.1337349,
        -0.0475924, 0.1502730, -0.0517874, 0.0191169, -0.1049477, -0.2251948,
        -0.0895067, 0.0, -0.1543702, -3.0311680],
}
_PREVENT_CVD_30 = {
    2: [0.5503079, -0.0928369, 0.0409794, -0.1663306, -0.1628654, 0.3299505,
        0.6793894, 0.3196112, 0.0, 0.0, 0.1857101, 0.0553528, 0.2894000,
        -0.0756880, -0.0563670, 0.1071019, -0.0751438, 0.0301786, -0.0998776,
        -0.3206166, -0.1607862, 0.0, -0.1450788, -1.3188270],
    1: [0.4627309, -0.0984281, 0.0836088, -0.1029824, -0.2140352, 0.2904325,
        0.5331276, 0.2141914, 0.0, 0.0, 0.1155556, 0.0603775, 0.2327140,
        -0.0272112, -0.0384488, 0.1341920, -0.0511759, 0.0165865, -0.1101437,
        -0.2585943, -0.1566406, 0.0, -0.1166776, -1.1482040],
}

PREVENT_AGE_MIN, PREVENT_AGE_MAX = 30, 79


def _prevent_x(age, tc, hdl, sbp, dm, smk, egfr, bp_tx, statin, bmi, thirty):
    a = (age - 55) / 10
    nh = (tc - hdl) * _CHOL_MMOL - 3.5
    hdl_x = (hdl * _CHOL_MMOL - 1.3) / 0.3
    sbp_lt = (min(sbp, 110) - 110) / 20
    sbp_ge = (max(sbp, 110) - 130) / 20
    bmi_lt = (min(bmi, 30) - 25) / 5
    bmi_ge = (max(bmi, 30) - 30) / 5
    eg_lt = (min(egfr, 60) - 60) / -15
    eg_ge = (max(egfr, 60) - 90) / -15
    x = [a]
    if thirty:
        x.append(a * a)
    x += [nh, hdl_x, sbp_lt, sbp_ge, dm, smk, bmi_lt, bmi_ge, eg_lt, eg_ge,
          bp_tx, statin, bp_tx * sbp_ge, statin * nh, a * nh, a * hdl_x,
          a * sbp_ge, a * dm, a * smk, a * bmi_ge, a * eg_lt, 1.0]
    return x


def _prevent_risk(betas, x) -> float:
    lp = sum(b * v for b, v in zip(betas, x))
    return math.exp(lp) / (1 + math.exp(lp)) * 100


def calculate_prevent_cvd(
    age: Optional[int],
    gender: int,
    tc: Optional[float],
    hdl: Optional[float],
    sbp: Optional[float],
    diabetes: bool,
    smoking: bool,
    egfr: Optional[float],
    bp_tx: bool,
    statin: bool,
    bmi: Optional[float] = 27.0,  # Total CVD 계수 0이라 값 무관(기본치)
) -> Optional[dict[str, Any]]:
    """AHA PREVENT Total CVD 10년·30년 위험(%). Khan 2024 / MDCalc calc/10491."""
    if age is None or not (PREVENT_AGE_MIN <= age <= PREVENT_AGE_MAX):
        return None
    if not _valid(tc, hdl, sbp, egfr):
        return None
    bmi = bmi if isinstance(bmi, (int, float)) and bmi > 0 else 27.0
    dm, smk = (1 if diabetes else 0), (1 if smoking else 0)
    bt, st = (1 if bp_tx else 0), (1 if statin else 0)

    r10 = _prevent_risk(_PREVENT_CVD_10[gender],
                        _prevent_x(age, tc, hdl, sbp, dm, smk, egfr, bt, st, bmi, False))
    r30 = _prevent_risk(_PREVENT_CVD_30[gender],
                        _prevent_x(age, tc, hdl, sbp, dm, smk, egfr, bt, st, bmi, True))
    r10, r30 = round(r10, 1), round(r30, 1)
    interp, level = _risk_level(r10)

    return {
        "value": r10,
        "unit": "%",
        "level": level,
        "interpretation": f"10년 심혈관(CVD) 위험 {interp}",
        "value_30yr": r30,
        "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
        "formula": "AHA PREVENT Total CVD (Khan 2024, race-free·eGFR 반영)",
        "note": f"30년 위험 {r30}%. PCE 후속 모델(30~79세). 참고용, 진단 아님.",
    }


# ============================================================
# SCORE2 / SCORE2-OP — 유럽 10년 치명+비치명 CVD (ESC 2021, MDCalc calc/10499)
# ============================================================
# SCORE2(40~69) / SCORE2-OP(70~89). 성별식. TC·HDL 별도 항(mmol/L), 당뇨 포함.
# 최종 위험 = complementary log-log 지역보정. 계수: RiskScorescvd 패키지(원논문 Table S7/S12).
# ⚠️ 한국은 유럽 4구간 근사 시 High-risk region 권장(Low로 두면 과소추정). 기본 region='high'.
# 검산: 50 흡연 SBP140 TC5.5 HDL1.3 비당뇨 → 남Low 5.9% / 남VeryHigh 14.0% / 여Low 4.2%.

_SCORE2 = {  # 40~69: β + S0. 순서: cage, smoking, csbp, diabetes, ctchol, chdl, ×smk, ×sbp, ×tchol, ×hdl, ×dm
    1: dict(b=[0.3742, 0.6012, 0.2777, 0.6457, 0.1458, -0.2698,
               -0.0755, -0.0255, -0.0281, 0.0426, -0.0983], s0=0.9605),
    2: dict(b=[0.4648, 0.7744, 0.3131, 0.8096, 0.1002, -0.2606,
               -0.1088, -0.0277, -0.0226, 0.0613, -0.1272], s0=0.9776),
}
_SCORE2_SCALE = {  # region → (m1,m2,f1,f2)
    "low": (-0.5699, 0.7476, -0.7380, 0.7019),
    "moderate": (-0.1565, 0.8009, -0.3143, 0.7701),
    "high": (0.3207, 0.9360, 0.5710, 0.9369),
    "very_high": (0.5836, 0.8294, 0.9412, 0.8329),
}
_SCORE2_OP = {  # 70~89: β + meanLP c + S0. 순서: cage, diabetes, smoking, csbp, ctchol, chdl, ×dm, ×smk, ×sbp, ×tchol, ×hdl
    1: dict(b=[0.0634, 0.4245, 0.3524, 0.0094, 0.0850, -0.3564,
               -0.0174, -0.0247, -0.0005, 0.0073, 0.0091], c=-0.0929, s0=0.7576),
    2: dict(b=[0.0789, 0.6010, 0.4921, 0.0102, 0.0605, -0.3040,
               -0.0107, -0.0255, -0.0004, -0.0009, 0.0154], c=-0.229, s0=0.8082),
}
_SCORE2_OP_SCALE = {
    "low": (-0.34, 1.19, -0.52, 1.01),
    "moderate": (0.01, 1.25, -0.10, 1.10),
    "high": (0.08, 1.15, 0.38, 1.09),
    "very_high": (0.05, 0.70, 0.38, 0.69),
}


def _cloglog_calibrate(sunc: float, scale1: float, scale2: float) -> float:
    return 1 - math.exp(-math.exp(scale1 + scale2 * math.log(-math.log(sunc))))


def _score2_risk_mmol(age, gender, smoking, sbp, diabetes, tc_mmol, hdl_mmol, region):
    dm, smk = (1 if diabetes else 0), (1 if smoking else 0)
    m_idx = 0 if gender == 1 else 2  # scale 튜플 인덱스
    if age <= 69:  # SCORE2
        cage = (age - 60) / 5
        csbp = (sbp - 120) / 20
        ctchol = (tc_mmol - 6)
        chdl = (hdl_mmol - 1.3) / 0.5
        p = _SCORE2[gender]
        x = [cage, smk, csbp, dm, ctchol, chdl,
             cage * smk, cage * csbp, cage * ctchol, cage * chdl, cage * dm]
        lp = sum(bi * xi for bi, xi in zip(p["b"], x))
        sunc = p["s0"] ** math.exp(lp)
        sc = _SCORE2_SCALE[region]
    else:  # SCORE2-OP
        cage = (age - 73)
        csbp = (sbp - 150)
        ctchol = (tc_mmol - 6)
        chdl = (hdl_mmol - 1.4)
        p = _SCORE2_OP[gender]
        x = [cage, dm, smk, csbp, ctchol, chdl,
             cage * dm, cage * smk, cage * csbp, cage * ctchol, cage * chdl]
        lp = sum(bi * xi for bi, xi in zip(p["b"], x))
        sunc = p["s0"] ** math.exp(lp + p["c"])
        sc = _SCORE2_OP_SCALE[region]
    scale1, scale2 = sc[m_idx], sc[m_idx + 1]
    return _cloglog_calibrate(sunc, scale1, scale2) * 100


SCORE2_AGE_MIN, SCORE2_AGE_MAX = 40, 89


def calculate_score2(
    age: Optional[int],
    gender: int,
    tc: Optional[float],
    hdl: Optional[float],
    sbp: Optional[float],
    diabetes: bool,
    smoking: bool,
    region: str = "high",  # 한국 근사: High-risk region 권장
) -> Optional[dict[str, Any]]:
    """SCORE2/SCORE2-OP 10년 치명+비치명 CVD 위험(%). ESC 2021. TC·HDL은 mg/dL→mmol/L 변환."""
    if age is None or not (SCORE2_AGE_MIN <= age <= SCORE2_AGE_MAX):
        return None
    if not _valid(tc, hdl, sbp):
        return None
    tc_mmol, hdl_mmol = tc * _CHOL_MMOL, hdl * _CHOL_MMOL
    risk = round(_score2_risk_mmol(age, gender, smoking, sbp, diabetes, tc_mmol, hdl_mmol, region), 1)
    model = "SCORE2" if age <= 69 else "SCORE2-OP"
    interp, level = _risk_level(risk)
    return {
        "value": risk,
        "unit": "%",
        "level": level,
        "interpretation": f"10년 심혈관(CVD) 위험 {interp}",
        "cutoffs": "<5 낮음 / 5~7.5 경계 / 7.5~20 중간 / ≥20 높음",
        "formula": f"{model} (ESC 2021, High-risk 지역 보정)",
        "note": "유럽 모델을 한국에 High-risk 지역으로 근사한 참고값. 진단 아님.",
    }
