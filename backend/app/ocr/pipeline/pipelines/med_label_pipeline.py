"""
약봉투 OCR 파이프라인.

검진지와 달리 표 분할이 없어 단순함:
  - splitter 미사용 (약봉투는 텍스트 위주, 표 없음)
  - 단일 LLM 호출로 메타 + 약품 리스트 모두 추출
  - 응답 형식 강제: medications를 항상 list로

설계 결정:
  - 약품 1개여도 [...]
  - 추출 못 한 필드는 null 보존 (스키마 키는 항상 존재)
  - 정규화/KD코드 매칭은 OCR 책임 아님 (백엔드/분석 측이 후처리)
"""

from __future__ import annotations
import base64
from io import BytesIO
from typing import Any

from PIL import Image

from app.ocr.pipeline.utils.vision_backend import (
    VisionBackendError,
    get_vision_backend,
)
from app.ocr.pipeline.utils.schemas_med_label import (
    MedicationItem,
    MedLabelMeta,
    MedLabelPageResult,
)


# ============================================================
# Prompt — 약봉투 단일 호출
# ============================================================

MED_LABEL_SYSTEM_PROMPT = """당신은 한국 약국에서 발행하는 약봉투의 정보를 추출하는 OCR 전문가입니다.

약봉투는 약국마다 양식이 다양합니다:
  - 약품 1개당 별도 봉투 (가장 흔함, 약품 1개 + 환자 정보)
  - 통합 약봉투 (여러 약품이 한 장에 표 형태)
  - 처방전 형태의 안내문

다음 정보를 추출하세요:

[메타 정보]
- dispense_date: 조제일자 (YYYY-MM-DD 형식. "2025년 5월 20일" → "2025-05-20")
- patient_name: 환자 이름
- patient_birth: 환자 생년월일 (YYYY-MM-DD 형식)
- pharmacy_name: 약국명 (예: "OO약국")
- prescriber: 처방의 또는 처방기관 (병원명)

[약품 리스트 — 약품이 1개여도 반드시 배열로]
각 약품마다 다음 필드:
- name_raw: 약품명 원본 그대로 (용량 포함. 예: "타이레놀정 500mg")
- dose_per_take: 1회 복용량 (예: "1정", "5mL", "1캡슐")
- times_per_day: 1일 복용 횟수 (정수. 예: 3)
- duration_days: 복용 일수 (정수. 예: 5)
- timing: 복용 시점 (예: "식후 30분", "취침 전", "식전")
- notes: 기타 주의사항 (없으면 null)

[전체 약품 개수]
- medication_count_declared: 약봉투에 명시된 총 약품 종 수 (예: "총 3종" → 3). 없으면 null.

[핵심 규칙]
1. 모든 필드는 추출 못 한 경우 null. 추측 금지.
2. medications는 반드시 배열. 약품 0개면 [], 1개면 [...], 여러 개면 [..., ...].
3. 약품명은 원본 그대로 (오타 수정/정규화 금지). "타이레놀ER" → "타이레놀ER" 그대로.
4. 숫자 필드(times_per_day, duration_days)는 정수만. 텍스트 그대로 두지 말 것.
5. 날짜는 YYYY-MM-DD. 다른 형식이면 변환. 모호하면 null.

응답은 다음 JSON 형식으로 정확히 출력:
{
  "meta": {
    "dispense_date": "...",
    "patient_name": "...",
    "patient_birth": "...",
    "pharmacy_name": "...",
    "prescriber": "..."
  },
  "medications": [
    {
      "name_raw": "...",
      "dose_per_take": "...",
      "times_per_day": ...,
      "duration_days": ...,
      "timing": "...",
      "notes": null
    }
  ],
  "medication_count_declared": ...
}
"""

MED_LABEL_USER_PROMPT = """이 약봉투 이미지에서 위 지시에 따라 정보를 추출하세요.
추출 못 한 필드는 null. medications는 반드시 배열."""


# ============================================================
# 파이프라인 본체
# ============================================================

class MedLabelPipeline:
    """약봉투 1장 처리. 단일 LLM 호출."""

    def __init__(self, model: str | None = None):
        # model=None이면 vision_backend의 default_model 사용 (step10 패턴)
        self.model = model

    def process(self, image: Image.Image, page_name: str) -> MedLabelPageResult:
        """이미지 1장을 처리해 MedLabelPageResult 반환.

        Args:
            image: PIL Image (RGB).
            page_name: 결과 식별용 이름.
        """
        # 이미지 → base64 (PNG 인코딩, vision_backend가 받는 형식)
        b64 = _image_to_base64_png(image)

        print(f"[MedLabelPipeline] {page_name} 처리 시작 (단일 호출)")

        backend = get_vision_backend()
        try:
            parsed, call_meta = backend.call(
                system_prompt=MED_LABEL_SYSTEM_PROMPT,
                user_prompt=MED_LABEL_USER_PROMPT,
                image_base64=b64,
                model=self.model,
            )
        except VisionBackendError as e:
            print(f"[MedLabelPipeline] LLM 호출 실패: {type(e).__name__}: {e}")
            # 빈 결과 반환 — 호출자가 confidence 0 보고 판단
            return MedLabelPageResult(
                page_name=page_name,
                ocr_confidence=0.0,
                raw_meta={"error": str(e)},
            )

        elapsed = call_meta.get("elapsed_sec", 0)
        tps = call_meta.get("tokens_per_sec", 0)
        print(f"[MedLabelPipeline] 응답 수신 ({elapsed}초, {tps} tok/s)")

        # parsed에서 데이터 클래스로 매핑
        return _parse_response(parsed, page_name, call_meta)


