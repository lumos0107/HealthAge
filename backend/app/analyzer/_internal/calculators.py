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


def _valid(*vals) -> bool:
    """모든 값이 양수 실수인지 (결측·0·음수면 계산 불가)."""
    return all(isinstance(v, (int, float)) and v > 0 for v in vals)


def _josa(word: str, with_final: str, without_final: str) -> str:
    """받침 유무로 조사를 고른다 — 「중성지방이 / 공복혈당가」 같은 비문을 막는다.

    프론트에는 `interpret.subjectJosa`가 이미 있는데 백엔드에는 없어서, 시계열 메시지가
    「{항목}이(가)」로 회피하고 있었다(기록 36 §7-6). 여기서 만드는 문장은 사용자에게
    그대로 나가므로 회피 표기를 쓰지 않는다.
    """
    if not word:
        return without_final
    last = word[-1]
    if not ("가" <= last <= "힣"):
        return without_final
    return with_final if (ord(last) - 0xAC00) % 28 else without_final


def _driver(parts: list[tuple[str, float]]) -> Optional[str]:
    """어느 입력이 이 값을 끌어올렸나 — 한 문장.

    계산기는 여러 수치를 묶어 하나의 값을 만든다. 그래서 결과만 보면 «무엇 때문에»
    높은지 알 수 없다. TyG 9.13이 같아도 중성지방이 끌어올린 사람과 공복혈당이
    끌어올린 사람은 할 일이 다르다. 그동안 카드의 ⑤는 「TyG가 높으면 체중·탄수화물
    관리가 우선이에요」처럼 **TyG가 낮아도 똑같이 나오는 고정 문구**였다.

    parts: (라벨, 기여도). 기여도는 «그 입력이 또래 중앙값이었다면» 대비 차이이고,
    공식의 형태에 맞춰 같은 자로 잰다(곱셈형은 로그, 덧셈형은 그대로).
    양수 = 값을 올린 쪽.

    ⚠️ 끌어올린 것이 하나도 없으면 None이다 — 빈칸을 채우려고 문장을 지어내지 않는다.
    1위가 2위의 1.5배 미만이면 «둘 다»로 말한다. 근소한 차이를 단정하지 않는다.
    """
    up = sorted([p for p in parts if p[1] > 0], key=lambda p: -p[1])
    if not up:
        return None
    if len(up) >= 2 and up[0][1] < up[1][1] * 1.5:
        a, b = up[0][0], up[1][0]
        return (f"또래 중앙값과 견주면 {a}{_josa(a, '과', '와')} "
                f"{b}{_josa(b, '이', '가')} 비슷하게 끌어올렸어요.")
    return f"또래 중앙값과 견주면 {up[0][0]} 쪽이 이 값을 더 끌어올렸어요."


