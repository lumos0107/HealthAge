"""임상 정상값 비교 모듈.

검진 항목을 (1) 임상 정상 범위와 (2) 인구 평균에 동시에 비교한다.
analyzer, ocr, renal 과 동급의 독립 모듈이다.
외부에서는 router(등록용) 와 evaluate_item(직접 호출용) 만 쓰면 된다.
배치 위치: backend/app/reference/__init__.py
"""
from app.reference.ranges import (
    Direction,
    RefRange,
    Sex,
    get_reference,
    supported_items,
)
from app.reference.evaluate import (
    ItemEvaluation,
    evaluate_item,
    evaluate_normal,
    evaluate_against_mean,
)
from app.reference.router import router

__all__ = [
    "Direction",
    "RefRange",
    "Sex",
    "get_reference",
    "supported_items",
    "ItemEvaluation",
    "evaluate_item",
    "evaluate_normal",
    "evaluate_against_mean",
    "router",
]
