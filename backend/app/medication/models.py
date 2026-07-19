"""투약이력 도메인 모델."""
from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class MedicationRecord:
    """HIRA 개인투약이력 한 행."""
    dispensed_date: str          # 조제일자 (YYYYMMDD)
    product_name: str            # 제품명
    efficacy_class: str          # 약효분류 (효능 — 히스토리 표시용)
    ingredient_en: str           # 성분명(영문) — 추천 엔진 매칭 키
    total_days: int | None = None      # 총 투약일수
    times_per_day: int | None = None   # 1일 투여횟수
    dose_per_time: str | None = None   # 1회 투약량
    unit: str | None = None            # 단위
    drug_code: str | None = None       # 약품코드
    prescriber: str | None = None      # 처방기관
    dispenser: str | None = None       # 조제기관
    safety_alert: str | None = None    # 안전성 서한(속보)
    antithrombotic: str | None = None  # 항혈전제 여부

    def to_dict(self) -> dict:
        return asdict(self)
