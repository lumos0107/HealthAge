"""Pydantic 스키마 단위 테스트.

DB나 외부 의존성 없이 동작 — 빠른 피드백 루프.
실행: uv run pytest tests/test_schemas.py
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.checkup import CheckupBase, CheckupCreate, OCRCheckupData
from app.schemas.profile import ProfileResponse, ProfileUpdate


# ══════════════════════════════════════════════════════════════════
# Profile
# ══════════════════════════════════════════════════════════════════

class TestProfile:
    def test_update_all_optional(self):
        """PATCH는 모든 필드 선택. 빈 dict도 OK."""
        p = ProfileUpdate()
        assert p.name is None
        assert p.gender is None

    def test_update_partial(self):
        """일부만 업데이트."""
        p = ProfileUpdate(gender=1)
        assert p.gender == 1
        assert p.name is None

    def test_gender_only_1_or_2(self):
        """gender는 1(남)/2(여)만 허용. 분석 측 형식."""
        ProfileUpdate(gender=1)
        ProfileUpdate(gender=2)
        with pytest.raises(ValidationError):
            ProfileUpdate(gender=3)
        with pytest.raises(ValidationError):
            ProfileUpdate(gender=0)

    def test_birth_year_range(self):
        ProfileUpdate(birth_year=1980)
        with pytest.raises(ValidationError):
            ProfileUpdate(birth_year=1800)


# ══════════════════════════════════════════════════════════════════
# CheckupBase / Create — DB 컬럼 매핑
# ══════════════════════════════════════════════════════════════════

class TestCheckupCreate:
    def _minimal(self) -> dict:
        """최소 필수 필드만 (exam_date, exam_year)."""
        return {"exam_date": "2024-03-15", "exam_year": 2024}

    def test_minimal_passes(self):
        """필수만 있어도 통과."""
        c = CheckupCreate(**self._minimal())
        assert c.exam_year == 2024
        assert c.sbp is None  # 미지정은 None

    def test_full_checkup(self):
        """홍길동 케이스 — 15개 검진 + 생활습관 전부."""
        c = CheckupCreate(
            exam_date="2024-03-15",
            exam_year=2024,
            height_cm=172,
            weight_kg=78,
            bmi=26.4,
            waist_cm=88,
            sbp=135,
            dbp=88,
            fbs=105,
            total_cholesterol=215,
            ldl=135,
            hdl=42,
            tg=180,
            ast=35,
            alt=48,
            ggt=72,
            hb=15.2,
            creatinine=1.0,
            urine_protein=1,
            smoking=3,
            drinking=1,
        )
        assert c.smoking == 3
        assert c.drinking == 1

    def test_smoking_codes(self):
        """smoking: 1=non, 2=former, 3=current."""
        for code in (1, 2, 3):
            CheckupCreate(**self._minimal(), smoking=code)
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), smoking=0)
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), smoking=4)

    def test_drinking_codes(self):
        """drinking: 0=no, 1=yes."""
        CheckupCreate(**self._minimal(), drinking=0)
        CheckupCreate(**self._minimal(), drinking=1)
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), drinking=2)

    def test_urine_protein_range(self):
        """urine_protein: 1~6만."""
        for code in (1, 2, 3, 4, 5, 6):
            CheckupCreate(**self._minimal(), urine_protein=code)
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), urine_protein=0)
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), urine_protein=7)

    def test_negative_values_rejected(self):
        """검진 수치 음수 거부 (의학적 sanity)."""
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), sbp=-10)
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), ldl=-1)

    def test_extreme_outliers_rejected(self):
        """극단적 이상치 거부."""
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), sbp=500)   # 수축기 500 불가
        with pytest.raises(ValidationError):
            CheckupCreate(**self._minimal(), bmi=100)   # BMI 100 불가

    def test_exam_year_range(self):
        CheckupCreate(exam_date="2024-03-15", exam_year=2024)
        with pytest.raises(ValidationError):
            CheckupCreate(exam_date="2024-03-15", exam_year=1990)


# ══════════════════════════════════════════════════════════════════
# OCRCheckupData — OCR 친구가 내놓는 형식
# ══════════════════════════════════════════════════════════════════

class TestOCRCheckupData:
    def test_minimal(self):
        """meta 비어있고 measurements 빈 dict도 OK."""
        data = OCRCheckupData()
        assert data.meta.exam_date is None
        assert data.measurements == {}

    def test_friend_ocr_output(self):
        """OCR 친구 검증 결과의 실제 출력 형식."""
        raw = {
            "meta": {
                "source_images": ["test_image.png"],
                "page_count": 1,
                "exam_date": None,
                "patient_gender": None,
                "ocr_confidence": 0.67,
            },
            "measurements": {
                "height": {"value": 165.9, "unit": "cm"},
                "creatinine": {"value": 92, "unit": "mg/dL"},
                "urine_protein": {"value": "정상", "code": 1},
            },
            "lifestyle": {"smoking": "current", "drinking": "no"},
        }
        data = OCRCheckupData.model_validate(raw)
        assert data.measurements["height"]["value"] == 165.9
        assert data.lifestyle["smoking"] == "current"

    def test_extra_fields_allowed(self):
        """OCR이 새 필드 추가해도 통과 (extra='allow')."""
        data = OCRCheckupData.model_validate({
            "meta": {"new_field": "future_value", "exam_date": "2024-03-15"},
            "measurements": {},
        })
        # extra 필드 접근 가능
        assert data.meta.model_extra.get("new_field") == "future_value"

    def test_no_unit_ok(self):
        """분석 측 형식: measurements에서 unit 생략 OK."""
        data = OCRCheckupData.model_validate({
            "measurements": {"sbp": {"value": 138}},  # unit 없음
        })
        assert data.measurements["sbp"]["value"] == 138
