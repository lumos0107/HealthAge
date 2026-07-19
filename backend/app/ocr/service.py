"""OCR 서비스 — 라우터가 보는 인터페이스.

흐름:
  1. 앱 시작 시 initialize_ocr() 호출 → 환경변수 보고 backend 결정 → set_vision_backend()
  2. 요청 시 extract_ocr(image_bytes, mime) → OCR 친구의 entry 함수를 to_thread로 호출
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.config import settings
from app.ocr.pipeline.entry import extract_from_images
from app.ocr.pipeline.utils.vision_backend import (
    OllamaBackend,
    VisionBackend,
    VisionBackendError,
    set_vision_backend,
)

logger = logging.getLogger(__name__)


class OCRError(Exception):
    """OCR 처리 중 발생한 오류 (백엔드 측 통일된 예외)."""


# ──────────────────────────────────────────────────────────────────
# 초기화 — 앱 시작 시 1회
# ──────────────────────────────────────────────────────────────────

def initialize_ocr() -> None:
    """환경변수 보고 vision backend 결정해서 OCR 모듈에 주입.

    main.py의 startup 이벤트에서 호출.

    환경변수:
        VISION_BACKEND = "ollama" (기본) | "gemini"
        OLLAMA_HOST       (ollama일 때, 기본 OCR config 사용)
        OLLAMA_MODEL      (ollama일 때, 기본 OCR config 사용)
        GEMINI_API_KEY    (gemini일 때, 필수)
        GEMINI_MODEL      (gemini일 때, 기본값 있음)
    """
    backend = settings.vision_backend

    chosen: VisionBackend
    if backend == "gemini":
        if not settings.gemini_api_key:
            raise OCRError(
                "VISION_BACKEND=gemini인데 GEMINI_API_KEY가 비어있습니다."
            )
        from app.ocr.backends.gemini import GeminiBackend
        chosen = GeminiBackend(
            api_key=settings.gemini_api_key,
            default_model=settings.gemini_model,
        )
        logger.info("OCR: Gemini backend 사용 (model=%s)", settings.gemini_model)
    else:
        # 기본: Ollama. host/model이 .env에 명시되면 그걸로, 아니면 OCR pipeline의 config.
        kwargs: dict[str, Any] = {}
        if settings.ollama_host:
            kwargs["host"] = settings.ollama_host
        if settings.ollama_model:
            kwargs["default_model"] = settings.ollama_model
        chosen = OllamaBackend(**kwargs)
        logger.info(
            "OCR: Ollama backend 사용 (host=%s, model=%s)",
            chosen.host, chosen.default_model,
        )

    set_vision_backend(chosen)

    # 사용 가능 여부 확인 (Ollama 서버 떠 있나, Gemini API 키 유효한가).
    # 실패해도 앱은 뜨게 — 진짜 OCR 요청 들어올 때 다시 에러 나면 됨.
    try:
        chosen.check_available()
        logger.info("OCR: backend 연결 확인 완료")
    except VisionBackendError as e:
        logger.warning(
            "OCR: backend 연결 실패 — 첫 요청 시 다시 시도합니다. (%s)", e
        )


# ──────────────────────────────────────────────────────────────────
# 요청 처리
# ──────────────────────────────────────────────────────────────────

async def extract_ocr(
    image_bytes: bytes,
    mime_type: str | None = None,
    doc_type: str = "checkup",
) -> dict[str, Any]:
    """이미지 bytes → OCR JSON dict.

    OCR 친구의 동기 함수를 asyncio.to_thread로 감싸서 비동기 컨텍스트에서 안전하게 호출.

    Args:
        image_bytes: 이미지 raw bytes (PNG/JPEG/WEBP).
        mime_type: "image/png" 등. PIL이 자동 감지하니 None도 OK.
        doc_type: 문서 종류 — "checkup" (기본, 건강검진) 또는 "med_label" (약봉투).
                  프론트→백엔드에서 명시되어 내려옴.

    Returns:
        OCR JSON dict. doc_type에 따라 스키마 다름 (entry.extract_from_images 참조).

    Raises:
        OCRError: OCR 처리 실패 (이미지 손상, 비전 모델 오류 등).
    """
    try:
        result = await asyncio.to_thread(
            extract_from_images,
            image_bytes,
            page_names="uploaded",
            mime_type=mime_type,
            doc_type=doc_type,
        )
    except VisionBackendError as e:
        raise OCRError(f"OCR 실패 (비전 모델): {e}") from e
    except ValueError as e:
        # entry.py가 이미지 로드 실패 시 ValueError를 던짐
        raise OCRError(f"OCR 실패 (이미지): {e}") from e
    except Exception as e:
        raise OCRError(f"OCR 실패 (예상치 못한 오류): {type(e).__name__}: {e}") from e
    return result
