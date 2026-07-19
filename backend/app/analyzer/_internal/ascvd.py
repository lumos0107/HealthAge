"""ASCVD 10년 위험도 — 참고용 시뮬레이션 (진단·예측 아님).

⚠️ 이 모듈을 쓰기 전에 반드시 읽을 것
────────────────────────────────────────────────────────────
사용하는 식은 2013 ACC/AHA Pooled Cohort Equations로, **미국 백인·흑인
코호트에서 도출**되었다. 한국인 코호트에서는 위험도를 **과대추정**하는
경향이 반복적으로 보고되었고, 국내 진료지침도 이 식을 한국인에게 그대로
적용하는 것을 권고하지 않는다.

그럼에도 넣는 이유는 "지금 이 수치들이 바뀌면 위험이 어떻게 움직이는가"를
사용자가 체감하게 하는 **비교·교육용 도구**로서다. 그래서:
  - 절대 위험도(%)를 단독으로 강조하지 않는다.
  - 항상 `is_simulation=True`와 한계 문구를 함께 반환한다.
  - 위험도 등급을 진단명처럼 쓰지 않는다.
  - 금연·혈압 개선 시의 변화(what-if)를 함께 제공해, 절대값보다
    **변화의 방향과 크기**를 읽도록 유도한다.

이 프로젝트가 ML 질병예측을 버리고 "설명 가능한 통계"를 택한 것과 같은 이유로,
이 값은 예측이 아니라 참고 시뮬레이션으로만 제시한다.
"""
from __future__ import annotations

import math
from typing import Any, Optional


# Pooled Cohort Equations 계수 (2013 ACC/AHA, White 계열)
# (ln_age, ln_tc, ln_hdl, ln_sbp_treated, ln_sbp_untreated, smoker, diabetes,
#  + 상호작용항, mean_sum, baseline_survival)
_COEF = {
    1: {  # 남성
        "ln_age": 12.344, "ln_tc": 11.853, "ln_age_ln_tc": -2.664,
        "ln_hdl": -7.990, "ln_age_ln_hdl": 1.769,
        "ln_sbp_treated": 1.797, "ln_sbp_untreated": 1.764,
        "smoker": 7.837, "ln_age_smoker": -1.795,
        "diabetes": 0.658,
        "mean_sum": 61.18, "baseline_survival": 0.9144,
    },
    2: {  # 여성
        "ln_age": -29.799, "ln_age_sq": 4.884, "ln_tc": 13.540,
        "ln_age_ln_tc": -3.114, "ln_hdl": -13.578, "ln_age_ln_hdl": 3.149,
        "ln_sbp_treated": 2.019, "ln_sbp_untreated": 1.957,
        "smoker": 7.574, "ln_age_smoker": -1.665,
        "diabetes": 0.661,
        "mean_sum": -29.18, "baseline_survival": 0.9665,
    },
}

# 적용 가능 연령 (원 논문의 검증 범위)
AGE_MIN, AGE_MAX = 40, 79


def _risk_level(pct: float) -> tuple[str, str]:
    """위험도 구간. 진단이 아니라 참고 구간임을 라벨에 드러낸다."""
    if pct < 5:
        return ("low", "낮은 편")
    if pct < 7.5:
        return ("borderline", "경계 구간")
    if pct < 20:
        return ("intermediate", "중간 구간")
    return ("high", "높은 편")


def calculate_ascvd_risk(
    age: Optional[int],
    gender: Optional[int],
    total_cholesterol: Optional[float],
    hdl: Optional[float],
    sbp: Optional[float],
    is_smoker: bool,
    has_diabetes: bool,
    on_bp_medication: bool = False,
) -> Optional[dict[str, Any]]:
    """10년 ASCVD 위험도(%) 계산. 입력이 부족하거나 범위 밖이면 None.

    Returns:
        {"risk_percent", "risk_level", "risk_label", "inputs", ...} 또는 None
    """
    if gender not in (1, 2):
        return None
    if not isinstance(age, int) or not (AGE_MIN <= age <= AGE_MAX):
        return None
    for v in (total_cholesterol, hdl, sbp):
        if not isinstance(v, (int, float)) or v <= 0:
            return None

    c = _COEF[gender]
    ln_age = math.log(age)
    ln_tc = math.log(total_cholesterol)
    ln_hdl = math.log(hdl)
    ln_sbp = math.log(sbp)

    s = 0.0
    s += c["ln_age"] * ln_age
    if gender == 2:
        s += c["ln_age_sq"] * (ln_age ** 2)
    s += c["ln_tc"] * ln_tc
    s += c["ln_age_ln_tc"] * ln_age * ln_tc
    s += c["ln_hdl"] * ln_hdl
    s += c["ln_age_ln_hdl"] * ln_age * ln_hdl
    s += (c["ln_sbp_treated"] if on_bp_medication else c["ln_sbp_untreated"]) * ln_sbp
    if is_smoker:
        s += c["smoker"] + c["ln_age_smoker"] * ln_age
    if has_diabetes:
        s += c["diabetes"]

    try:
        risk = 1 - c["baseline_survival"] ** math.exp(s - c["mean_sum"])
    except (OverflowError, ValueError):
        return None

    pct = round(max(0.0, min(1.0, risk)) * 100, 1)
    level, label = _risk_level(pct)

    return {
        "risk_percent": pct,
        "risk_level": level,
        "risk_label": label,
        "inputs": {
            "age": age,
            "gender": "남" if gender == 1 else "여",
            "total_cholesterol": total_cholesterol,
            "hdl": hdl,
            "sbp": sbp,
            "smoker": is_smoker,
            "diabetes": has_diabetes,
            "on_bp_medication": on_bp_medication,
        },
    }


