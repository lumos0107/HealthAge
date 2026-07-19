"""공통 응답 스키마."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """표준 에러 응답."""
    error: str = Field(..., description="에러 코드")
    message: str = Field(..., description="에러 설명")
    detail: Any | None = Field(default=None, description="추가 정보 (선택)")


class MessageResponse(BaseModel):
    """단순 메시지 응답."""
    message: str
    detail: Any | None = None


class HealthCheckResponse(BaseModel):
    """/healthz 응답."""
    status: str = "ok"
    version: str
