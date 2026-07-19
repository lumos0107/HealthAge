"""투약이력 업로드 라우터.

POST /medication/upload
  - HIRA '내가 먹는 약! 한눈에' 생일-암호 엑셀 업로드
  - 복호화 → 파싱 → Supabase 저장 → 미리보기 반환

생일은 profiles.birth_year + birth_md를 자동 사용.
프로필에 생일 미설정 또는 가족/대리인 파일이면 manual_birthday로 폴백.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth import CurrentUser, get_current_user
from app.db import get_user_client
from app.medication import ParseError, PasswordError, open_history
from app.schemas.medication_schema import MedicationItem, MedicationUploadResponse
from app.services.medication_service import (
    fetch_medication_records,
    fetch_profile_birthday,
    persist_medication_records,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/medication", tags=["medication"])

_ALLOWED_SUFFIX = (".xls", ".xlsx")
_MAX_BYTES = 5 * 1024 * 1024  # HIRA 파일은 보통 수십 KB


@router.post(
    "/upload",
    response_model=MedicationUploadResponse,
    summary="HIRA 개인투약이력 엑셀 업로드·파싱",
)
async def upload_medication(
    file: UploadFile = File(..., description="HIRA 개인투약이력 엑셀(.xls)"),
    manual_birthday: str | None = Form(
        None,
        description=(
            "생일 수동 입력 (YYYYMMDD 또는 YYYY-MM-DD). "
            "프로필에 생일 미설정 또는 가족/대리인 파일일 때만 사용."
        ),
    ),
    persist: bool = Form(True, description="파싱 후 DB 저장 여부"),
    user: CurrentUser = Depends(get_current_user),
):
    """HIRA 엑셀 → 파싱 → (옵션) Supabase 저장 → 미리보기.

    user_id는 JWT에서 자동 추출. body의 user_id는 무시.
    생일은 profiles에서 자동 조회. 없으면 manual_birthday 필요.
    """
    # 1) 파일 검증
    name = (file.filename or "").lower()
    if not name.endswith(_ALLOWED_SUFFIX):
        raise HTTPException(400, "엑셀(.xls/.xlsx) 파일만 업로드할 수 있습니다.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "빈 파일입니다.")
    if len(data) > _MAX_BYTES:
        raise HTTPException(400, "파일이 너무 큽니다.")

    # 2) Supabase 클라이언트 (RLS용 사용자 토큰 부착)
    client = get_user_client(user.access_token)

    # 3) profiles에서 생일 자동 조회 (없으면 manual_birthday 폴백)
    stored_birthday = fetch_profile_birthday(client, user.id)
    if not stored_birthday and not manual_birthday:
        raise HTTPException(
            status_code=400,
            detail=(
                "생일 정보가 없습니다. 프로필에 생일을 등록하거나 "
                "manual_birthday로 직접 입력해주세요."
            ),
        )

    # 4) 복호화 + 파싱 (저장 생일 우선, 실패 시 수동 폴백)
    try:
        records = open_history(
            data,
            stored_birthday=stored_birthday,
            manual_birthday=manual_birthday,
        )
    except PasswordError as e:
        # 둘 다 안 맞은 경우 (저장 생일 != 파일, manual_birthday도 틀림)
        raise HTTPException(401, str(e)) from e
    except ParseError as e:
        raise HTTPException(422, str(e)) from e

    # 5) (옵션) Supabase 저장
    inserted = 0
    if persist and records:
        inserted = persist_medication_records(
            user_client=client,
            user_id=user.id,
            records=records,
        )

    # 6) 응답 — 미리보기 + 추천 엔진 입력용 고유 성분명
    ingredients = sorted({r.ingredient_en for r in records if r.ingredient_en})
    return MedicationUploadResponse(
        count=len(records),
        persisted=persist and inserted > 0,
        inserted=inserted,
        unique_ingredients=ingredients,
        items=[MedicationItem(**r.to_dict()) for r in records],
    )


@router.get(
    "/{user_id}",
    response_model=list[MedicationItem],
    summary="저장된 투약이력 조회",
)
async def list_medication(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """저장된 투약이력을 조제일자 최신순으로 반환.

    본인 데이터만 조회 가능(RLS + JWT 대조). 기록이 없으면 빈 배열.
    """
    if user_id != user.id:
        raise HTTPException(403, "본인의 투약이력만 조회할 수 있습니다.")
    client = get_user_client(user.access_token)
    rows = fetch_medication_records(client, user.id)
    return [MedicationItem(**row) for row in rows]