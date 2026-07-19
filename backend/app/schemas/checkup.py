"""검진 데이터 스키마.

두 가지 형식을 다룬다:
  1. OCRCheckupData : OCR이 내놓는 JSON 형식 (분석 측 형식과 호환)
                      → measurements 안에 {value, unit?} 형태
                      → analyzer가 이 dict를 그대로 받음
  2. CheckupCreate  : DB INSERT용 평면 dict
                      → 15개 컬럼 펼침 + 생활습관 2개

분석 측 형식 결정 사항 (기존 대화에서):
  - gender: 1(남) / 2(여) 정수
  - smoking: 1=non, 2=former, 3=current
  - drinking: 0=no, 1=yes
  - urine_protein: 1~6 코드 (음성=1 ~ 4+=6)
  - measurements 값에 unit 생략 OK (분석 측은 unit 안 봄)

⚠️ 두 형식 사이의 변환은 라우터/서비스 레이어에서 수행.
   변환 로직은 턴 3에서 추가 예정.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ══════════════════════════════════════════════════════════════════
# 1. OCR JSON 형식 (분석 측 호환)
# ══════════════════════════════════════════════════════════════════

class OCRMeta(BaseModel):
    """OCR JSON의 meta 부분."""
    model_config = ConfigDict(extra="allow")  # source_images 등 추가 필드 허용

    exam_date: str | None = Field(default=None, description="YYYY-MM-DD")
    patient_birth: str | None = Field(default=None, description="YYYY-MM-DD")
    patient_gender: str | None = Field(default=None, description="'M' | 'F' | '남' | '여'")
    patient_name: str | None = None
    hospital: str | None = None
    ocr_confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class OCRCheckupData(BaseModel):
    """OCR이 내놓는 최종 JSON 형식.

    analyzer/_internal/ocr_adapter.parse_ocr_json()이 받는 형식이다.
    measurements는 dict로 받음 — 항목별 형식이 유연해서 (value만 있거나, value+unit 있거나).
    """
    model_config = ConfigDict(extra="allow")

    meta: OCRMeta = Field(default_factory=OCRMeta)
    measurements: dict[str, Any] = Field(
        default_factory=dict,
        description="검진 수치. 키: height, weight, waist, sbp, dbp, fbs, "
                    "total_cholesterol, ldl, hdl, tg, hb, creatinine, "
                    "ast, alt, ggt, urine_protein",
    )
    lifestyle: dict[str, Any] = Field(default_factory=dict)


# ══════════════════════════════════════════════════════════════════
# 2. DB 컬럼 형식 (checkup_records 테이블 그대로)
# ══════════════════════════════════════════════════════════════════

class CheckupBase(BaseModel):
    """checkup_records의 모든 컬럼 (record_id, user_id 제외)."""
    # 메타
    exam_date: date
    exam_year: int = Field(ge=2000, le=2100)
    hospital: str | None = None

    # 체위 (4)
    height_cm: float | None = Field(default=None, ge=50, le=250)
    weight_kg: float | None = Field(default=None, ge=20, le=300)
    bmi: float | None = Field(default=None, ge=10, le=60)
    waist_cm: float | None = Field(default=None, ge=30, le=200)

    # 혈압 (2)
    sbp: int | None = Field(default=None, ge=50, le=300)
    dbp: int | None = Field(default=None, ge=30, le=200)

    # 혈당 (1)
    fbs: int | None = Field(default=None, ge=30, le=600)

    # 콜레스테롤 (4)
    total_cholesterol: int | None = Field(default=None, ge=50, le=600)
    ldl: int | None = Field(default=None, ge=20, le=500)
    hdl: int | None = Field(default=None, ge=10, le=200)
    tg: int | None = Field(default=None, ge=20, le=2000)

    # 간 기능 (3)
    ast: int | None = Field(default=None, ge=1, le=5000)
    alt: int | None = Field(default=None, ge=1, le=5000)
    ggt: int | None = Field(default=None, ge=1, le=5000)

    # 기타 (2)
    hb: float | None = Field(default=None, ge=3, le=25)
    creatinine: float | None = Field(default=None, ge=0.1, le=20)

    # 요검사 (1)
    urine_protein: int | None = Field(default=None, ge=1, le=6, description="1=음성 ~ 6=4+")

    # 생활습관 (2)
    smoking: Literal[1, 2, 3] | None = Field(
        default=None, description="1=비흡연, 2=과거흡연, 3=현재흡연"
    )
    drinking: Literal[0, 1] | None = Field(
        default=None, description="0=비음주, 1=음주"
    )


class CheckupCreate(CheckupBase):
    """사용자가 OK한 검진 등록 요청.

    프론트엔드의 검수 화면에서 사용자가 확정한 값이 그대로 들어온다.
    user_id는 토큰에서 가져오므로 body에 안 받는다.
    """
    pass


class CheckupResponse(CheckupBase):
    """검진 조회 응답."""
    model_config = ConfigDict(from_attributes=True)

    record_id: str
    user_id: str
    created_at: str
    updated_at: str


class CheckupListResponse(BaseModel):
    """검진 목록 응답 — 시계열 시각화용."""
    items: list[CheckupResponse]
    total: int
