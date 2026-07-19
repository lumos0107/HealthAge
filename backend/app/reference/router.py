"""app/reference 모듈 라우터.

배치 위치: backend/app/reference/router.py
"""
from __future__ import annotations

from fastapi import APIRouter

from app.reference.evaluate import evaluate_item
from app.reference.ranges import supported_items
from app.reference.schemas import EvaluateRequest, EvaluateResponse, ItemResult

router = APIRouter(prefix="/reference", tags=["reference"])


@router.get("/items")
def list_items() -> dict:
    """평가 지원 항목 목록."""
    return {"items": supported_items()}


@router.post("/evaluate", response_model=EvaluateResponse)
def post_evaluate(payload: EvaluateRequest) -> EvaluateResponse:
    """여러 검진 항목을 정상값·평균 기준으로 한 번에 평가."""
    results = [
        ItemResult(**evaluate_item(
            item=it.item, value=it.value,
            sex=payload.sex, population_mean=it.population_mean,
        ).to_dict())
        for it in payload.items
    ]
    return EvaluateResponse(sex=payload.sex, results=results)
