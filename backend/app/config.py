"""환경변수 설정.

.env 파일을 자동으로 읽어 검증된 설정 객체로 반환한다.
앱 어디서든:

    from app.config import settings
    settings.supabase_url

⚠️ analyzer/_internal/ 안에선 이 모듈을 import하면 안 된다 (격리 규칙).
   필요한 값은 함수 인자로 받는다.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",          # .env에 추가 변수 있어도 무시
    )

    # ── 환경 구분
    env: Literal["development", "production"] = "development"

    # ── Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # ── CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # ── 분석 모드 (미래 분리 대비)
    analyzer_mode: Literal["local", "remote"] = "local"
    analyzer_service_url: str | None = None

    # ── OCR
    vision_backend: Literal["ollama", "gemini"] = "ollama"

    # OCR pipeline의 config.py가 기본값을 갖고 있음. 여기 값이 있으면 override.
    ollama_host: str | None = None       # 예: "http://localhost:11434"
    ollama_model: str | None = None      # 예: "qwen2.5vl:7b-q8_0"

    gemini_api_key: str = ""             # vision_backend=gemini일 때만 필수
    gemini_model: str = "gemini-2.5-flash"

    # ── 서버
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    """캐시된 설정 반환 (lru_cache로 1회만 로드)."""
    return Settings()  # type: ignore[call-arg]


# 모듈 import 시 한 번 로드. 라우터에선 `from app.config import settings`로 접근.
settings = get_settings()
