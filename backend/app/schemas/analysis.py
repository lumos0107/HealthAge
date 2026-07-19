"""분석 결과 스키마.

analysis_results 테이블 매핑. JSONB 두 개 (basic_report, comprehensive)는
구조가 자주 진화하니 dict로 받아 검증 최소화.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AnalysisResultBase(BaseModel):
    """분석 결과 공통 필드."""
    analyzer_version: str
    basic_report: dict[str, Any]
    comprehensive: dict[str, Any]


class AnalysisResultResponse(AnalysisResultBase):
    """분석 결과 조회 응답."""
    model_config = ConfigDict(from_attributes=True)

    analysis_id: str
    record_id: str
    user_id: str
    analyzed_at: str


class AnalysisRerunRequest(BaseModel):
    """재분석 요청. record_id 받아서 다시 분석 후 새 행으로 저장."""
    record_id: str = Field(description="재분석할 검진 ID")


class AnalyzeWithCheckupResponse(BaseModel):
    """검진 등록 + 자동 분석 응답.

    POST /checkups의 응답 형식. 검진 행과 분석 결과를 함께 반환.
    """
    checkup: dict[str, Any]
    analysis: dict[str, Any]
