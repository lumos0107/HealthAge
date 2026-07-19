"""
표준 데이터 형식 정의.

모든 모듈 간 데이터 교환은 이 형식을 따른다.
splitter, pipeline의 구현체가 바뀌어도 이 형식만 유지하면 됨.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ----------------------------------------
# 영역 타입
# ----------------------------------------

class RegionType(str, Enum):
    """이미지 내 영역의 종류."""
    TABLE = "table"
    CHECKBOX = "checkbox"
    GRAPHIC = "graphic"      # 막대그래프, 게이지, 자(눈금) 등
    METADATA = "metadata"    # 환자정보/검진일자/병원명 등 텍스트 메타
    UNKNOWN = "unknown"


# ----------------------------------------
# 영역 정보 (splitter 출력의 기본 단위)
# ----------------------------------------

@dataclass
class RegionInfo:
    """이미지 내 한 영역의 정보.
    
    bbox는 (x1, y1, x2, y2) 픽셀 좌표.
    x1, y1: 좌상단, x2, y2: 우하단.
    
    source: 영역의 출처 (그래픽 영역에서 모드 선택에 사용).
        - "inside_table":  격자 있는 표 영역 (모드 A — 정교한 처리)
        - "outside_table": 격자 없는 단독 그래픽 (모드 B — best-effort)
        - None: 표 영역 등 source 구분 불필요한 경우
    """
    region_type: RegionType
    bbox: tuple[int, int, int, int]
    confidence: float = 1.0
    label: str | None = None  # 영역에 대한 라벨 (예: "신체계측", "혈액검사")
    source: str | None = None  # GraphicPipeline 모드 선택용
    
    @property
    def width(self) -> int:
        return self.bbox[2] - self.bbox[0]
    
    @property
    def height(self) -> int:
        return self.bbox[3] - self.bbox[1]
    
    @property
    def area(self) -> int:
        return self.width * self.height
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "region_type": self.region_type.value,
            "bbox": list(self.bbox),
            "confidence": self.confidence,
            "label": self.label,
            "source": self.source,
            "width": self.width,
            "height": self.height,
        }


# ----------------------------------------
# Splitter 출력
# ----------------------------------------

@dataclass
class SplitResult:
    """splitter의 표준 출력 형식.
    
    모든 splitter 구현체(LLM, OpenCV 등)는 이 형식으로 결과 반환.
    """
    regions: list[RegionInfo]
    image_width: int
    image_height: int
    
    def get_by_type(self, region_type: RegionType) -> list[RegionInfo]:
        """특정 타입의 영역만 필터링."""
        return [r for r in self.regions if r.region_type == region_type]
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "image_width": self.image_width,
            "image_height": self.image_height,
            "regions": [r.to_dict() for r in self.regions],
        }


# ----------------------------------------
# Pipeline 출력
# ----------------------------------------

@dataclass
class PipelineResult:
    """파이프라인의 표준 출력 형식.
    
    measurements: { "hb": {"value": 15.9, "unit": "g/dL"}, ... }
    lifestyle:    { "smoking": "current", "drinking": "yes" }
    meta:         메타 정보
    debug:        디버깅 정보 (어느 영역에서 추출됐는지 등)
    
    [step12] 추가:
    measurements_confidence: { "hb": {"confidence": 0.95, "flags": []}, ... }
    lifestyle_confidence:    { "smoking": {"confidence": 0.9, "flags": []}, ... }
        — confidence 평가 결과 (없으면 빈 dict)
    """
    measurements: dict[str, dict[str, Any]] = field(default_factory=dict)
    lifestyle: dict[str, str | None] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)
    debug: dict[str, Any] = field(default_factory=dict)
    # [step12] confidence 필드
    measurements_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)
    lifestyle_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "measurements": self.measurements,
            "lifestyle": self.lifestyle,
            "meta": self.meta,
            "debug": self.debug,
            "measurements_confidence": self.measurements_confidence,
            "lifestyle_confidence": self.lifestyle_confidence,
        }


# ----------------------------------------
# 표준 measurement 키 (16개)
# ----------------------------------------

MEASUREMENT_KEYS_WITH_UNITS: dict[str, str] = {
    "height":            "cm",
    "weight":            "kg",
    "waist":             "cm",
    "sbp":               "mmHg",
    "dbp":               "mmHg",
    "fbs":               "mg/dL",
    "total_cholesterol": "mg/dL",
    "ldl":               "mg/dL",
    "hdl":               "mg/dL",
    "tg":                "mg/dL",
    "hb":                "g/dL",
    "creatinine":        "mg/dL",
    "ast":               "IU/L",
    "alt":               "IU/L",
    "ggt":               "IU/L",
    "urine_protein":     "code",
}

# ----------------------------------------
# 요단백 코드 매핑 (3단계로 단순화)
# ----------------------------------------
# 1 = 정상       (음성, -)
# 2 = 경계       (약양성, ±)
# 3 = 단백뇨 의심 (양성 이상: +, ++, +++, ++++)

URINE_PROTEIN_CODE_MAP: dict[str, int] = {
    # 정상 (1)
    "(-)": 1, "음성": 1, "-": 1, "정상": 1,
    # 경계 (2)
    "(±)": 2, "약양성": 2, "±": 2, "경계": 2,
    # 단백뇨 의심 (3) - 모든 양성 단계 통합
    "(+)": 3, "1+": 3, "+": 3,
    "(++)": 3, "2+": 3, "++": 3,
    "(+++)": 3, "3+": 3, "+++": 3,
    "(++++)": 3, "4+": 3, "++++": 3,
    "단백뇨 의심": 3, "단백뇨의심": 3, "양성": 3,
}

# 역매핑: 코드 → 표준 라벨
URINE_PROTEIN_CODE_TO_LABEL: dict[int, str] = {
    1: "정상",
    2: "경계",
    3: "단백뇨 의심",
}

# ----------------------------------------
# lifestyle enum 매핑
# ----------------------------------------

SMOKING_VALUES = {"never", "former", "current"}
DRINKING_VALUES = {"yes", "no"}
