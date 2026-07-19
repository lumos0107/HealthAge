"""
약봉투 OCR 전용 스키마.

검진지(schemas.py)와 별도로 약봉투 결과를 표현하는 데이터 구조.
응답 JSON 스키마(v0.1):

{
  "meta": {
    "source_images": [...],
    "page_count": N,
    "dispense_date": "YYYY-MM-DD" or null,
    "patient_name": str or null,
    "patient_birth": "YYYY-MM-DD" or null,
    "pharmacy_name": str or null,
    "prescriber": str or null,
    "ocr_confidence": float (0~1)
  },
  "medications": [
    {
      "name_raw": "타이레놀정 500mg",
      "name_normalized": null,        # 백엔드/분석 측이 채울 자리
      "dose_per_take": "1정" or null,
      "times_per_day": 3 or null,
      "duration_days": 5 or null,
      "timing": "식후 30분" or null,
      "notes": null
    }
  ],
  "medication_count_declared": 3 or null
}
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MedicationItem:
    """약품 한 개의 정보. 모든 필드 None 가능."""
    name_raw: str | None = None       # 약품명 원본 (OCR 추출 그대로)
    name_normalized: str | None = None  # 정규화/KD코드 매칭 결과 — OCR은 항상 None
    dose_per_take: str | None = None  # "1정", "5mL" 등
    times_per_day: int | None = None  # 1일 횟수
    duration_days: int | None = None  # 복용일수
    timing: str | None = None         # "식후 30분", "취침 전" 등
    notes: str | None = None          # 기타 주의사항

    def to_dict(self) -> dict[str, Any]:
        return {
            "name_raw": self.name_raw,
            "name_normalized": self.name_normalized,
            "dose_per_take": self.dose_per_take,
            "times_per_day": self.times_per_day,
            "duration_days": self.duration_days,
            "timing": self.timing,
            "notes": self.notes,
        }


@dataclass
class MedLabelMeta:
    """약봉투 한 장의 메타 정보. 환자 식별, 시계열 정렬에 사용."""
    dispense_date: str | None = None       # 조제일자 (YYYY-MM-DD)
    patient_name: str | None = None
    patient_birth: str | None = None       # 환자 생년월일 (YYYY-MM-DD)
    pharmacy_name: str | None = None       # 약국명
    prescriber: str | None = None          # 처방의/처방기관

    def to_dict(self) -> dict[str, Any]:
        return {
            "dispense_date": self.dispense_date,
            "patient_name": self.patient_name,
            "patient_birth": self.patient_birth,
            "pharmacy_name": self.pharmacy_name,
            "prescriber": self.prescriber,
        }


@dataclass
class MedLabelPageResult:
    """약봉투 1장의 OCR 결과 (병합 전, 단일 페이지 단위)."""
    page_name: str
    meta: MedLabelMeta = field(default_factory=MedLabelMeta)
    medications: list[MedicationItem] = field(default_factory=list)
    medication_count_declared: int | None = None  # 약봉투에 적힌 "총 N종" 같은 표시값
    ocr_confidence: float = 0.0                    # 0~1
    raw_meta: dict[str, Any] = field(default_factory=dict)  # backend 호출 메타 (디버깅용)


@dataclass
class MedLabelFinalResult:
    """약봉투 OCR 최종 결과 (멀티 페이지 병합 후).

    멀티 약봉투 시나리오: 각 이미지가 독립된 약봉투. medications는 모두 누적.
    meta는 첫 페이지 기준 (또는 가장 높은 confidence). dispense_date 등은 페이지별로 다를 수 있어
    히스토리 관점에선 각 페이지를 독립 record로 다루는 게 맞지만, OCR 응답은 일단 통합 dict.

    향후 백엔드/분석 측이 페이지별로 분리해서 시계열 record로 저장하는 게 자연스러움.
    """
    source_images: list[str]
    page_count: int
    meta: MedLabelMeta
    medications: list[MedicationItem]
    medication_count_declared: int | None
    ocr_confidence: float

    def to_final_json(self) -> dict[str, Any]:
        """최종 응답 JSON dict로 변환. 백엔드/프론트가 그대로 사용."""
        return {
            "meta": {
                "source_images": list(self.source_images),
                "page_count": self.page_count,
                "dispense_date": self.meta.dispense_date,
                "patient_name": self.meta.patient_name,
                "patient_birth": self.meta.patient_birth,
                "pharmacy_name": self.meta.pharmacy_name,
                "prescriber": self.meta.prescriber,
                "ocr_confidence": round(self.ocr_confidence, 2),
            },
            "medications": [m.to_dict() for m in self.medications],
            "medication_count_declared": self.medication_count_declared,
        }
