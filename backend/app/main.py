"""FastAPI 진입점.

실행:
    uv run uvicorn app.main:app --reload --reload-dir app

라우터:
  health      GET /, GET /health
  auth        GET /auth/me
  users       GET /users, GET /users/{id}, POST /users, PATCH /users/{id}, DELETE /users/{id}
  analysis    POST /analyze, GET /reports/...
  uploads     POST /uploads (이미지 → OCR JSON)
  medication  복약 이력
  timeseries  시계열 비교
  renal       신장 기능(eGFR)
  reference   기준값 조회

총 22개 엔드포인트.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import settings
from app.ocr.service import initialize_ocr
from app.routers import analysis as analysis_router
from app.routers import auth_routes as auth_router
from app.routers import health as health_router
from app.routers import uploads as uploads_router
from app.routers import users as users_router
from app.renal import router as renal_router
from app.reference import router as reference_router
from app.routers import medication as medication_router
from app.routers import timeseries as timeseries_router

# ──────────────────────────────────────────────────────────────────
# 로깅
# ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────
# 라이프사이클
# ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "health-service starting — env=%s, analyzer_mode=%s, vision_backend=%s, version=%s",
        settings.env,
        settings.analyzer_mode,
        settings.vision_backend,
        __version__,
    )
    try:
        initialize_ocr()
    except Exception as e:
        logger.error("OCR 초기화 실패 (앱은 계속 시작): %s", e)
    logger.info("startup complete")
    yield
    logger.info("shutting down")


# ──────────────────────────────────────────────────────────────────
# 앱
# ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Health Analyzer API",     # 기존 명세 호환
    description="한국 건강검진 OCR 기반 개인 건강 서비스 — 통합 백엔드",
    version=__version__,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────
# 라우터 등록
# ──────────────────────────────────────────────────────────────────
app.include_router(health_router.router)
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(analysis_router.router)
app.include_router(uploads_router.router)
app.include_router(renal_router)
app.include_router(reference_router)
app.include_router(medication_router.router)
app.include_router(timeseries_router.router)