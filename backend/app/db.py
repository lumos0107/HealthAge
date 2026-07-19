"""Supabase 클라이언트.

두 가지 클라이언트:
  1. service_client    — service_role 키로 RLS 우회. 백엔드 내부 작업용.
  2. get_user_client() — 사용자 JWT를 부착. RLS가 본인 데이터만 허용.

**기본 원칙**: 사용자 데이터 접근은 사용자 토큰으로 (RLS 자동 적용).
service_client는 시스템 작업(트리거 우회 등)에만 신중히 사용.
"""
from __future__ import annotations

from supabase import Client, create_client

from app.config import settings


# 모듈 로드 시 1회 생성. supabase-py는 내부 httpx 세션 재사용.
_service_client: Client | None = None


def get_service_client() -> Client:
    """RLS 우회하는 service_role 클라이언트. 신중히 사용."""
    global _service_client
    if _service_client is None:
        _service_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _service_client


def get_user_client(access_token: str) -> Client:
    """사용자 JWT로 인증된 클라이언트.

    이 클라이언트로 DB 호출하면 RLS가 자동 적용되어,
    본인 데이터만 보거나 수정 가능.
    """
    client = create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
    )
    # PostgREST에 사용자 토큰 부착
    client.postgrest.auth(access_token)
    return client
