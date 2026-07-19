"""
Vision Backend 추상화 레이어.

LLM 호출을 백엔드 독립적으로 만드는 인터페이스.
OCR 코드는 이 모듈의 set_vision_backend()로 주입된 backend를 사용.

- VisionBackend: Protocol (인터페이스 정의)
- OllamaBackend: 기본 구현 (로컬 Ollama API 호출)
- set_vision_backend / get_vision_backend: 전역 setter/getter

향후 확장:
  외부에서 GeminiBackend, OpenAIBackend 등을 VisionBackend Protocol에 맞춰 작성 후
  앱 시작 시 set_vision_backend(GeminiBackend(...))로 주입하면 OCR 코드 변경 없이 갈아끼움.
"""

from __future__ import annotations
import json
import time
from typing import Any, Protocol

import requests

from app.ocr.pipeline import config


# ============================================================
# 예외 (OCR 측에서 공통으로 사용)
# ============================================================

class VisionBackendError(RuntimeError):
    """Vision Backend 관련 모든 예외의 기본 클래스."""
    pass


class VisionBackendServerError(VisionBackendError):
    """서버 연결/응답 오류."""
    pass


class VisionBackendModelNotFoundError(VisionBackendError):
    """요청한 모델이 사용 불가."""
    pass


class VisionBackendResponseParseError(VisionBackendError):
    """응답에서 JSON 추출 실패."""
    pass


# ============================================================
# JSON 추출 (백엔드 공통 헬퍼)
# ============================================================

