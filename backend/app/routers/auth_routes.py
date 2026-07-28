"""인증 정보 라우터.

app/auth.py 모듈 독스트링(get_current_user 사용 예)이 보여준 라우트를 실제로 구현한다.
CurrentUser가 이미 갖고 있는 필드만 그대로 반환한다 — access_token은 비밀값이므로 절대 노출하지 않고,
그 외 새 정보를 만들어 붙이지 않는다.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    """현재 로그인한 사용자의 인증 정보(id·email)."""
    return {"id": user.id, "email": user.email}
