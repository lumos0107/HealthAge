"""사용자 프로필 스키마.

profiles 테이블 (auth.users와 1:1 매칭, id 동일).
gender는 분석 측 형식 따름 (1=남, 2=여, 정수).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProfileBase(BaseModel):
    """프로필 공통 필드."""
    name: str | None = Field(default=None, max_length=100)
    gender: Literal[1, 2] | None = Field(default=None, description="1=남, 2=여")
    birth_year: int | None = Field(default=None, ge=1900, le=datetime.now().year)
    # 생활습관 문진 (회원가입 시 1회, 내정보에서 수정). 검진 분석에 자동 사용.
    smoking: Literal["never", "former", "current"] | None = Field(default=None, description="흡연: never/former/current")
    drinking: Literal["no", "yes"] | None = Field(default=None, description="음주: no/yes")
    alcohol_weekly_g: float | None = Field(default=None, ge=0, description="주당 순알코올(g)")


class ProfileUpdate(ProfileBase):
    """프로필 수정 — 모든 필드 선택. PATCH 용도."""
    pass


class ProfileResponse(ProfileBase):
    """프로필 조회 응답."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: str
    updated_at: str
