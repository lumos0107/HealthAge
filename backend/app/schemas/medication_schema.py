"""투약이력 업로드 입출력 스키마."""
from __future__ import annotations

from pydantic import BaseModel, Field


class MedicationItem(BaseModel):
    """파싱된 투약 1건."""
    dispensed_date: str = Field(..., description="조제일자 YYYYMMDD")
    product_name: str = Field(..., description="제품명")
    efficacy_class: str = Field("", description="약효분류(효능)")
    ingredient_en: str = Field("", description="성분명(영문) — 엔진 매칭 키")
    total_days: int | None = Field(None, description="총 투약일수")
    times_per_day: int | None = None
    dose_per_time: str | None = None
    unit: str | None = None
    drug_code: str | None = None
    prescriber: str | None = None
    dispenser: str | None = None
    safety_alert: str | None = None
    antithrombotic: str | None = None


class MedicationUploadResponse(BaseModel):
    """업로드·파싱 결과 (미리보기 + 저장 결과)."""
    count: int = Field(..., description="파싱된 처방 건수")
    persisted: bool = Field(False, description="DB 저장 여부")
    inserted: int = Field(0, description="DB에 삽입된 행 수")
    unique_ingredients: list[str] = Field(
        default_factory=list, description="고유 성분명(영문) — 추천 엔진 입력용"
    )
    items: list[MedicationItem] = Field(default_factory=list)


class MedicationErrorResponse(BaseModel):
    detail: str
