"""
Confidence 휴리스틱 평가.

목적: OCR이 "잘못 읽었을 가능성"을 값의 범위/카테고리로 추정.
- 의학적 정상 범위가 아니라 "물리적으로 말이 안 되는 값"을 잡음.
- 의학적 정상/비정상 판정은 분석 측 책임이며, 여기선 OCR 실수 가능성만.

반환: 각 변수별 (confidence: float, flags: list[str]).
- 범위 안: confidence=1.0, flags=[]
- 범위 밖: confidence=0.5, flags=["out_of_range_suspect"]
- 카테고리 이상: confidence=0.5, flags=["invalid_category"]

[step12] 신규.
"""

from __future__ import annotations
from typing import Any

from app.ocr.pipeline.utils.schemas import (
    SMOKING_VALUES,
    DRINKING_VALUES,
)


# ----------------------------------------
# 휴리스틱 범위 (OCR 측 자체 기준 — 의학적 정상 ≠)
# ----------------------------------------
# "값이 이 범위 안이면 OCR이 잘 읽었을 가능성 높음".
# 범위는 넓게 — 의학적으로 비정상이어도 OCR 입장에선 그럴 수 있다고 본다.

NUMERIC_RANGES: dict[str, tuple[float, float]] = {
    "height":            (120.0, 220.0),    # cm
    "weight":            (25.0, 200.0),     # kg
    "bmi":               (12.0, 50.0),
    "waist":             (40.0, 180.0),     # cm
    "sbp":               (60.0, 250.0),     # mmHg
    "dbp":               (30.0, 180.0),     # mmHg
    "fbs":               (30.0, 600.0),     # mg/dL
    "total_cholesterol": (20.0, 600.0),
    "ldl":               (20.0, 600.0),
    "hdl":               (10.0, 200.0),
    "tg":                (20.0, 2000.0),
    "hb":                (5.0, 22.0),       # g/dL
    "creatinine":        (0.1, 15.0),
    "egfr":              (0.0, 200.0),
    "ast":               (1.0, 3000.0),
    "alt":               (1.0, 3000.0),
    "ggt":               (1.0, 3000.0),
}

# urine_protein은 code 기반 (1~3)
URINE_PROTEIN_VALID_CODES = {1, 2, 3}


# ----------------------------------------
# 평가 함수
# ----------------------------------------

def heuristic_measurements(measurements: dict[str, dict[str, Any]]) -> dict[str, tuple[float, list[str]]]:
    """measurements dict 각 항목에 휴리스틱 confidence 부여.
    
    Args:
        measurements: {"sbp": {"value": 135, "unit": "mmHg"}, ...}
    
    Returns:
        {"sbp": (1.0, []), "dbp": (0.5, ["out_of_range_suspect"]), ...}
        — measurements에 있는 키만 평가. null/missing은 평가 안 함.
    """
    result: dict[str, tuple[float, list[str]]] = {}
    
    for key, item in measurements.items():
        if not isinstance(item, dict):
            continue
        
        # urine_protein은 code 기반
        if key == "urine_protein":
            code = item.get("code")
            if code is None:
                continue  # 값 자체 없음 → 평가 대상 아님
            if code in URINE_PROTEIN_VALID_CODES:
                result[key] = (1.0, [])
            else:
                result[key] = (0.5, ["invalid_category"])
            continue
        
        # 수치형
        value = item.get("value")
        if value is None or not isinstance(value, (int, float)):
            continue  # 평가 대상 아님 (값 없거나 비숫자)
        
        rng = NUMERIC_RANGES.get(key)
        if rng is None:
            # 알려진 키가 아님 — 일단 통과
            result[key] = (1.0, [])
            continue
        
        lo, hi = rng
        if lo <= value <= hi:
            result[key] = (1.0, [])
        else:
            result[key] = (0.5, ["out_of_range_suspect"])
    
    return result


def heuristic_lifestyle(lifestyle: dict[str, Any]) -> dict[str, tuple[float, list[str]]]:
    """lifestyle dict 각 항목에 휴리스틱 confidence 부여.
    
    Args:
        lifestyle: {"smoking": "current", "drinking": "yes"}
    
    Returns:
        {"smoking": (1.0, []), "drinking": (0.5, ["invalid_category"]), ...}
        — lifestyle에 있고 null이 아닌 키만 평가.
    """
    result: dict[str, tuple[float, list[str]]] = {}
    
    smoking = lifestyle.get("smoking")
    if smoking is not None:
        if isinstance(smoking, str) and smoking in SMOKING_VALUES:
            result["smoking"] = (1.0, [])
        else:
            result["smoking"] = (0.5, ["invalid_category"])
    
    drinking = lifestyle.get("drinking")
    if drinking is not None:
        if isinstance(drinking, str) and drinking in DRINKING_VALUES:
            result["drinking"] = (1.0, [])
        else:
            result["drinking"] = (0.5, ["invalid_category"])
    
    return result
