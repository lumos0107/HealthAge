"""GeminiBackend — VisionBackend Protocol 구현 (Google Gemini API).

OCR 친구가 제공한 템플릿을 기반으로 작성.

⚠️ 데모 단계엔 사용 안 함 (Ollama 사용). 프로덕션 전환 시 환경변수 한 줄:
    VISION_BACKEND=gemini
    GEMINI_API_KEY=...

설치:
    의존성에 google-genai 추가 필요. 데모엔 안 깔려있어서 lazy import.
"""
from __future__ import annotations

import base64
import time
from typing import Any

from app.ocr.pipeline.utils.vision_backend import (
    VisionBackendError,
    VisionBackendModelNotFoundError,
    VisionBackendServerError,
    extract_json_from_text,
)


class GeminiBackend:
    """Google Gemini API를 통한 vision LLM 호출.

    VisionBackend Protocol을 따른다 (명시적 상속은 안 해도 됨).

    Attributes:
        api_key: Gemini API 키 (Google AI Studio에서 발급).
        default_model: 기본 모델 식별자 (예: "gemini-2.5-flash").
    """

    def __init__(
        self,
        api_key: str,
        default_model: str = "gemini-2.5-flash",
        timeout_sec: int = 300,
    ):
        if not api_key:
            raise ValueError("GeminiBackend: api_key 필수")
        self.api_key = api_key
        self.default_model = default_model
        self.timeout_sec = timeout_sec
        # SDK는 lazy import — google-genai 미설치 환경에서도 모듈 로드는 가능하게.
        self._client: Any = None

    def _get_client(self) -> Any:
        """google-genai 클라이언트 lazy 초기화."""
        if self._client is None:
            try:
                from google import genai  # type: ignore[import-not-found]
            except ImportError as e:
                raise VisionBackendError(
                    "google-genai 미설치. 'uv add google-genai' 실행 필요."
                ) from e
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def call(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        image_base64: str,
        model: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Gemini API 호출.

        Args:
            system_prompt: 시스템 프롬프트.
            user_prompt: 사용자 프롬프트.
            image_base64: base64로 인코드된 이미지 (OCR pipeline이 PNG로 만든 것).
            model: 모델 식별자. None이면 default_model.

        Returns:
            (parsed_json, meta) 튜플. VisionBackend Protocol 형식.
        """
        from google.genai import types  # type: ignore[import-not-found]

        model = model or self.default_model
        client = self._get_client()

        # base64 → bytes
        try:
            image_bytes = base64.b64decode(image_base64)
        except Exception as e:
            raise VisionBackendError(f"image_base64 디코드 실패: {e}") from e

        # Gemini는 system_prompt와 user_prompt를 합쳐서 contents로 줘야 함.
        # system_instruction 별도 인자도 있지만 OCR 흐름엔 합치는 게 단순.
        combined_text = f"{system_prompt}\n\n{user_prompt}"
        image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/png")

        start = time.time()
        try:
            response = client.models.generate_content(
                model=model,
                contents=[combined_text, image_part],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.0,
                ),
            )
            raw_text = response.text or ""
        except Exception as e:
            # Gemini SDK는 특정 예외 클래스를 던지지만, 우리는 통합 예외로 변환.
            msg = str(e)
            if "not found" in msg.lower() or "404" in msg:
                raise VisionBackendModelNotFoundError(
                    f"Gemini 모델 사용 불가: {model}\n원본: {msg}"
                ) from e
            raise VisionBackendServerError(f"Gemini API 오류: {msg}") from e

        elapsed = time.time() - start

        # JSON 추출 — 친구가 만든 공통 헬퍼 재사용
        parsed = extract_json_from_text(raw_text)

        # 메타 정보 — Gemini는 usage_metadata 제공
        usage = getattr(response, "usage_metadata", None)
        eval_count = getattr(usage, "candidates_token_count", 0) if usage else 0
        tps = (eval_count / elapsed) if elapsed > 0 else 0.0

        meta = {
            "elapsed_sec": round(elapsed, 2),
            "eval_count": eval_count,
            "tokens_per_sec": round(tps, 1),
            "raw_response": raw_text,
            "model": model,
        }
        return parsed, meta

    def check_available(self, model: str | None = None) -> None:
        """API 키 + 모델 사용 가능 여부 확인.

        실제 LLM 호출은 안 함 (비용 0). 모델 리스트 조회만.
        """
        model = model or self.default_model
        client = self._get_client()
        try:
            # SDK가 model 객체 가져오는 식으로 확인. 실패 시 예외.
            list(client.models.list())
        except Exception as e:
            msg = str(e)
            if "auth" in msg.lower() or "401" in msg or "403" in msg:
                raise VisionBackendServerError(
                    f"Gemini API 키 인증 실패: {msg}"
                ) from e
            raise VisionBackendServerError(
                f"Gemini API 연결 실패: {msg}"
            ) from e
