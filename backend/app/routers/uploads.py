"""OCR 업로드 라우터.

POST /uploads — 이미지 multipart → OCR JSON 반환 (DB 저장 X).
프론트의 검수 화면용. 사용자가 검수 후 POST /analyze로 다시 보냄.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, UploadFile

from app.auth import CurrentUser, get_current_user
from app.schemas.uploads import UploadResponse
from app.services.upload_service import upload_and_extract

logger = logging.getLogger(__name__)

router = APIRouter(tags=["uploads"])


@router.post("/uploads", response_model=UploadResponse)
async def upload_image(
    file: UploadFile = File(..., description="검진지 이미지 (PNG/JPEG/WEBP, 최대 10MB)"),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """검진지 이미지를 OCR로 분석해 JSON 반환.

    응답의 ocr JSON은 프론트의 검수 화면에 표시되어 사용자가 검토/수정 후
    POST /analyze로 다시 보냄. 이미지 자체는 보관하지 않음 (의료법 단순화).
    """
    image_bytes = await file.read()
    logger.info(
        "uploads: user=%s, filename=%s, size=%d bytes, content_type=%s",
        user.id, file.filename, len(image_bytes), file.content_type,
    )
    return await upload_and_extract(image_bytes, file.content_type)
