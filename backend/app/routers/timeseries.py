"""시계열 분석 라우터.

엔드포인트:
    POST /timeseries/refresh      — DB에서 모든 회차 → 분석 → 저장 (강제 갱신)
    GET  /timeseries/{user_id}    — DB에 저장된 가장 최근 시계열 결과 조회

자동 트리거:
    POST /analyze save=true 시 checkup_service.analyze_and_save가 refresh_timeseries를
    백그라운드로 호출. 사용자는 별도로 POST /timeseries/refresh를 안 불러도 됨.
    명시적 갱신이 필요한 경우(예: 데이터 수동 보정 후)에만 사용.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user
from app.db import get_user_client
from app.services.timeseries_service import (
    get_latest_timeseries,
    refresh_timeseries,
)
from app.services.user_service import require_same_user

router = APIRouter(prefix="/timeseries", tags=["timeseries"])


@router.post("/refresh")
async def refresh(
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """본인의 시계열 분석을 강제로 갱신.

    동작:
      1. DB에서 모든 회차 검진 조회
      2. 분석 모듈 호출 (history < 2 면 available=false 반환)
      3. available=true면 timeseries_analyses에 UPSERT
      4. 결과 반환

    Returns:
        분석 결과 dict.
    """
    client = get_user_client(user.access_token)
    return await refresh_timeseries(client, user.id)


@router.get("/{user_id}")
def get_timeseries(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """저장된 시계열 분석 결과 조회 (캐시).

    분석 모듈 호출 없이 DB에서만 읽음. 빠름.
    캐시가 없으면 404 — POST /timeseries/refresh로 먼저 갱신.
    """
    require_same_user(user_id, user.id)
    client = get_user_client(user.access_token)
    return get_latest_timeseries(client, user_id)