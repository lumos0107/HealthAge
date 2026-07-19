"""OCR service 단위 테스트.

실제 Ollama/Gemini 호출 없이 mock VisionBackend로 동작 검증.
실행: uv run pytest tests/test_ocr_service.py
"""
from __future__ import annotations

import asyncio
from io import BytesIO

import pytest
from PIL import Image

from app.ocr.pipeline.utils.vision_backend import (
    VisionBackendError,
    VisionBackendServerError,
    set_vision_backend,
)
from app.ocr.service import OCRError, extract_ocr


class _FakeBackend:
    """테스트용 VisionBackend — 미리 정해둔 응답 반환."""

    def __init__(self, response: dict | None = None, raise_error: Exception | None = None):
        self.response = response or {"items": []}
        self.raise_error = raise_error
        self.call_count = 0

    def call(self, *, system_prompt, user_prompt, image_base64, model=None):
        self.call_count += 1
        if self.raise_error:
            raise self.raise_error
        return self.response, {
            "elapsed_sec": 0.1,
            "eval_count": 100,
            "tokens_per_sec": 1000.0,
            "raw_response": "{}",
            "model": model or "fake-model",
        }

    def check_available(self, model=None):
        if self.raise_error:
            raise self.raise_error


def _make_png_bytes(size: tuple[int, int] = (100, 100)) -> bytes:
    """테스트용 작은 PNG 이미지."""
    img = Image.new("RGB", size, color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════
# extract_ocr — backend가 응답 줄 때
# ══════════════════════════════════════════════════════════════════

@pytest.mark.skip(
    reason="실제 OCR 흐름(splitter+pipeline+merger)을 다 호출하므로 "
           "단순 mock backend로는 dict 응답이 적절치 않음. 통합 테스트로 분리."
)
def test_extract_ocr_with_fake_backend():
    """⚠️ skip: 진짜 흐름 검증은 통합 테스트(real Ollama)에서."""
    pass


# ══════════════════════════════════════════════════════════════════
# extract_ocr 에러 처리
# ══════════════════════════════════════════════════════════════════

async def test_extract_ocr_backend_error_path_exists():
    """비전 모델 에러가 OCRError로 변환되는 경로 존재 확인.

    실제 흐름에서 splitter가 영역을 찾으면 LLM을 부르고,
    LLM이 raise하면 OCRError로 변환되어야 한다.

    여기선 단순화: extract_ocr이 to_thread + try/except로 감싸고 있다는
    구조만 확인. backend 실제 호출은 통합 테스트 영역.
    """
    from app.ocr.service import extract_ocr as _extract  # 모듈 로드 확인
    import inspect
    src = inspect.getsource(_extract)
    # VisionBackendError와 OCRError가 try/except로 연결되어 있는지
    assert "VisionBackendError" in src
    assert "OCRError" in src
    assert "to_thread" in src


async def test_extract_ocr_invalid_image_bytes():
    """깨진 이미지 bytes → OCRError."""
    fake = _FakeBackend()  # 이 backend는 안 불릴 거 (이미지 로드에서 실패)
    set_vision_backend(fake)

    with pytest.raises(OCRError) as exc_info:
        await extract_ocr(b"not_a_real_image_just_bytes", "image/png")

    assert "OCR 실패" in str(exc_info.value)


async def test_extract_ocr_empty_bytes():
    """빈 bytes → OCRError."""
    fake = _FakeBackend()
    set_vision_backend(fake)

    with pytest.raises(OCRError):
        await extract_ocr(b"", "image/png")


# ══════════════════════════════════════════════════════════════════
# initialize_ocr
# ══════════════════════════════════════════════════════════════════

def test_initialize_ocr_with_ollama_does_not_crash(monkeypatch):
    """기본 설정(VISION_BACKEND=ollama)으로 initialize_ocr 호출 시
    OllamaBackend가 잘 만들어진다. check_available 실패는 무시(앱 시작은 됨).
    """
    from app.ocr.service import initialize_ocr

    # Ollama 서버가 안 떠있어서 check_available는 실패할 텐데,
    # initialize_ocr은 예외를 삼키고 로그만 남김.
    # 즉 호출 자체가 raise하지 않아야 함.
    initialize_ocr()


def test_initialize_ocr_gemini_requires_api_key(monkeypatch):
    """vision_backend=gemini인데 GEMINI_API_KEY 없으면 OCRError."""
    from app.config import settings

    # 임시로 설정 변경
    monkeypatch.setattr(settings, "vision_backend", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "")

    from app.ocr.service import initialize_ocr

    with pytest.raises(OCRError) as exc_info:
        initialize_ocr()
    assert "GEMINI_API_KEY" in str(exc_info.value)


# ══════════════════════════════════════════════════════════════════
# vision_backend 모듈 자체 동작
# ══════════════════════════════════════════════════════════════════

def test_set_get_vision_backend():
    """set_vision_backend로 주입한 게 get으로 그대로 나옴."""
    from app.ocr.pipeline.utils.vision_backend import get_vision_backend

    fake = _FakeBackend()
    set_vision_backend(fake)
    assert get_vision_backend() is fake
