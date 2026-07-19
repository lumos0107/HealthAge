"""
LLM 기반 confidence 평가.

추출 결과(measurements, lifestyle)와 원본 이미지를 LLM에 다시 보내,
각 값이 이미지에 명시된 것과 일치하는지 평가받음.

설계 결정:
  - 별도 호출 (추출 호출과 분리) → 기존 prompt/스키마 영향 없음
  - 응답은 confidence 숫자만 (note 필드 없음)
  - 호출 실패해도 파이프라인은 계속 동작 → 빈 dict 반환

[step12] 신규.
"""

from __future__ import annotations
import json
from typing import Any

from app.ocr.pipeline.utils.vision_backend import (
    VisionBackendError,
    get_vision_backend,
)


# ============================================================
# Prompt
# ============================================================

EVALUATOR_SYSTEM_PROMPT = """당신은 OCR 결과 검증자입니다.
이미지와 추출된 결과를 보고, 각 값이 이미지에 명시된 것과 정확히 일치하는지 평가하세요.

평가 기준 (0.0 ~ 1.0):
- 0.9~1.0: 이미지에 명확히 보이고 추출값과 정확히 일치
- 0.7~0.9: 일치하지만 약간의 모호함 (작은 글씨, 부분 가림)
- 0.5~0.7: 부분 일치 또는 추정에 의존, 불확실
- 0.5 미만: 일치 안 함 또는 이미지에서 확인 불가

[중요 규칙]
1. 평가 대상은 입력으로 받은 추출 결과의 키만. 임의로 키를 추가/제거하지 마세요.
2. 값이 이미지의 어디에 있는지 모르면 0.5 미만으로 평가.
3. 의학적 정상/비정상 판정 아님 — 단순히 "이미지에 그렇게 적혀 있나"만 평가.
4. 응답은 confidence 숫자만 (이유, 설명 불필요).

응답 형식 (JSON, 다른 텍스트 X):
{
  "measurements": {
    "sbp": 0.95,
    "dbp": 0.6
  },
  "lifestyle": {
    "smoking": 0.9,
    "drinking": 0.85
  }
}
"""


# ============================================================
# 평가 호출
# ============================================================

class ConfidenceEvaluator:
    """LLM에 추출 결과를 보내 각 값에 confidence 평가받음."""

    def __init__(self, model: str | None = None):
        # model=None이면 backend의 default_model 사용 (step10 패턴)
        self.model = model

    def evaluate(
        self,
        image_base64: str,
        measurements: dict[str, dict[str, Any]],
        lifestyle: dict[str, Any],
    ) -> dict[str, dict[str, float]]:
        """LLM에 추출 결과를 보내 confidence 평가.
        
        Args:
            image_base64: 원본 이미지 (base64 PNG).
            measurements: 추출된 measurements dict.
            lifestyle: 추출된 lifestyle dict.
        
        Returns:
            {"measurements": {"sbp": 0.95, ...}, "lifestyle": {"smoking": 0.9, ...}}
            
            호출 실패하거나 빈 응답이면 빈 dict 반환:
            {"measurements": {}, "lifestyle": {}}
        """
        # 빈 입력이면 호출 생략
        if not measurements and not lifestyle:
            return {"measurements": {}, "lifestyle": {}}
        
        # User prompt: 추출 결과를 JSON으로 직렬화해 LLM에 전달
        extracted_payload = {
            "measurements": measurements,
            "lifestyle": lifestyle,
        }
        user_prompt = (
            "이 이미지에서 OCR로 추출한 결과는 다음과 같습니다. "
            "각 값이 이미지에 정확히 일치하는지 평가하세요.\n\n"
            f"추출 결과:\n{json.dumps(extracted_payload, ensure_ascii=False, indent=2)}\n\n"
            "응답은 위 시스템 지시의 JSON 형식으로만."
        )
        
        backend = get_vision_backend()
        try:
            parsed, call_meta = backend.call(
                system_prompt=EVALUATOR_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                image_base64=image_base64,
                model=self.model,
            )
        except VisionBackendError as e:
            print(f"[ConfidenceEvaluator] LLM 호출 실패: {type(e).__name__}: {e}")
            print(f"[ConfidenceEvaluator] 휴리스틱만으로 진행")
            return {"measurements": {}, "lifestyle": {}}
        except Exception as e:
            print(f"[ConfidenceEvaluator] 예상치 못한 오류: {type(e).__name__}: {e}")
            return {"measurements": {}, "lifestyle": {}}
        
        elapsed = call_meta.get("elapsed_sec", 0)
        print(f"[ConfidenceEvaluator] 평가 응답 수신 ({elapsed}초)")
        
        # [step12-debug] 임시 디버그: LLM 원본 응답과 파싱 결과 출력
        # 평가 결과가 모두 동일한 값으로 나오는 등 의심스러울 때 진단용
        # — 정상 동작 확인 후 제거 권장
        raw = call_meta.get("raw_response", "<no raw_response>")
        raw_preview = raw[:2000] if isinstance(raw, str) else str(raw)[:2000]
        print(f"[ConfidenceEvaluator-DEBUG] === LLM raw response (앞 2000자) ===")
        print(raw_preview)
        print(f"[ConfidenceEvaluator-DEBUG] === parsed dict ===")
        print(parsed)
        print(f"[ConfidenceEvaluator-DEBUG] === end ===")
        
        return _parse_response(parsed, measurements, lifestyle)


# ============================================================
# 응답 파싱
# ============================================================

def _parse_response(
    parsed: dict[str, Any],
    measurements: dict[str, dict[str, Any]],
    lifestyle: dict[str, Any],
) -> dict[str, dict[str, float]]:
    """LLM 응답 dict를 정규화. 방어 코드 포함.
    
    - 입력 measurements/lifestyle에 있는 키만 채택 (LLM이 임의 키 추가해도 무시)
    - 값이 float/int가 아니거나 0~1 밖이면 무시
    """
    out: dict[str, dict[str, float]] = {"measurements": {}, "lifestyle": {}}
    
    raw_measurements = parsed.get("measurements") or {}
    if isinstance(raw_measurements, dict):
        for key in measurements.keys():
            conf = _coerce_confidence(raw_measurements.get(key))
            if conf is not None:
                out["measurements"][key] = conf
    
    raw_lifestyle = parsed.get("lifestyle") or {}
    if isinstance(raw_lifestyle, dict):
        for key in lifestyle.keys():
            if lifestyle.get(key) is None:
                continue  # null 값은 평가 대상 아님
            conf = _coerce_confidence(raw_lifestyle.get(key))
            if conf is not None:
                out["lifestyle"][key] = conf
    
    return out


def _coerce_confidence(v: Any) -> float | None:
    """confidence 값으로 정규화. 0~1 사이 float만 허용."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        if 0.0 <= f <= 1.0:
            return f
    return None