def _what_if(base: dict[str, Any], **overrides) -> Optional[dict[str, Any]]:
    """입력 일부를 바꿔 다시 계산 (변화량 제시용)."""
    i = base["inputs"]
    return calculate_ascvd_risk(
        age=i["age"],
        gender=1 if i["gender"] == "남" else 2,
        total_cholesterol=overrides.get("total_cholesterol", i["total_cholesterol"]),
        hdl=overrides.get("hdl", i["hdl"]),
        sbp=overrides.get("sbp", i["sbp"]),
        is_smoker=overrides.get("smoker", i["smoker"]),
        has_diabetes=overrides.get("diabetes", i["diabetes"]),
        on_bp_medication=i["on_bp_medication"],
    )


def run_ascvd_simulation(
    checkup: dict[str, Any],
    gender: Optional[int],
    age: Optional[int],
    user_groups: dict[str, bool],
    medications: Optional[dict[str, bool]] = None,
) -> dict[str, Any]:
    """검진 결과로 ASCVD 참고 시뮬레이션을 수행.

    계산이 불가능하면 available=False와 사유를 돌려준다(값을 지어내지 않는다).
    """
    medications = medications or {}

    base = calculate_ascvd_risk(
        age=age,
        gender=gender,
        total_cholesterol=checkup.get("총콜레스테롤"),
        hdl=checkup.get("HDL콜레스테롤"),
        sbp=checkup.get("수축기혈압"),
        is_smoker=bool(user_groups.get("g_smoker_current")),
        has_diabetes=bool(user_groups.get("g_diabetes")),
        on_bp_medication=bool(medications.get("hypertension")),
    )

    if base is None:
        missing = []
        if not isinstance(age, int) or not (AGE_MIN <= (age or 0) <= AGE_MAX):
            missing.append(f"만 {AGE_MIN}~{AGE_MAX}세 범위의 나이")
        for key, label in (
            ("총콜레스테롤", "총콜레스테롤"),
            ("HDL콜레스테롤", "HDL"),
            ("수축기혈압", "수축기혈압"),
        ):
            if not isinstance(checkup.get(key), (int, float)):
                missing.append(label)
        return {
            "available": False,
            "reason": (
                f"{', '.join(missing)}이(가) 없어 계산할 수 없습니다."
                if missing else "입력값이 부족해 계산할 수 없습니다."
            ),
            "is_simulation": True,
        }

    # what-if — 절대값보다 "무엇을 바꾸면 얼마나 달라지는가"를 보여준다.
    scenarios = []
    if base["inputs"]["smoker"]:
        quit_smoking = _what_if(base, smoker=False)
        if quit_smoking:
            scenarios.append({
                "name": "금연했다면",
                "risk_percent": quit_smoking["risk_percent"],
                "delta": round(quit_smoking["risk_percent"] - base["risk_percent"], 1),
            })
    if base["inputs"]["sbp"] > 120:
        bp_120 = _what_if(base, sbp=120)
        if bp_120:
            scenarios.append({
                "name": "수축기혈압이 120이라면",
                "risk_percent": bp_120["risk_percent"],
                "delta": round(bp_120["risk_percent"] - base["risk_percent"], 1),
            })
    if base["inputs"]["hdl"] < 60:
        hdl_60 = _what_if(base, hdl=60)
        if hdl_60:
            scenarios.append({
                "name": "HDL이 60이라면",
                "risk_percent": hdl_60["risk_percent"],
                "delta": round(hdl_60["risk_percent"] - base["risk_percent"], 1),
            })

    return {
        "available": True,
        "is_simulation": True,
        **base,
        "scenarios": scenarios,
        "method": "Pooled Cohort Equations (2013 ACC/AHA)",
        "limitations": [
            "이 식은 미국 코호트에서 만들어졌으며 한국인에서는 위험도를 "
            "실제보다 높게 추정하는 경향이 보고되었습니다.",
            "국내 진료지침은 이 식을 한국인에게 그대로 적용하도록 권고하지 않습니다.",
            "따라서 표시된 %는 진단이나 예측이 아니라, 수치가 달라질 때 위험이 "
            "어느 방향으로 얼마나 움직이는지 보기 위한 참고 시뮬레이션입니다.",
            "가족력·병력이 반영되지 않아 실제 위험과 다를 수 있습니다.",
        ],
        "how_to_read": (
            "절대적인 % 값보다, 아래 '무엇을 바꾸면' 항목의 변화 폭을 참고하세요."
        ),
    }
