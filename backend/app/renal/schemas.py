"""app/renal 모듈 전용 Pydantic 스키마.

모듈 격리 원칙에 따라 공용 app/schemas/ 에 섞지 않고 모듈 내부에 둔다.
배치 위치: backend/app/renal/schemas.py
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.renal.gfr import Sex


class RenalRequest(BaseModel):
    serum_cr: float = Field(..., gt=0, description="혈청 크레아티닌 (mg/dL)")
    age: int = Field(..., gt=0, description="만 나이")
    sex: Sex = Field(..., description="M(남) / F(여)")


class RenalResponse(BaseModel):
    egfr: float = Field(..., description="추정 사구체여과율 (mL/min/1.73㎡)")
    unit: str = "mL/min/1.73㎡"
    stage: str = Field(..., description="CKD 병기 (G1~G5)")
    label: str = Field(..., description="프론트 표시용 한글 라벨")
    description: str = Field(..., description="한 줄 설명")
    severity: str = Field(..., description="normal | caution | warning | danger")
    method: str = "CKD-EPI 2021 (creatinine)"
