"""투약이력 저장 계층 (Supabase).

라우터는 이 모듈의 persist_medication_records()만 호출한다.
저장소가 바뀌어도 라우터는 안 건드린다 (기존 user_store/report_io 패턴과 동일).
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.medication import MedicationRecord

logger = logging.getLogger(__name__)


def persist_medication_records(
    *,
    user_client: Client,
    user_id: str,
    records: list[MedicationRecord],
) -> int:
    """투약이력을 Supabase에 저장하고 삽입된 행 수를 반환.

    Args:
        user_client: 사용자 JWT가 부착된 Supabase 클라이언트 (RLS 적용).
        user_id: profiles.id (JWT의 sub claim).
        records: 파싱된 투약 레코드들.

    Returns:
        실제로 INSERT된 행 수.

    Raises:
        HTTPException: DB 저장 실패 시 500.
    """
    if not records:
        return 0

    rows = []
    for r in records:
        row = r.to_dict()
        row["user_id"] = user_id
        # MedicationRecord에는 없지만 DB 컬럼명에 맞춰 정규화
        # (모델 to_dict() 결과가 DB 컬럼명과 동일하므로 그대로 사용)
        rows.append(row)

    try:
        resp = user_client.table("medication_records").insert(rows).execute()
    except Exception as e:
        logger.exception("medication_records INSERT 실패")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"투약이력 저장 실패: {e}",
        ) from e

    inserted = len(resp.data or [])
    if inserted != len(rows):
        logger.warning(
            "medication_records: 요청 %d행 중 %d행만 INSERT됨",
            len(rows), inserted,
        )
    return inserted


_MED_COLUMNS = (
    "dispensed_date, product_name, efficacy_class, ingredient_en, "
    "total_days, times_per_day, dose_per_time, unit, drug_code, "
    "prescriber, dispenser, safety_alert, antithrombotic"
)


def fetch_medication_records(
    user_client: Client, user_id: str
) -> list[dict[str, Any]]:
    """저장된 투약이력을 조회일자 최신순으로 반환.

    Args:
        user_client: 사용자 JWT가 부착된 Supabase 클라이언트 (RLS 적용).
        user_id: profiles.id (JWT의 sub claim).

    Returns:
        MedicationItem 필드와 동일한 dict 리스트. 없으면 빈 리스트.

    Raises:
        HTTPException: DB 조회 실패 시 500.
    """
    try:
        resp = (
            user_client.table("medication_records")
            .select(_MED_COLUMNS)
            .eq("user_id", user_id)
            .order("dispensed_date", desc=True)
            .execute()
        )
    except Exception as e:
        logger.exception("medication_records 조회 실패")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"투약이력 조회 실패: {e}",
        ) from e

    return list(resp.data or [])


def fetch_profile_birthday(
    user_client: Client, user_id: str
) -> str | None:
    """profiles.birth_year + birth_md로 HIRA 암호용 8자리 문자열 생성.

    Returns:
        "YYYYMMDD" 또는 None (둘 중 하나라도 없으면).
    """
    try:
        resp = (
            user_client.table("profiles")
            .select("birth_year, birth_md")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        logger.warning("profiles 조회 실패 (user_id=%s): %s", user_id, e)
        return None

    if not resp or not resp.data:
        return None

    year = resp.data.get("birth_year")
    md = resp.data.get("birth_md")
    if year is None or md is None:
        return None

    # md는 0101~1231 형태의 정수. 4자리로 zero-pad.
    return f"{year}{md:04d}"