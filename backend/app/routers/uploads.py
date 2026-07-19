"""OCR 업로드 라우터.

POST /uploads — 이미지 multipart → OCR JSON 반환 (DB 저장 X).
프론트의 검수 화면용. 사용자가 검수 후 POST /analyze로 다시 보냄.

검진지는 보통 여러 페이지라 다중 파일(files)을 지원한다.
기존 클라이언트 호환을 위해 단일 파일(file) 필드도 유지.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import CurrentUser, get_current_user
from app.schemas.uploads import UploadResponse
from app.services.upload_service import upload_and_extract

logger = logging.getLogger(__name__)

router = APIRouter(tags=["uploads"])


@router.post("/uploads", response_model=UploadResponse)
async def upload_image(
    file: UploadFile | None = File(
        None, description="검진지 이미지 1장 (기존 호환용. files와 함께 보내면 맨 앞 페이지)"
    ),
    files: list[UploadFile] | None = File(
        None, description="검진지 이미지 여러 장 (페이지 순서대로, PNG/JPEG/WEBP, 장당 최대 10MB)"
    ),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """검진지 이미지(1장 이상)를 OCR로 분석해 통합 JSON 반환.

    여러 장을 보내면 페이지별 OCR 후 하나의 결과로 병합된다.
    응답의 ocr JSON은 프론트의 검수 화면에 표시되어 사용자가 검토/수정 후
    POST /analyze로 다시 보냄. 이미지 자체는 보관하지 않음 (의료법 단순화).
    """
    uploads: list[UploadFile] = []
    if file is not None:
        uploads.append(file)
    if files:
        uploads.extend(files)

    if not uploads:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지 파일이 없습니다. 'file' 또는 'files' 필드로 업로드하세요.",
        )

    pages: list[tuple[bytes, str | None, str | None]] = []
    for f in uploads:
        image_bytes = await f.read()
        pages.append((image_bytes, f.content_type, f.filename))

    logger.info(
        "uploads: user=%s, pages=%d, total_size=%d bytes",
        user.id, len(pages), sum(len(b) for b, _, _ in pages),
    )
    return await upload_and_extract(pages)