# ============================================================
# 응답 파싱
# ============================================================

def _parse_response(
    parsed: dict[str, Any],
    page_name: str,
    call_meta: dict[str, Any],
) -> MedLabelPageResult:
    """LLM 응답 dict를 MedLabelPageResult로 변환. 방어 코드 포함."""
    # ----- meta -----
    raw_meta = parsed.get("meta") or {}
    if not isinstance(raw_meta, dict):
        raw_meta = {}
    meta = MedLabelMeta(
        dispense_date=_str_or_none(raw_meta.get("dispense_date")),
        patient_name=_str_or_none(raw_meta.get("patient_name")),
        patient_birth=_str_or_none(raw_meta.get("patient_birth")),
        pharmacy_name=_str_or_none(raw_meta.get("pharmacy_name")),
        prescriber=_str_or_none(raw_meta.get("prescriber")),
    )

    # ----- medications -----
    raw_meds = parsed.get("medications") or []
    if not isinstance(raw_meds, list):
        # LLM이 잘못 dict로 반환한 경우 등 — 빈 배열 처리
        print(f"[MedLabelPipeline] 경고: medications가 list 아님 ({type(raw_meds).__name__}). 빈 배열로 처리.")
        raw_meds = []

    medications: list[MedicationItem] = []
    for idx, item in enumerate(raw_meds):
        if not isinstance(item, dict):
            print(f"[MedLabelPipeline] 경고: medications[{idx}]가 dict 아님. 스킵.")
            continue
        medications.append(MedicationItem(
            name_raw=_str_or_none(item.get("name_raw")),
            name_normalized=None,  # OCR은 항상 None
            dose_per_take=_str_or_none(item.get("dose_per_take")),
            times_per_day=_int_or_none(item.get("times_per_day")),
            duration_days=_int_or_none(item.get("duration_days")),
            timing=_str_or_none(item.get("timing")),
            notes=_str_or_none(item.get("notes")),
        ))

    # ----- medication_count_declared -----
    med_count = _int_or_none(parsed.get("medication_count_declared"))

    # ----- confidence 계산 -----
    confidence = _compute_confidence(meta, medications, med_count)

    print(f"[MedLabelPipeline] 추출: 약품 {len(medications)}개"
          f"{f' (선언 {med_count})' if med_count is not None else ''}, confidence={confidence:.2f}")

    return MedLabelPageResult(
        page_name=page_name,
        meta=meta,
        medications=medications,
        medication_count_declared=med_count,
        ocr_confidence=confidence,
        raw_meta=call_meta,
    )


def _compute_confidence(
    meta: MedLabelMeta,
    medications: list[MedicationItem],
    med_count_declared: int | None,
) -> float:
    """OCR confidence 추정 (0~1).

    근거:
    - 약품 0개면 0.0 (OCR 실패로 간주)
    - 약품 1개 이상 잡았으면 0.5 시작
    - 메타 5필드 중 채워진 비율 가중 (+0~0.3)
    - 약품 내 핵심 필드(name_raw, times_per_day, duration_days) 채워진 비율 가중 (+0~0.2)
    - declared와 실제 개수가 일치하면 +0.05 (단, declared 있을 때만)

    경험적 휴리스틱. 정확한 측정 아님 — 0.5 미만이면 의심, 0.8 이상이면 신뢰.
    """
    if not medications:
        return 0.0

    score = 0.5  # 약품 1개 이상 잡은 시점에 기본

    # 메타 가중 (max +0.3)
    meta_fields = [meta.dispense_date, meta.patient_name, meta.patient_birth,
                   meta.pharmacy_name, meta.prescriber]
    meta_filled = sum(1 for f in meta_fields if f)
    score += 0.3 * (meta_filled / len(meta_fields))

    # 약품 핵심 필드 가중 (max +0.15)
    core_filled = 0
    core_total = 0
    for m in medications:
        for field_val in (m.name_raw, m.times_per_day, m.duration_days):
            core_total += 1
            if field_val:
                core_filled += 1
    if core_total > 0:
        score += 0.15 * (core_filled / core_total)

    # declared 일치 보너스 (+0.05)
    if med_count_declared is not None and med_count_declared == len(medications):
        score += 0.05

    return min(score, 1.0)


# ============================================================
# 헬퍼
# ============================================================

def _image_to_base64_png(image: Image.Image) -> str:
    """PIL Image → base64 PNG. vision_backend가 받는 형식."""
    buf = BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _str_or_none(v: Any) -> str | None:
    """문자열로 정규화. 빈 문자열/공백은 None 처리."""
    if v is None:
        return None
    if not isinstance(v, str):
        v = str(v)
    v = v.strip()
    return v if v else None


def _int_or_none(v: Any) -> int | None:
    """정수로 정규화. 변환 불가/null이면 None."""
    if v is None:
        return None
    if isinstance(v, bool):  # bool은 int 서브클래스라 먼저 차단
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v) if v.is_integer() else None
    if isinstance(v, str):
        v = v.strip()
        if not v:
            return None
        try:
            return int(v)
        except ValueError:
            # "3회" 같은 경우 숫자만 추출 시도
            digits = "".join(c for c in v if c.isdigit())
            return int(digits) if digits else None
    return None
