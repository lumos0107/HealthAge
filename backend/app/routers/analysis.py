"""분석 + 리포트 조회 라우터.

기존 분석 측 명세와 path/body 호환.
모든 요청에 JWT 헤더 필수. body의 user_id는 토큰의 user_id와 일치해야 함.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.auth import CurrentUser, get_current_user
from app.db import get_user_client
from app.services.checkup_service import (
    analyze_and_save,
    delete_report_by_year,
    get_latest_comprehensive,
    get_report_by_year,
    list_report_years,
    simulate_latest,
)
from app.services.user_service import require_same_user

router = APIRouter(tags=["analysis"])


# ──────────────────────────────────────────────────────────────────
# POST /analyze
# ──────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """기존 분석 측 명세의 AnalyzeRequest 호환."""
    model_config = ConfigDict(extra="allow")

    ocr: dict[str, Any] = Field(description="OCR JSON (사용자 검수 후 형식)")
    user_id: str | None = Field(default=None, description="토큰의 user_id와 일치해야 함")
    user_info: dict[str, Any] | None = Field(
        default=None,
        description="분석 보조 정보 (gender, birth_year 등). 없으면 profiles에서 조회.",
    )
    save: bool = Field(default=False, description="True면 checkup_records + analysis_results에 저장")


class AnalyzeResponse(BaseModel):
    """기존 분석 측 명세의 AnalyzeResponse 호환 (필드 추가는 하위호환)."""
    basic_report: dict[str, Any]
    comprehensive: dict[str, Any]
    recommendations: dict[str, Any] = Field(default_factory=dict)
    group_analysis: dict[str, Any] = Field(
        default_factory=dict,
        description="그룹 분류 + 대사증후군 세부 + 조합그룹",
    )
    combo_analysis: dict[str, Any] = Field(
        default_factory=dict,
        description="조합 그룹(복합 질환군) 판정 + 모집단 O/E 통계 + 지방간 유형",
    )
    medications_known: bool = False
    saved: bool
    saved_paths: list[str] | None = None
    warnings: list[str] = Field(default_factory=list)


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(
    payload: AnalyzeRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """OCR JSON → 분석 + (옵션) DB 저장.

    body의 user_id가 토큰과 다르면 403.
    """
    if payload.user_id is not None:
        require_same_user(payload.user_id, user.id)

    client = get_user_client(user.access_token)
    return await analyze_and_save(
        user_client=client,
        user_id=user.id,
        ocr_json=payload.ocr,
        user_info=payload.user_info,
        save=payload.save,
    )


# ──────────────────────────────────────────────────────────────────
# POST /analyze/simulate — 검진값 What-if 재계산
# ──────────────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    """바꿔볼 검진값. 지정한 항목만 교체하고 나머지는 최근 검진값을 그대로 쓴다.

    ⚠️ 생활습관 변화의 효과를 추정하는 게 아니다 — 검진값을 직접 바꿔 넣었을 때
       공식이 산출하는 값을 다시 계산할 뿐이다(무엇을 못 하는지는 응답 limitations).
    """
    weight: float | None = Field(default=None, description="체중 kg (BMI도 함께 재계산)")
    waist: float | None = Field(default=None, description="허리둘레 cm")
    sbp: float | None = Field(default=None, description="수축기혈압 mmHg")
    dbp: float | None = Field(default=None, description="이완기혈압 mmHg")
    fbs: float | None = Field(default=None, description="공복혈당 mg/dL")
    tg: float | None = Field(default=None, description="중성지방 mg/dL")
    hdl: float | None = Field(default=None, description="HDL 콜레스테롤 mg/dL")
    ldl: float | None = Field(default=None, description="LDL 콜레스테롤 mg/dL")


@router.post("/analyze/simulate")
def simulate_endpoint(
    payload: SimulateRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """최근 검진값 + 지정한 변경 → 지표 재계산 결과(전/후 비교). 저장하지 않는다."""
    client = get_user_client(user.access_token)
    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    return simulate_latest(client, user.id, changes)


# ──────────────────────────────────────────────────────────────────
# GET /reports/{user_id}
# ──────────────────────────────────────────────────────────────────

@router.get("/reports/{user_id}")
def reports_years(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """사용자의 검진 연도 목록.

    Returns:
        {"user_id": ..., "years": [2022, 2023, 2024], "count": 3}
    """
    require_same_user(user_id, user.id)
    client = get_user_client(user.access_token)
    return list_report_years(client, user_id)


@router.get("/reports/{user_id}/{year}")
def report_by_year(
    user_id: str,
    year: int,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """특정 연도의 검진 + 분석 결과."""
    require_same_user(user_id, user.id)
    client = get_user_client(user.access_token)
    return get_report_by_year(client, user_id, year)


@router.get("/reports/{user_id}/comprehensive/latest")
def latest_comprehensive(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """가장 최근 종합 분석 결과."""
    require_same_user(user_id, user.id)
    client = get_user_client(user.access_token)
    return get_latest_comprehensive(client, user_id)

@router.delete("/reports/{user_id}/{year}")
def delete_report(
    user_id: str,
    year: int,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """특정 연도의 검진 + 분석 결과 삭제.

    동작:
      - checkup_records (user_id, year) 1행 삭제
      - analysis_results: CASCADE로 자동 삭제
      - timeseries_analyses: 해당 user 전체 캐시 무효화

    Returns:
        {"deleted": {"checkup_records": N, "analysis_results": N, "timeseries_analyses": N}}
    """
    require_same_user(user_id, user.id)
    client = get_user_client(user.access_token)
    return delete_report_by_year(client, user_id, year)