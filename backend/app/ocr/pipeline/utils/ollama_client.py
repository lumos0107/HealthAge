"""
Ollama API 호출 — 호환성 레이어.

[변경 이력]
원래 이 모듈이 Ollama HTTP API를 직접 호출했으나,
백엔드 추상화(VisionBackend)로 옮기면서 위임 함수만 남김.
기존 호출자(파이프라인 등)의 시그니처는 그대로 유지.

실제 로직은 utils/vision_backend.py 참조.
"""

from __future__ import annotations
from typing import Any

from app.ocr.pipeline.utils import vision_backend
from app.ocr.pipeline.utils.vision_backend import (
    VisionBackendError,
    VisionBackendServerError,
    VisionBackendModelNotFoundError,
    VisionBackendResponseParseError,
    extract_json_from_text,
    get_vision_backend,
    set_vision_backend,
)


# ============================================================
# 호환성 예외 별칭
# ============================================================
# 기존 코드가 OllamaError 등을 import해서 잡고 있을 수 있어 별칭 유지.
# 신규 코드는 VisionBackend* 사용 권장.

OllamaError = VisionBackendError
OllamaServerError = VisionBackendServerError
OllamaModelNotFoundError = VisionBackendModelNotFoundError
OllamaResponseParseError = VisionBackendResponseParseError


# ============================================================
# 호환성 함수 — 백엔드 위임
# ============================================================

def check_server() -> list[str]:
    """[호환성] 현재 backend의 사용 가능 여부 확인.
    
    원래는 Ollama 서버 연결 확인 + 설치된 모델 목록 반환이었으나,
    백엔드 추상화 후에는 일반화된 check_available() 호출로 위임.
    
    Returns:
        [] (빈 리스트). 모델 목록은 backend-specific이라 일반화 어려움.
        호출자는 보통 check_model_installed()를 쓰므로 영향 없음.
    """
    get_vision_backend().check_available()
    return []


def check_model_installed(model_name: str) -> None:
    """[호환성] 모델 사용 가능 여부 확인. 사용 불가하면 예외."""
    get_vision_backend().check_available(model=model_name)


def call_vision_model(
    *,
    system_prompt: str,
    user_prompt: str,
    image_base64: str,
    model: str | None = None,
    options: dict[str, Any] | None = None,
    timeout: int | None = None,
    force_json: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """[호환성] 비전 모델 호출 — 주입된 backend로 위임.
    
    options, timeout, force_json 인자는 호환성 위해 남기되 무시됨.
    backend-specific 설정은 backend 인스턴스 생성 시 전달해야 함.
    """
    return get_vision_backend().call(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        image_base64=image_base64,
        model=model,
    )


# ============================================================
# 신규 코드용 export (편의)
# ============================================================
# 백엔드 통합 시 OCR 외부에서 사용:
#   from app.ocr.pipeline.utils.ollama_client import set_vision_backend
# 또는 직접:
#   from app.ocr.pipeline.utils.vision_backend import set_vision_backend, OllamaBackend

__all__ = [
    "call_vision_model",
    "check_server",
    "check_model_installed",
    "extract_json_from_text",
    "set_vision_backend",
    "get_vision_backend",
    "OllamaError",
    "OllamaServerError",
    "OllamaModelNotFoundError",
    "OllamaResponseParseError",
    "VisionBackendError",
    "VisionBackendServerError",
    "VisionBackendModelNotFoundError",
    "VisionBackendResponseParseError",
]
