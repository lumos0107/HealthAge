"""Supabase JWT 검증.

Supabase Auth는 ES256(또는 RS256/HS256)으로 서명한 JWT를 발급한다.
백엔드는 Supabase의 JWKS 엔드포인트에서 공개키를 가져와 검증한다.

라우터에서:
    @router.get("/me")
    def me(user: CurrentUser = Depends(get_current_user)):
        return {"id": user.id}
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)

# Bearer 토큰 추출기 (Authorization: Bearer xxx 헤더에서).
# auto_error=True 라 토큰 없으면 자동 401.
_bearer = HTTPBearer(auto_error=True)

# JWKS 클라이언트 — Supabase 공개키 캐싱.
# 토큰의 alg/kid를 보고 자동으로 맞는 공개키 선택.
_jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
_jwks_client = PyJWKClient(
    _jwks_url,
    cache_keys=True,        # 메모리 캐싱
    lifespan=300,           # 5분 후 갱신
)


@dataclass(frozen=True)
class CurrentUser:
    """현재 요청의 사용자 정보.

    Attributes:
        id: auth.users.id (UUID 문자열). profiles.id와 동일.
        email: 사용자 이메일 (있으면).
        access_token: 원본 JWT. get_user_client() 만들 때 사용.
    """
    id: str
    email: str | None
    access_token: str


def _decode_token(token: str) -> dict:
    """JWT 디코드 + 검증. 실패 시 401.

    1차: JWKS 기반 (ES256/RS256) — Supabase 정식 토큰
    2차 fallback: HS256 (SUPABASE_JWT_SECRET) — 레거시/테스트 토큰
    """
    # 1차: JWKS 기반 검증
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 만료되었습니다.",
        )
    except jwt.InvalidTokenError as e:
        # 서명 검증 실패 또는 형식 오류. HS256 fallback 시도.
        logger.debug("JWKS 검증 실패, HS256 fallback 시도: %s", e)
    except Exception as e:
        # JWKS URL 호출 실패, kid 매칭 안 됨 등. HS256 fallback 시도.
        logger.debug("JWKS 호출 실패, HS256 fallback 시도: %s", e)

    # 2차: HS256 fallback (레거시 토큰 또는 테스트용)
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 만료되었습니다.",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"유효하지 않은 토큰입니다: {e}",
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    """현재 사용자 의존성. 토큰 없거나 무효면 401."""
    token = credentials.credentials
    payload = _decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰에 사용자 ID가 없습니다.",
        )
    return CurrentUser(
        id=user_id,
        email=payload.get("email"),
        access_token=token,
    )