def extract_json_from_text(text: str) -> dict[str, Any]:
    """LLM 응답 텍스트에서 JSON 객체를 견고하게 추출.
    
    여러 백엔드의 응답에 공통으로 사용 가능.
    마크다운 코드블록 제거, 첫 { ~ 마지막 } 사이 추출 등 방어 코드 포함.
    """
    if not text or not isinstance(text, str):
        raise VisionBackendResponseParseError("응답이 비어있습니다.")
    
    cleaned = text.strip()
    for fence in ("```json", "```JSON", "```"):
        cleaned = cleaned.replace(fence, "")
    cleaned = cleaned.strip()
    
    # 1차: 그대로 파싱
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    
    # 2차: 첫 { 와 마지막 } 사이만 추출
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first != -1 and last != -1 and last > first:
        candidate = cleaned[first:last + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as e:
            raise VisionBackendResponseParseError(
                f"JSON 파싱 실패: {e}\n"
                f"후보 텍스트 (앞 500자): {candidate[:500]}"
            )
    
    raise VisionBackendResponseParseError(
        f"응답에서 JSON 객체를 찾지 못했습니다.\n"
        f"원본 (앞 500자): {cleaned[:500]}"
    )


# ============================================================
# VisionBackend Protocol (인터페이스)
# ============================================================

class VisionBackend(Protocol):
    """Vision LLM 호출 인터페이스.
    
    구현체는 동기 함수로 작성. 비동기 처리는 호출 측에서 asyncio.to_thread 등으로 감쌈.
    
    구현 시 다음 예외 사용:
      - VisionBackendServerError: 서버 연결/응답 실패, 타임아웃
      - VisionBackendModelNotFoundError: 모델 사용 불가
      - VisionBackendResponseParseError: 응답에서 JSON 추출 실패
    """
    
    def call(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        image_base64: str,
        model: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """비전 모델 호출. (파싱된 JSON, 메타 정보) 반환.
        
        Args:
            system_prompt: 시스템 프롬프트
            user_prompt: 사용자 프롬프트
            image_base64: 이미지의 base64 인코딩 문자열 (PNG 권장)
            model: 모델 식별자. None이면 backend의 기본 모델 사용.
        
        Returns:
            (parsed_json, meta) 튜플
            - parsed_json: LLM 응답에서 추출한 dict
            - meta: 호출 메타 정보. 최소 필수 키:
                "elapsed_sec": float — 호출에 걸린 초
                "tokens_per_sec": float — 토큰/초
                "eval_count": int — 출력 토큰 수
                "raw_response": str — LLM 원본 텍스트 응답
                "model": str — 실제 사용된 모델 식별자
        """
        ...
    
    def check_available(self, model: str | None = None) -> None:
        """모델 사용 가능 여부 확인. 사용 불가하면 예외.
        
        앱 시작 시 사전 점검용. 호출이 실제 LLM 요청을 보내지는 않아도 되며
        (예: 모델 리스트 조회), 단지 backend 설정과 model 식별자가 유효한지 확인.
        """
        ...


# ============================================================
# OllamaBackend — 기본 구현 (로컬 Ollama API)
# ============================================================

class OllamaBackend:
    """로컬 Ollama 서버를 호출하는 VisionBackend 구현체.
    
    설정은 config.OLLAMA_HOST, config.OLLAMA_MODEL_VISION 등을 사용.
    """
    
    def __init__(
        self,
        host: str | None = None,
        default_model: str | None = None,
        timeout_sec: int | None = None,
        options: dict[str, Any] | None = None,
    ):
        self.host = host or config.OLLAMA_HOST
        self.default_model = default_model or config.OLLAMA_MODEL_VISION
        self.timeout_sec = timeout_sec or config.OLLAMA_TIMEOUT_SEC
        self.options = options or config.OLLAMA_OPTIONS
    
    def call(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        image_base64: str,
        model: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        model = model or self.default_model
        
        payload = {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt, "images": [image_base64]},
            ],
            "options": self.options,
            "format": "json",
        }
        
        start = time.time()
        try:
            res = requests.post(
                f"{self.host}/api/chat",
                headers={"ngrok-skip-browser-warning": "true"},
                json=payload,
                timeout=self.timeout_sec,
            )
        except requests.exceptions.Timeout:
            raise VisionBackendServerError(
                f"Ollama 응답 타임아웃 ({self.timeout_sec}초)"
            )
        except requests.exceptions.RequestException as e:
            raise VisionBackendServerError(f"Ollama 호출 실패: {e}")
        
        if not res.ok:
            raise VisionBackendServerError(
                f"Ollama API 오류 {res.status_code}: {res.text[:500]}"
            )
        
        data = res.json()
        elapsed = time.time() - start
        raw_text = data.get("message", {}).get("content", "")
        
        parsed = extract_json_from_text(raw_text)
        
        eval_count = data.get("eval_count", 0)
        eval_duration_ns = data.get("eval_duration", 0)
        tps = (eval_count / (eval_duration_ns / 1e9)) if eval_duration_ns > 0 else 0.0
        
        meta = {
            "elapsed_sec": round(elapsed, 2),
            "eval_count": eval_count,
            "tokens_per_sec": round(tps, 1),
            "raw_response": raw_text,
            "model": model,
        }
        return parsed, meta
    
    def check_available(self, model: str | None = None) -> None:
        """Ollama 서버 연결 + 모델 설치 여부 확인."""
        model = model or self.default_model
        
        try:
            res = requests.get(f"{self.host}/api/tags", timeout=5, headers={"ngrok-skip-browser-warning": "true"})
            res.raise_for_status()
        except requests.exceptions.ConnectionError as e:
            raise VisionBackendServerError(
                f"Ollama 서버에 연결할 수 없습니다 ({self.host}).\n"
                f"해결: 'ollama serve' 실행 또는 Ollama 데스크톱 앱 실행 여부 확인.\n"
                f"원본 오류: {e}"
            )
        except requests.exceptions.RequestException as e:
            raise VisionBackendServerError(f"Ollama API 오류: {e}")
        
        installed = [m["name"] for m in res.json().get("models", [])]
        if not any(name == model or name.startswith(model + ":") for name in installed):
            raise VisionBackendModelNotFoundError(
                f"모델 미설치: {model}\n"
                f"해결: 터미널에서 'ollama pull {model}' 실행 후 재시도.\n"
                f"현재 설치된 모델: {', '.join(installed) or '(없음)'}"
            )


# ============================================================
# 전역 backend 주입
# ============================================================

_backend: VisionBackend | None = None


def set_vision_backend(backend: VisionBackend) -> None:
    """OCR이 사용할 vision backend를 전역으로 설정.
    
    앱 시작 시 한 번 호출. 이후 OCR의 모든 LLM 호출이 이 backend를 거침.
    
    예시:
        # 로컬 개발: Ollama 사용
        set_vision_backend(OllamaBackend())
        
        # 운영: Gemini 사용
        set_vision_backend(GeminiBackend(api_key=..., default_model="gemini-2.0-flash"))
    """
    global _backend
    _backend = backend


def get_vision_backend() -> VisionBackend:
    """현재 설정된 backend 반환. 미설정 시 OllamaBackend를 lazy하게 기본 주입.
    
    이유: OCR 단독 실행(테스트 스크립트, CLI)에서 set_vision_backend() 호출 없이도
          기본 동작하도록. 백엔드 통합 환경에서는 앱 시작 시 명시적으로 set 권장.
    """
    global _backend
    if _backend is None:
        _backend = OllamaBackend()
    return _backend
