"""신장 기능(eGFR) 분석 모듈 — CKD-EPI 2021 기반.

외부에서는 router(등록용) 와 analyze_renal/calculate_egfr(직접 호출용) 만
사용하면 된다. 다른 모듈(analyzer, ocr 등)과 동급의 독립 모듈이다.
배치 위치: backend/app/renal/__init__.py
"""
from app.renal.gfr import (
    Sex,
    RenalStatus,
    analyze_renal,
    calculate_egfr,
    classify_stage,
)
from app.renal.router import router

__all__ = [
    "Sex",
    "RenalStatus",
    "analyze_renal",
    "calculate_egfr",
    "classify_stage",
    "router",
]
