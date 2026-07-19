"""app/reference 모듈 전용 Pydantic 스키마.

배치 위치: backend/app/reference/schemas.py
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.reference.ranges import Sex


class ItemInput(BaseModel):
    item: str = Field(..., description="항목 키 (sbp, fbs, hdl, bmi ...)")
    value: float = Field(..., description="사용자 측정값")
    population_mean: float | None = Field(
        None, description="해당 항목 인구 평균 (있으면 평균 비교 포함)"
    )


class EvaluateRequest(BaseModel):
    sex: Sex = Field(..., description="M(남) / F(여)")
    items: list[ItemInput]


class ItemResult(BaseModel):
    item: str
    value: float
    unit: str
    # 정상값 비교
    normal_low: float | None
    normal_high: float | None
    normal_status: str = Field(..., description="normal | low | high")
    severity: str = Field(..., description="normal | caution | warning")
    in_normal_range: bool
    # 평균 비교
    population_mean: float | None
    diff_from_mean: float | None
    pct_from_mean: float | None
    mean_position: str | None = Field(None, description="above | below | near")


class EvaluateResponse(BaseModel):
    sex: Sex
    results: list[ItemResult]
