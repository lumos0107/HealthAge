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
    weight_kg: float | None = Field(
        default=None, gt=0,
        description="체중(kg). 주면 약물 용량 참고용 CrCl(Cockcroft-Gault)도 함께 계산.",
    )


class RenalResponse(BaseModel):
    egfr: float = Field(..., description="추정 사구체여과율 (mL/min/1.73㎡)")
    unit: str = "mL/min/1.73㎡"
    stage: str = Field(..., description="CKD 병기 (G1~G5)")
    label: str = Field(..., description="프론트 표시용 한글 라벨")
    description: str = Field(..., description="한 줄 설명")
    severity: str = Field(..., description="normal | caution | warning | danger")
    method: str = "CKD-EPI 2021 (creatinine)"
    # 체중을 주지 않으면 null — 추정하지 않는다.
    crcl: float | None = Field(default=None, description="크레아티닌 청소율 (mL/min, Cockcroft-Gault)")
    crcl_label: str | None = Field(default=None, description="CrCl 구간 라벨")
    crcl_note: str | None = Field(default=None, description="약물 용량 관점 설명")
    crcl_method: str = "Cockcroft-Gault"
