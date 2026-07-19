"""app/renal 모듈 라우터.

배치 위치: backend/app/renal/router.py
"""
from __future__ import annotations

from fastapi import APIRouter

from app.renal.gfr import analyze_renal
from app.renal.schemas import RenalRequest, RenalResponse

router = APIRouter(prefix="/renal", tags=["renal"])


@router.post("/egfr", response_model=RenalResponse)
def post_egfr(payload: RenalRequest) -> RenalResponse:
    """크레아티닌·나이·성별로 eGFR과 신장 상태(병기)를 반환."""
    result = analyze_renal(payload.serum_cr, payload.age, payload.sex)
    return RenalResponse(**result.to_dict())
