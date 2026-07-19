"""사용자 프로필 라우터.

기존 분석 측 명세와 path 호환. 모든 요청에 JWT 헤더 필수.
path의 {user_id}는 토큰의 user_id와 일치해야 함 (라우터 1차, RLS 2차 방어).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.auth import CurrentUser, get_current_user
from app.db import get_service_client, get_user_client
from app.schemas.profile import ProfileResponse, ProfileUpdate
from app.services.user_service import (
    delete_profile,
    get_profile,
    list_profiles,
    require_same_user,
    upsert_profile,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[ProfileResponse])
def list_users(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    """사용자 목록 조회.

    RLS가 본인 행만 보여줌. 기존 명세 호환을 위해 유지.
    """
    client = get_user_client(user.access_token)
    return list_profiles(client)


@router.get("/{user_id}", response_model=ProfileResponse)
def read_user(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """특정 사용자 프로필 조회. user_id는 본인이어야 함."""
    require_same_user(user_id, user.id)
    client = get_user_client(user.access_token)
    return get_profile(client, user_id)


@router.post("", response_model=ProfileResponse, status_code=status.HTTP_200_OK)
def create_or_update_user(
    payload: ProfileUpdate,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """프로필 upsert (가입 후 추가 정보 입력).

    user_id는 토큰에서 자동 추출. body엔 name/gender/birth_year만.
    트리거가 가입 시 빈 행 만들어놨으므로 사실상 UPDATE 동작.
    """
    client = get_user_client(user.access_token)
    return upsert_profile(client, user.id, payload.model_dump(exclude_none=True))


@router.patch("/{user_id}", response_model=ProfileResponse)
def update_user(
    user_id: str,
    payload: ProfileUpdate,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """프로필 수정. user_id는 본인이어야 함."""
    require_same_user(user_id, user.id)
    client = get_user_client(user.access_token)
    return upsert_profile(client, user_id, payload.model_dump(exclude_none=True))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """계정 삭제 (auth.users + 모든 연관 데이터 CASCADE).

    ⚠️ 되돌릴 수 없음. service_role 필요.
    """
    require_same_user(user_id, user.id)
    service = get_service_client()
    delete_profile(service, user_id)
