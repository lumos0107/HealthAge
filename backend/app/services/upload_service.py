"""OCR 업로드 비즈니스 로직."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status

from app.ocr.service import OCRError, extract_ocr

logger = logging.getLogger(__name__)

# 이미지 크기 제한
MAX_IMAGE_BYTES = 10 * 1024 * 1024   # 10MB

# 허용 MIME 타입
ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
}


def validate_image_upload(content_type: str | None, size_bytes: int) -> None:
    """업로드 이미지 검증.

    Raises:
        HTTPException: 검증 실패 (400 Bad Request).
    """
    if size_bytes > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"이미지 크기 초과: {size_bytes} bytes (최대 {MAX_IMAGE_BYTES} bytes)",
        )

    if size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="빈 파일입니다.",
        )

    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 이미지 형식: {content_type}. "
                   f"허용: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
        )


async def upload_and_extract(
    image_bytes: bytes,
    content_type: str | None,
) -> dict[str, Any]:
    """이미지 → OCR 추출.

    Returns:
        {"ocr": {...}, "warnings": [...]}

    Raises:
        HTTPException: 400 (검증 실패), 503 (OCR 연결 실패), 500 (예상치 못한 에러).
    """
    validate_image_upload(content_type, len(image_bytes))

    warnings: list[str] = []

    try:
        ocr_json = await extract_ocr(image_bytes, content_type)
    except OCRError as e:
        # OCR backend 연결 실패 또는 처리 실패
        msg = str(e)
        logger.warning("OCR 실패: %s", msg)

        # backend 연결 실패는 503, 그 외는 500
        if "연결" in msg or "connection" in msg.lower() or "타임아웃" in msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"OCR 서버 연결 실패: {msg}",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR 처리 실패: {msg}",
        )
    except Exception as e:
        logger.exception("OCR 처리 중 예상치 못한 에러")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR 처리 실패: {type(e).__name__}: {e}",
        )

    # OCR 신뢰도가 낮으면 경고
    meta = ocr_json.get("meta", {}) or {}
    confidence = meta.get("ocr_confidence")
    if isinstance(confidence, (int, float)) and confidence < 0.7:
        warnings.append(
            f"OCR 신뢰도가 낮습니다 ({confidence:.2f}). 결과를 꼼꼼히 검토해주세요."
        )

    # measurements가 텅 비어 있으면 경고
    measurements = ocr_json.get("measurements", {}) or {}
    if not measurements:
        warnings.append("OCR이 검진 수치를 찾지 못했습니다. 이미지 품질을 확인해주세요.")

    return {"ocr": ocr_json, "warnings": warnings}