def _med(metric: str, gender: Optional[int], age: Optional[int]) -> Optional[float]:
    """또래 중앙값 — 조회 실패하면 None(그때는 driver를 만들지 않는다)."""
    if gender is None or age is None:
        return None
    try:
        from .peer_compare import peer_median
        return peer_median(metric, gender, age)
    except Exception:
        return None


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
    gender: Optional[int] = None,
    age: Optional[int] = None,
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

    # TyG = ln(TG) + ln(공복혈당) − ln2 이므로 로그 기여도가 정확히 더해진다.
    m_tg, m_fbs = _med("트리글리세라이드", gender, age), _med("식전혈당(공복혈당)", gender, age)
    driver = _driver([
        ("중성지방", math.log(tg / m_tg) if m_tg else 0.0),
        ("공복혈당", math.log(fbs / m_fbs) if m_fbs else 0.0),
    ]) if (m_tg and m_fbs) else None

    return {
        "value": tyg,
        "level": level,
        "interpretation": interp,
        "driver": driver,
        "inputs": {"tg": tg, "fbs": fbs},
        "cutoffs": "<8.5 낮음 / 8.5~8.9 경계 / ≥9.0 높음 (연구별 상이, 참고용)",
        "note": "국제 단일 진단 컷오프는 미확립이나, 한국 성인 대사증후군 스크리닝용으로 "
                "~8.8이 반복 검증됨(Shin 2019 등). 한국인 국가검진 55세 남성 중앙값도 8.80.",
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
    gender: Optional[int] = None,
    age: Optional[int] = None,
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

    # Non-HDL = 총콜레스테롤 − HDL. 뺄셈형이라 mg/dL 차이가 그대로 같은 자다.
    # HDL은 «낮을수록» 값을 올리므로 부호를 뒤집는다.
    m_tc, m_hdl = _med("총콜레스테롤", gender, age), _med("HDL콜레스테롤", gender, age)
    driver = _driver([
        ("총콜레스테롤", total_cholesterol - m_tc if m_tc else 0.0),
        ("낮은 HDL", m_hdl - hdl if m_hdl else 0.0),
    ]) if (m_tc and m_hdl) else None

    return {
        "value": non_hdl,
        "level": level,
        "interpretation": interp,
        "driver": driver,
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
        plain = "간이 굳었을 가능성은 낮아요"
    else:
        interp, level = "진행 간섬유화 배제 불가 (추가 평가 권장)", "high"
        # BARD는 '배제(rule-out)' 검사다. 점수가 높다고 섬유화가 있다는 뜻이 아니므로
        # 「굳고 있어요」로 풀면 진단 단정이 된다. 원문의 「추가 평가 권장」이
        # 이 검사가 줄 수 있는 유일하게 정확한 결론이다.
        plain = "간이 굳고 있는지 더 확인해 볼 필요가 있어요"

    return {
        "value": score,
        "level": level,
        "interpretation": interp,
        "plain": plain,
        "components": points,
        "inputs": {"bmi": round(bmi, 1), "ast": ast, "alt": alt,
                   "ast_alt_ratio": round(aar, 2), "diabetes": has_diabetes},
        "cutoffs": "0~1 배제 쪽 / 2~4 배제 불가",
        "formula": "BARD = BMI≥28(1) + AST/ALT≥0.8(2) + 당뇨(1)  [Harrison 2008]",
    }


# ============================================================
# 4. 지질 위험비 — Castelli I / II (단위 무관: 같은 단위 비율)
# ============================================================
# Castelli RI-I  = TC/HDL,  RI-II = LDL/HDL  (Castelli, Am J Med 1984)
# 비율이라 mg/dL·mmol/L 어느 단위든 동일 → 단위 변환 불필요.

def calculate_castelli_1(
    total_cholesterol: Optional[float],
    hdl: Optional[float],
) -> Optional[dict[str, Any]]:
    """Castelli 지수 I (심혈관위험지수 CRI-I) = 총콜레스테롤 / HDL."""
    if not all(isinstance(v, (int, float)) and v > 0 for v in (total_cholesterol, hdl)):
        return None
    ratio = round(total_cholesterol / hdl, 2)
    if ratio < 4.0:
        interp, level = "적정", "low"
    elif ratio < 5.0:
        interp, level = "경계", "intermediate"
    else:
        interp, level = "높음", "high"
    return {
        "value": ratio, "level": level, "interpretation": interp,
        "cutoffs": "<4.0 적정 / 4.0~5.0 경계 / >5.0 높음 (참고, 성별·문헌별 상이)",
        "formula": "Castelli-I = 총콜레스테롤 / HDL",
    }


def calculate_castelli_2(
    ldl: Optional[float],
    hdl: Optional[float],
) -> Optional[dict[str, Any]]:
    """Castelli 지수 II (CRI-II) = LDL / HDL."""
    if not all(isinstance(v, (int, float)) and v > 0 for v in (ldl, hdl)):
        return None
    ratio = round(ldl / hdl, 2)
    if ratio < 3.0:
        interp, level = "적정", "low"
    elif ratio < 3.5:
        interp, level = "경계", "intermediate"
    else:
        interp, level = "높음", "high"
    return {
        "value": ratio, "level": level, "interpretation": interp,
        "cutoffs": "<3.0 적정 / 3.0~3.5 경계 / >3.5 높음 (참고)",
        "formula": "Castelli-II = LDL / HDL",
    }


# ============================================================
# 5. De Ritis 비 (AST/ALT) — 단위 무관
# ============================================================

def calculate_de_ritis(
    ast: Optional[float],
    alt: Optional[float],
) -> Optional[dict[str, Any]]:
    """De Ritis 비 = AST / ALT (De Ritis 1957).

    <1 비알코올성/급성 간질환 시사, >2 알코올성·진행 간질환 시사.
    낮다=좋다가 아니라 '유형 시사'라 해석 문구로 안내한다.
    """
    if not all(isinstance(v, (int, float)) and v > 0 for v in (ast, alt)):
        return None
    ratio = round(ast / alt, 2)
    if ratio < 1.0:
        interp, level = "비알코올성/급성 간질환 시사 (<1)", "low"
    elif ratio <= 2.0:
        interp, level = "중간 (1~2)", "intermediate"
    else:
        interp, level = "알코올성·진행 간질환 시사 (>2)", "high"
    return {
        "value": ratio, "level": level, "interpretation": interp,
        "cutoffs": "<1 비알코올/급성 / 1~2 중간 / >2 알코올성·진행 시사",
        "formula": "De Ritis = AST / ALT",
    }


# ============================================================
# 5-2. ALT/GGT 비 — 지방간 유형 감별 보조
# ============================================================

def calculate_alt_ggt_ratio(
    alt: Optional[float],
    ggt: Optional[float],
) -> Optional[dict[str, Any]]:
    """ALT/GGT 비 — 지방간의 '유형'을 가늠하는 보조 지표.

    약대 자문(교수 주석 p4): "ALT/GGT 비율 >1이면 비알코올성, <1이면 알코올성."
    De Ritis(AST/ALT)와 함께 보면 감별에 도움이 된다.

    ⚠️ 높고 낮음이 좋고 나쁨을 뜻하지 않는다(유형 시사). 그래서 level은
    중립값 'info'로 두어 화면에서 초록/빨강으로 물들지 않게 한다.
    ⚠️ 음주량(주당 순알코올)이 있으면 훨씬 정확해지지만 현재는 미수집이다.
    """
    if not all(isinstance(v, (int, float)) and v > 0 for v in (alt, ggt)):
        return None
    ratio = round(alt / ggt, 2)
    if ratio < 1.0:
        interp = "알코올성 간질환 쪽 시사 (<1)"
    else:
        interp = "비알코올성(대사성) 지방간 쪽 시사 (≥1)"
    return {
        "value": ratio, "level": "info", "interpretation": interp,
        "cutoffs": "<1 알코올성 쪽 / ≥1 비알코올성 쪽 (유형 감별 보조, 중증도 아님)",
        "formula": "ALT / GGT",
        "note": (
            "유형을 가늠하는 보조 지표로, 진단이 아닙니다. "
            "음주량(주당 순알코올)을 함께 보면 정확도가 올라갑니다."
        ),
    }


# ============================================================
# 6. 평균동맥압 MAP — SBP·DBP
# ============================================================

def calculate_map(
    sbp: Optional[float],
    dbp: Optional[float],
    gender: Optional[int] = None,
    age: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """평균동맥압 MAP = (SBP + 2×DBP) / 3 (mmHg). 조직 관류압 지표."""
    if not all(isinstance(v, (int, float)) and v > 0 for v in (sbp, dbp)):
        return None
    if sbp < dbp:
        return None  # 물리적으로 불가능한 조합 — 입력 오류
    mapv = round((sbp + 2 * dbp) / 3, 1)
    if mapv < 70:
        interp, level = "낮음 (관류 저하 우려)", "high"
    elif mapv <= 100:
        interp, level = "정상 범위", "low"
    elif mapv <= 110:
        interp, level = "다소 높음", "intermediate"
    else:
        interp, level = "높음", "high"
    # MAP = (SBP + 2·DBP)/3. 덧셈형이라 가중치를 그대로 곱해 mmHg로 견준다 —
    # 이완기는 2/3, 수축기는 1/3의 무게를 갖는다.
    m_s, m_d = _med("수축기혈압", gender, age), _med("이완기혈압", gender, age)
    driver = _driver([
        ("수축기혈압", (sbp - m_s) / 3 if m_s else 0.0),
        ("이완기혈압", 2 * (dbp - m_d) / 3 if m_d else 0.0),
    ]) if (m_s and m_d) else None
    return {
        "value": mapv, "level": level, "interpretation": interp,
        "driver": driver,
        "cutoffs": "70~100 정상 / <70 낮음 / >110 높음 (mmHg)",
        "formula": "MAP = (SBP + 2×DBP) / 3",
    }


# ============================================================
# 7. AIP (죽상형성지수) — ⚠️ 원 정의 mmol/L 기반
# ============================================================
# AIP = log10( TG(mmol/L) / HDL(mmol/L) )  (Dobiásová 2001)
# mg/dL 그대로 log10(TG/HDL) 하면 +0.36 과대평가 → 변환 필수.
# TG mg/dL→mmol/L ÷88.57, HDL ÷38.67. 아래는 변환을 녹인 정식(반올림 오차 없음).

def calculate_aip(
    tg: Optional[float],
    hdl: Optional[float],
    gender: Optional[int] = None,
    age: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """Atherogenic Index of Plasma = log10(TG_mmol/HDL_mmol). Dobiásová 2001."""
    if not _valid(tg, hdl):
        return None
    aip = round(math.log10((tg / 88.57) / (hdl / 38.67)), 3)
    if aip < 0.11:
        interp, level = "저위험", "low"
    elif aip <= 0.21:
        interp, level = "중간 위험", "intermediate"
    else:
        interp, level = "고위험", "high"
    # AIP = log10(TG/HDL). 비율의 로그라 각 항의 로그 차가 그대로 기여도다.
    m_tg, m_hdl = _med("트리글리세라이드", gender, age), _med("HDL콜레스테롤", gender, age)
    driver = _driver([
        ("중성지방", math.log10(tg / m_tg) if m_tg else 0.0),
        ("낮은 HDL", math.log10(m_hdl / hdl) if m_hdl else 0.0),
    ]) if (m_tg and m_hdl) else None
    return {
        "value": aip, "level": level, "interpretation": interp,
        "driver": driver,
        "cutoffs": "<0.11 저위험 / 0.11~0.21 중간 / >0.21 고위험 (Dobiásová)",
        "formula": "AIP = log10(TG/HDL), mmol/L 변환 적용",
    }


# ============================================================
# 8. METS-IR (인슐린저항성) — mg/dL 그대로 (변환 없음)
# ============================================================
# METS-IR = ln((2×FPG)+TG)×BMI / ln(HDL)  (Bello-Chavolla 2018, 전부 mg/dL)
# ⚠️ 원 논문이 단일 진단 컷오프를 확립하지 않음 → 참고 컷오프(~50)만 표기.

def calculate_mets_ir(
    fbs: Optional[float],
    tg: Optional[float],
    bmi: Optional[float],
    hdl: Optional[float],
) -> Optional[dict[str, Any]]:
    """METS-IR 인슐린저항성 지표 (Bello-Chavolla 2018). 전부 mg/dL·BMI."""
    if not _valid(fbs, tg, bmi, hdl) or hdl <= 1:
        return None
    mets = round(math.log(2 * fbs + tg) * bmi / math.log(hdl), 2)
    # 단일 검증 컷오프 부재 → ~50을 참고선으로만 사용(과잉해석 금지)
    if mets < 50:
        interp, level = "참고: 인슐린저항성 낮은 편", "low"
    else:
        interp, level = "참고: 인슐린저항성 높은 편", "intermediate"
    return {
        "value": mets, "level": level, "interpretation": interp,
        "cutoffs": "참고선 ~50 (검증된 단일 컷오프 없음, 연구별 상이)",
        "formula": "METS-IR = ln(2·FPG+TG)·BMI / ln(HDL)",
        "note": "인슐린저항성 대리지표. 진단 컷오프 미확립 — 추이·참고용.",
    }


# ============================================================
# 9. LAP (지질축적산물) — ⚠️ TG mmol/L 기반
# ============================================================
# 남: (허리−65)×TG_mmol,  여: (허리−58)×TG_mmol  (Kahn 2005)
# 단일 컷오프 없음(집단·사분위 의존) → 값·맥락만 제시.

def calculate_lap(
    waist: Optional[float],
    tg: Optional[float],
    gender: int,
) -> Optional[dict[str, Any]]:
    """Lipid Accumulation Product (Kahn 2005). 허리 cm, TG는 mmol/L로 변환."""
    if not _valid(waist, tg):
        return None
    base = 65 if gender == 1 else 58
    if waist <= base:
        return None  # 허리−기준 ≤0이면 LAP 정의상 의미 없음
    lap = round((waist - base) * (tg / 88.57), 1)
    return {
        "value": lap, "level": "info", "interpretation": "지질축적 정도(참고)",
        "cutoffs": "단일 컷오프 없음 — 집단 내 사분위로 해석",
        "formula": f"LAP = (허리−{base})×TG(mmol/L)",
        "note": "내장지방·대사위험 대리지표. 진단 컷오프 미확립.",
    }


# ============================================================
# 10. VAI (내장지방지수) — ⚠️ TG·HDL mmol/L 기반
# ============================================================
# 남: [WC/(39.68+1.88·BMI)]×(TG/1.03)×(1.31/HDL)   (TG·HDL mmol/L)
# 여: [WC/(36.58+1.89·BMI)]×(TG/0.81)×(1.52/HDL)   (Amato 2010)
# 정상체중 건강군에서 ≈1이 되도록 설계. 컷오프는 연령의존 → 값·맥락만.

def calculate_vai(
    waist: Optional[float],
    bmi: Optional[float],
    tg: Optional[float],
    hdl: Optional[float],
    gender: int,
) -> Optional[dict[str, Any]]:
    """Visceral Adiposity Index (Amato 2010). WC cm·BMI, TG·HDL은 mmol/L로 변환."""
    if not _valid(waist, bmi, tg, hdl):
        return None
    tg_m = tg / 88.57
    hdl_m = hdl / 38.67
    if gender == 1:
        vai = (waist / (39.68 + 1.88 * bmi)) * (tg_m / 1.03) * (1.31 / hdl_m)
    else:
        vai = (waist / (36.58 + 1.89 * bmi)) * (tg_m / 0.81) * (1.52 / hdl_m)
    vai = round(vai, 2)
    return {
        "value": vai, "level": "info", "interpretation": "내장지방 기능이상 정도(참고)",
        "cutoffs": "정상체중 건강군 ≈1.0 기준 (연령별 컷오프 필요)",
        "formula": "VAI = 성별식(WC·BMI·TG·HDL), mmol/L 변환 적용",
        "note": "내장지방 기능이상 대리지표. 연령의존 컷오프 — 참고용.",
    }


# ============================================================
# 통합 진입점 — 계산기 결과를 items 리스트로 (도메인 그룹핑용 category 포함)
# ============================================================
# category: lipid(지질) / insulin(인슐린저항성) / adiposity(내장지방) /
#           liver(간) / bp(혈압)  → 프론트가 도메인 섹션에 배치.

# CKD-EPI 2021 성별 계수: (kappa, alpha)
_CKD_EPI_COEF = {1: (0.9, -0.302), 2: (0.7, -0.241)}   # 1=남, 2=여


def ckd_epi_2021(serum_cr, age, gender: int) -> Optional[float]:
    """eGFR (CKD-EPI 2021 크레아티닌 식, 인종 항 제거). 계산 불가하면 None.

        eGFR = 142 × (Scr/κ)^B × 0.9938^age × (1.012 if 여)
            B = alpha   (Scr ≤ κ)
            B = −1.200  (Scr > κ)

    ⚠️ 같은 공식이 app/renal/gfr.calculate_egfr에도 있다. 여기 한 벌을 더 두는 이유:
       _internal/은 별도 서비스로 떼어낼 수 있어야 해서 app.* 을 import할 수 없다
       (tests/test_analyzer_isolation.py가 강제). 주입으로 풀면 run_full_pipeline부터
       what_if까지 시그니처 네 곳이 바뀌는데, 발표된 5줄 공식이라 그만한 값이 없다고 봤다.

       두 벌이 갈라지는 것이 이 선택의 유일한 위험이라, tests/test_egfr_parity.py가
       두 구현의 출력이 항상 같은지 고정한다. 한쪽만 고치면 거기서 깨진다.

    ⚠️ app/renal 쪽은 잘못된 입력에 ValueError를 던지지만 여기는 None을 돌려준다.
       계산기 목록은 «계산 불가한 지표는 목록에서 빠진다»가 규칙이라 예외가 아니라 결측이다.
    """
    if not (_valid(serum_cr) and serum_cr > 0):
        return None
    if not (isinstance(age, (int, float)) and age > 0):
        return None

    kappa, alpha = _CKD_EPI_COEF.get(gender, _CKD_EPI_COEF[1])
    exponent = alpha if serum_cr <= kappa else -1.200
    egfr = 142.0 * (serum_cr / kappa) ** exponent * 0.9938 ** int(age)
    if gender == 2:
        egfr *= 1.012
    return round(egfr, 1)


def _egfr_of(checkup: dict[str, Any], age: Optional[int], gender: int) -> Optional[float]:
    """검진 크레아티닌·나이·성별로 eGFR(CKD-EPI 2021) 계산. 불가하면 None."""
    return ckd_epi_2021(checkup.get("혈청크레아티닌"), age, gender)


def additional_calculators(
    checkup: dict[str, Any],
    gender: int,
    age: Optional[int],
    user_groups: dict[str, bool],
    medications: Optional[dict[str, bool]] = None,
    year: Optional[int] = None,
) -> dict[str, Any]:
    """추가 계산기들을 계산해 items 리스트로 반환. 계산 불가한 지표는 목록에서 빠진다.

    각 item: {key, title, category, value, level, interpretation, cutoffs, formula, ...}
    category: lipid / insulin / adiposity / liver / bp / cardiovascular
    """
    from .risk_engines import (
        calculate_prevent_cvd, calculate_framingham_hard_chd, calculate_score2,
    )

    medications = medications or {}
    bmi = _bmi_of(checkup)
    has_diabetes = bool(user_groups.get("g_diabetes"))
    smoking = bool(user_groups.get("g_smoker_current"))
    bp_tx = bool(medications.get("hypertension"))
    statin = bool(medications.get("dyslipidemia"))
    tc = checkup.get("총콜레스테롤")
    hdl = checkup.get("HDL콜레스테롤")
    ldl = checkup.get("LDL콜레스테롤")
    tg = checkup.get("트리글리세라이드")
    fbs = checkup.get("식전혈당(공복혈당)")
    ast = checkup.get("혈청지오티(AST)")
    alt = checkup.get("혈청지피티(ALT)")
    ggt = checkup.get("감마지티피")
    waist = checkup.get("허리둘레")
    sbp = checkup.get("수축기혈압")
    dbp = checkup.get("이완기혈압")
    egfr = _egfr_of(checkup, age, gender)

    # (key, title, category, 계산결과, 결측라벨)
    specs: list[tuple[str, str, str, Optional[dict[str, Any]], str]] = [
        # 지질
        ("non_hdl_c", "Non-HDL 콜레스테롤", "lipid",
         calculate_non_hdl_c(tc, hdl, gender, age), "Non-HDL-C (총콜레스테롤·HDL 필요)"),
        ("castelli_1", "Castelli 지수 I", "lipid",
         calculate_castelli_1(tc, hdl), "Castelli-I (총콜레스테롤·HDL 필요)"),
        ("castelli_2", "Castelli 지수 II", "lipid",
         calculate_castelli_2(ldl, hdl), "Castelli-II (LDL·HDL 필요)"),
        ("aip", "AIP 죽상형성지수", "lipid",
         calculate_aip(tg, hdl, gender, age), "AIP (중성지방·HDL 필요)"),
        # 인슐린저항성
        ("tyg", "TyG 지수", "insulin",
         calculate_tyg(tg, fbs, gender, age), "TyG (중성지방·공복혈당 필요)"),
        ("mets_ir", "METS-IR", "insulin",
         calculate_mets_ir(fbs, tg, bmi, hdl), "METS-IR (공복혈당·중성지방·BMI·HDL 필요)"),
        # 내장지방
        ("lap", "LAP 지질축적산물", "adiposity",
         calculate_lap(waist, tg, gender), "LAP (허리둘레·중성지방 필요)"),
        ("vai", "VAI 내장지방지수", "adiposity",
         calculate_vai(waist, bmi, tg, hdl, gender), "VAI (허리·BMI·중성지방·HDL 필요)"),
        # 간
        ("de_ritis", "De Ritis 비 (AST/ALT)", "liver",
         calculate_de_ritis(ast, alt), "De Ritis (AST·ALT 필요)"),
        ("alt_ggt", "ALT/GGT 비", "liver",
         calculate_alt_ggt_ratio(alt, ggt), "ALT/GGT (ALT·감마지티피 필요)"),
        ("bard", "BARD 점수", "liver",
         calculate_bard(bmi, ast, alt, has_diabetes), "BARD (BMI·AST·ALT 필요)"),
        # 혈압
        ("map", "평균동맥압 (MAP)", "bp",
         calculate_map(sbp, dbp, gender, age), "MAP (수축기·이완기혈압 필요)"),
        # 심혈관 위험엔진
        ("prevent", "AHA PREVENT (10·30년)", "cardiovascular",
         calculate_prevent_cvd(age, gender, tc, hdl, sbp, has_diabetes, smoking,
                               egfr, bp_tx, statin, bmi),
         "PREVENT (나이·지질·혈압·eGFR〔크레아티닌〕 필요)"),
        ("framingham", "Framingham Hard CHD (10년)", "cardiovascular",
         calculate_framingham_hard_chd(age, gender, tc, hdl, sbp, bp_tx, smoking),
         "Framingham (나이·총콜레스테롤·HDL·혈압 필요)"),
        ("score2", "SCORE2 / OP (10년)", "cardiovascular",
         calculate_score2(age, gender, tc, hdl, sbp, has_diabetes, smoking),
         "SCORE2 (나이 40~89·총콜레스테롤·HDL·혈압 필요)"),
    ]

    from .calculator_percentile import peer_percentile
    items: list[dict[str, Any]] = []
    missing: list[str] = []
    for key, title, category, result, miss_label in specs:
        if result is None:
            missing.append(miss_label)
            continue
        item = {"key": key, "title": title, "category": category, **result}
        # 또래 백분위 부착. year는 «전수 측정되는» 지표(De Ritis·MAP)에만 쓰이고,
        # 지질 기반은 2017 고정이다 — 이유는 calculator_percentile.YEAR_SAFE 주석에.
        peer = peer_percentile(key, result.get("value"), gender, age, year)
        if peer:
            item.update(peer)
        items.append(item)

    return {
        "items": items,
        "unavailable": missing,
        "disclaimer": (
            "검진 수치로 산출하는 선별용 참고 지표입니다. 진단을 대체하지 않으며, "
            "컷오프는 연구·위험군에 따라 달라질 수 있습니다. 위험엔진(PREVENT·Framingham)은 "
            "서구 코호트 기반 참고용 시뮬레이션입니다."
        ),
    }
