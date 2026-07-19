"""헬스체크 라우터.

인증 없음. 모니터링/배포 자동화에서도 사용.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app import __version__
from app.db import get_service_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/")
def root() -> dict:
    """서비스 정보."""
    return {
        "service": "Health Analyzer API",
        "version": __version__,
        "docs": "/docs",
    }


@router.get("/health")
def health() -> dict:
    """헬스체크 + 간단한 통계.

    기존 분석 측 명세와 호환되는 형식:
        {"status": "ok", "users": N, "checkups_total": M, "version": "..."}

    통계 조회 실패해도 200 OK는 유지 (status가 ok가 핵심).
    """
    users_count = 0
    checkups_total = 0

    try:
        # service_role로 전체 카운트 조회 (RLS 무시).
        # 진짜 운영 시엔 pg 함수로 캐시할 수 있지만 데모엔 그냥 count.
        client = get_service_client()
        # supabase-py의 count='exact'는 head=True와 함께 쓰면 행 안 가져오고 카운트만.
        r_users = client.table("profiles").select("id", count="exact", head=True).execute()
        users_count = r_users.count or 0

        r_checkups = client.table("checkup_records").select("record_id", count="exact", head=True).execute()
        checkups_total = r_checkups.count or 0
    except Exception as e:
        logger.warning("health: 통계 조회 실패 (status는 ok로 유지): %s", e)

    return {
        "status": "ok",
        "users": users_count,
        "checkups_total": checkups_total,
        "version": __version__,
    }
