"""OCR 업로드 스키마."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    """POST /uploads 응답.

    OCR JSON을 그대로 반환. 프론트는 이걸 검수 화면에 채우고,
    사용자가 OK하면 POST /analyze로 다시 보냄.
    """
    ocr: dict[str, Any] = Field(description="OCR 결과 JSON")
    warnings: list[str] = Field(default_factory=list)
