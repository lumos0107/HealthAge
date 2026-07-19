"""임상 정상값(정상 범위) 참조 테이블.

NHIS 530MB '인구 참조 데이터(평균/분포)'와는 별개로, 검진 항목별 임상 정상
기준(국가건강검진 판정 기준)을 정의한다. 순수 데이터/타입만 포함한다.
배치 위치: backend/app/reference/ranges.py

NOTE: 연구 레포의 양방향 임계값 정의가 단일 소스라면, 이 테이블을 거기서
끌어다 채우는 쪽을 권장한다(기준이 두 곳에서 어긋나는 것을 방지).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Sex(str, Enum):
    MALE = "M"
    FEMALE = "F"


class Direction(str, Enum):
    HIGH_BAD = "high_bad"   # 높을수록 나쁨 (혈압, 혈당, 콜레스테롤 등)
    LOW_BAD = "low_bad"     # 낮을수록 나쁨 (HDL, eGFR 등)
    BOTH = "both"           # 양쪽 모두 위험 (혈색소, BMI 등)
    U_SHAPE = "u_shape"     # U자형 — 평가상 BOTH와 동일 처리


@dataclass(frozen=True)
class RefRange:
    """항목별 정상 범위 정의.

    - 정상 구간: [normal_low, normal_high]
    - 높은 쪽: normal_high < value < abnormal_high -> '주의', value >= abnormal_high -> '이상'
              (abnormal_high 가 None 이면 normal_high 초과는 곧바로 '이상')
    - 낮은 쪽: abnormal_low < value < normal_low -> '주의', value <= abnormal_low -> '이상'
              (abnormal_low 가 None 이면 normal_low 미만은 곧바로 '이상')
    direction 에 따라 한쪽만 평가한다.
    """
    unit: str
    direction: Direction
    normal_low: float | None = None
    normal_high: float | None = None
    abnormal_low: float | None = None
    abnormal_high: float | None = None


# 성별 무관 항목 ----------------------------------------------------------
_BASE: dict[str, RefRange] = {
    "sbp":        RefRange("mmHg", Direction.HIGH_BAD, normal_high=120, abnormal_high=140),
    "dbp":        RefRange("mmHg", Direction.HIGH_BAD, normal_high=80,  abnormal_high=90),
    "fbs":        RefRange("mg/dL", Direction.HIGH_BAD, normal_high=100, abnormal_high=126),
    "total_chol": RefRange("mg/dL", Direction.HIGH_BAD, normal_high=200, abnormal_high=240),
    "ldl":        RefRange("mg/dL", Direction.HIGH_BAD, normal_high=130, abnormal_high=160),
    "tg":         RefRange("mg/dL", Direction.HIGH_BAD, normal_high=150, abnormal_high=200),
    "ast":        RefRange("IU/L", Direction.HIGH_BAD, normal_high=40),
    "alt":        RefRange("IU/L", Direction.HIGH_BAD, normal_high=40),
    # BMI: 정상 18.5~22.9, 과체중 23~24.9(주의), 비만 >=25(이상), 저체중 <18.5(주의/이상)
    "bmi":        RefRange("kg/m^2", Direction.BOTH, normal_low=18.5, normal_high=23.0, abnormal_high=25.0),
    # eGFR: >=60 정상, <60 신기능 저하 (renal 모듈과 기준 동일)
    "egfr":       RefRange("mL/min/1.73m^2", Direction.LOW_BAD, normal_low=60),
}

# 성별 의존 항목 ----------------------------------------------------------
_BY_SEX: dict[str, dict[Sex, RefRange]] = {
    # HDL: 낮을수록 나쁨. 남 <40, 여 <50 위험 (대사증후군 기준)
    "hdl": {
        Sex.MALE:   RefRange("mg/dL", Direction.LOW_BAD, normal_low=40),
        Sex.FEMALE: RefRange("mg/dL", Direction.LOW_BAD, normal_low=50),
    },
    # 허리둘레(복부비만): 남 >=90, 여 >=85 이상
    "waist": {
        Sex.MALE:   RefRange("cm", Direction.HIGH_BAD, normal_high=90),
        Sex.FEMALE: RefRange("cm", Direction.HIGH_BAD, normal_high=85),
    },
    # 혈색소: 양방향. 남 13~16.5, 여 12~15.5
    "hb": {
        Sex.MALE:   RefRange("g/dL", Direction.BOTH, normal_low=13.0, normal_high=16.5),
        Sex.FEMALE: RefRange("g/dL", Direction.BOTH, normal_low=12.0, normal_high=15.5),
    },
    # GGT: 남 11~63, 여 8~35
    "ggt": {
        Sex.MALE:   RefRange("IU/L", Direction.HIGH_BAD, normal_low=11, normal_high=63),
        Sex.FEMALE: RefRange("IU/L", Direction.HIGH_BAD, normal_low=8,  normal_high=35),
    },
    # 크레아티닌: 남 0.7~1.3, 여 0.6~1.1 (높은 쪽이 신기능 저하)
    "creatinine": {
        Sex.MALE:   RefRange("mg/dL", Direction.HIGH_BAD, normal_low=0.7, normal_high=1.3),
        Sex.FEMALE: RefRange("mg/dL", Direction.HIGH_BAD, normal_low=0.6, normal_high=1.1),
    },
}


def supported_items() -> list[str]:
    return sorted([*_BASE.keys(), *_BY_SEX.keys()])


def get_reference(item: str, sex: Sex | None = None) -> RefRange:
    """항목명(+성별)으로 정상 범위 정의를 조회한다."""
    if item in _BY_SEX:
        if sex is None:
            raise ValueError(f"'{item}' 항목은 성별(sex)이 필요합니다.")
        return _BY_SEX[item][sex]
    if item in _BASE:
        return _BASE[item]
    raise KeyError(f"등록되지 않은 항목: {item}")
