"""사용자 프로필 비즈니스 로직.

profiles 테이블 조작. 토큰의 user_id로 RLS 보호.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

logger = logging.getLogger(__name__)


def require_same_user(path_user_id: str, token_user_id: str) -> None:
    """URL path의 user_id가 토큰의 user_id와 일치하는지 검증.

    불일치 시 403 Forbidden. 모든 /users/{user_id}, /reports/{user_id} 라우터에서 사용.

    Args:
        path_user_id: URL path에서 추출한 user_id.
        token_user_id: JWT 토큰의 sub claim (current_user.id).

    Raises:
        HTTPException: 403 Forbidden.
    """
    if path_user_id != token_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="본인의 user_id만 접근할 수 있습니다.",
        )


def get_profile(client: Client, user_id: str) -> dict[str, Any]:
    """프로필 조회. 없으면 404.

    user_id는 호출 측에서 이미 검증되었다고 가정 (require_same_user).
    RLS가 또 막아주므로 다른 사용자 데이터는 못 봄.
    """
    resp = client.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    if not resp or not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="프로필을 찾을 수 없습니다.",
        )
    return resp.data


def list_profiles(client: Client) -> list[dict[str, Any]]:
    """프로필 목록 조회.

    RLS 때문에 사용자 토큰으로 호출하면 본인 행 1개만 반환.
    기존 명세 호환을 위해 라우터 유지하지만 사실상 단일 행.
    """
    resp = client.table("profiles").select("*").execute()
    return resp.data or []


def upsert_profile(
    client: Client,
    user_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """프로필 upsert.

    POST /users (가입 후 추가 정보 채우기), PATCH /users/{user_id} 둘 다 사용.
    Supabase 트리거가 빈 행은 이미 만들어놓았으므로 사실상 UPDATE.

    payload는 {name, gender, birth_year} 중 일부.
    """
    # id 필드는 PK이므로 payload에서 빼고 user_id로만 처리
    clean_payload = {k: v for k, v in payload.items() if k != "id" and v is not None}

    if not clean_payload:
        # 빈 페이로드면 현재 프로필 그대로 반환
        return get_profile(client, user_id)

    resp = (
        client.table("profiles")
        .update(clean_payload)
        .eq("id", user_id)
        .execute()
    )
    # supabase-py update는 단일/다중 모두 list 반환. 첫 행이 갱신된 프로필.
    if not resp.data:
        # update 결과 비어있으면 행 자체가 없는 경우 — 트리거가 안 돈 비정상 상태
        logger.error("upsert_profile: profiles 행 없음 (user_id=%s). 트리거 확인 필요", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="프로필 행이 존재하지 않습니다. 가입 트리거를 확인하세요.",
        )
    return resp.data[0]


def delete_profile(
    service_client: Client,
    user_id: str,
) -> None:
    """계정 삭제. profiles + auth.users 모두.

    auth.users 삭제는 service_role로만 가능. CASCADE 설정으로 profiles까지 같이 삭제됨.

    ⚠️ 실제 운영 시 신중. 데모엔 사실상 안 호출됨.
    """
    try:
        # auth.users 삭제. CASCADE로 profiles, checkup_records, analysis_results까지.
        service_client.auth.admin.delete_user(user_id)
    except Exception as e:
        logger.error("delete_profile: auth.users 삭제 실패 (user_id=%s): %s", user_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"계정 삭제 실패: {e}",
        )
