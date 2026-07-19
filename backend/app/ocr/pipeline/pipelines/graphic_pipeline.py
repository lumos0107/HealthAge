"""
그래픽 파이프라인.

그래픽이 포함된 영역(표 안 그래픽 또는 표 외 단독 그래픽)에서 측정값을 추출.
TablePipeline과 동일한 그룹 A/B 분할 구조를 사용하되, 프롬프트가 그래픽 인지에 맞춰 강화됨.

두 가지 모드:
  - 모드 A (inside_table): 격자 있는 표 안 그래픽. 행 단위 매칭 우선 (정교)
  - 모드 B (outside_table): 격자 없는 단독 그래픽. best-effort 처리

처리 우선순위 (모드 공통):
  1. 강조 표시(빨간 박스, 색 강조, 굵은 글씨) 안 숫자 → 측정값
  2. 그래프 위 마커가 가리키는 축 눈금 → 보조적 추정 (확신 없으면 null)
  3. 둘 다 안 되면 null
"""

from __future__ import annotations

from PIL import Image

from app.ocr.pipeline import config
from app.ocr.pipeline.pipelines.base import BasePipeline
from app.ocr.pipeline.pipelines.table_pipeline import (
    COMMON_RULES,
    GROUP_A_SYSTEM_PROMPT, GROUP_A_USER_PROMPT,
    GROUP_B_SYSTEM_PROMPT, GROUP_B_USER_PROMPT,
    _clean_measurements, _clean_lifestyle,
    _normalize_exam_date,
    _parse_rrn_prefix,
    _normalize_name,
    _normalize_hospital,
    _compute_ocr_confidence,
)
from app.ocr.pipeline.utils import image_utils, ollama_client
from app.ocr.pipeline.utils.schemas import PipelineResult, RegionInfo, RegionType
# [step12] confidence 평가 모듈
from app.ocr.pipeline.pipelines.confidence_evaluator import ConfidenceEvaluator
from app.ocr.pipeline.utils.confidence_heuristic import (
    heuristic_measurements, heuristic_lifestyle,
)
from app.ocr.pipeline.utils.confidence_combine import combine_confidence


# ============================================================
# 모드 A: 표 안 그래픽 (주력 — 정교한 처리)
# ============================================================

MODE_A_PREFIX = """============================================================
[★ 이 영역의 특성: 표 안 그래픽 ★]
============================================================

이 이미지는 격자 있는 표의 crop입니다. 표 안에 가로 막대그래프, 자/눈금, 마커 등의
그래픽 요소가 함께 있습니다.

[추출 우선순위 — 반드시 이 순서로 시도]

1순위: 강조 표시 안 숫자
   - 빨간 박스, 색 강조 박스, 굵은 글씨로 강조된 숫자가 있으면 그것이 측정값입니다.
   - 강조 표시는 항목명과 같은 행에 있는 것만 사용하세요.

2순위: 표 안 일반 텍스트 숫자
   - 강조 표시가 없으면 그 행의 일반 텍스트 숫자를 측정값으로.

3순위: 마커-눈금 매칭 (보조적)
   - 위 둘 다 없고 그래프 위 마커(▼, ●, |)만 있다면, 축 눈금과 비교해 추정 가능.
   - 다만 정확도가 낮으니, 확신이 없으면 null로 두세요.

[행 매칭 — 가장 흔한 오류 방지]

각 항목의 값을 찾을 때:
1) 항목명("허리둘레", "수축기 혈압" 등)의 행을 식별 (같은 y 좌표)
2) 그 행의 가로 라인을 따라 오른쪽으로 이동
3) 강조 표시 또는 숫자를 찾음
4) 절대 다른 행의 숫자를 가져오지 마세요

❌ 잘못된 예: LDL 행을 찾고 있는데, 그 위 HDL 행의 강조 숫자를 가져옴
✅ 올바른 예: 각 행마다 항목명 → 같은 행 안에서만 숫자 탐색

[그래프 구간 라벨 무시]

막대그래프에는 "정상A | 정상B | 경계 | 질환의심" 같은 구간 라벨과 그 경계 숫자가 있습니다.
이런 구간 경계 숫자는 측정값이 아닙니다. 반드시 강조 표시 안 숫자만 측정값으로 인식하세요.

"""


# ============================================================
# 모드 B: 표 외 그래픽 (보조 — best-effort)
# ============================================================

MODE_B_PREFIX = """============================================================
[이 영역의 특성: 표 외 단독 그래픽]
============================================================

이 이미지는 격자 없는 단독 그래픽 영역입니다 (단독 그래프, 다이어그램 등).

[추출 가이드]

1. 그래픽 안 또는 주변에 항목명 라벨(예: "LDL", "혈색소", "BMI")이 있는지 찾으세요.
2. 항목명과 가까운 위치에 강조 표시(빨간 박스, 색 강조) 안 숫자가 있으면 측정값.
3. 강조 표시 없이 마커만 있고 축 눈금과 매칭이 필요하면, 확신이 없을 시 null로 두세요.
4. 항목명이 명확하지 않으면 그 항목은 null.

표 외 그래픽은 양식이 매우 다양하므로, 확실한 것만 추출하세요. 추측 금지.

"""


# ============================================================
# GraphicPipeline 본체
# ============================================================

class GraphicPipeline(BasePipeline):
    """그래픽 영역 처리 파이프라인.
    
    TablePipeline과 동일한 그룹 A/B 분할 + 동일한 후처리.
    프롬프트만 그래픽 인지로 강화 + 모드 A/B 분기.
    """
    
    def __init__(
        self,
        model: str | None = None,
        save_debug: bool = True,
    ):
        self.model = model or config.OLLAMA_MODEL_VISION
        self.save_debug = save_debug
    
    @property
    def supported_region_type(self) -> RegionType:
        return RegionType.GRAPHIC
    
    def process(
        self,
        region_image: Image.Image,
        region_info: RegionInfo,
    ) -> PipelineResult:
        # 모드 선택 (RegionInfo.source 기반)
        mode = self._select_mode(region_info)
        prefix = MODE_A_PREFIX if mode == "A" else MODE_B_PREFIX
        
        # crop 이미지를 base64로 변환 (두 호출이 같은 이미지 공유)
        b64 = image_utils.image_to_base64(region_image, format="PNG")
        
        print(f"[GraphicPipeline] 영역 {region_info.bbox} 처리 시작 "
              f"(모드 {mode}, source={region_info.source}, 2회 호출)")
        
        # 시스템 프롬프트에 모드 prefix 추가
        group_a_system = prefix + GROUP_A_SYSTEM_PROMPT
        group_b_system = prefix + GROUP_B_SYSTEM_PROMPT
        
        # ----------------------------------------
        # 1차 호출: 그룹 A
        # ----------------------------------------
        print(f"[GraphicPipeline] [1/2] 그룹 A 호출 (신체/혈압/혈당/혈액/신장/소변)")
        group_a_result, group_a_debug = self._call_group(
            b64=b64,
            system_prompt=group_a_system,
            user_prompt=GROUP_A_USER_PROMPT,
            group_name="A",
        )
        
        # ----------------------------------------
        # 2차 호출: 그룹 B
        # ----------------------------------------
        print(f"[GraphicPipeline] [2/2] 그룹 B 호출 (지질/간기능/생활습관)")
        group_b_result, group_b_debug = self._call_group(
            b64=b64,
            system_prompt=group_b_system,
            user_prompt=GROUP_B_USER_PROMPT,
            group_name="B",
        )
        
        # ----------------------------------------
        # 두 결과 병합
        # ----------------------------------------
        merged_measurements = {}
        merged_measurements.update(group_a_result.get("measurements") or {})
        merged_measurements.update(group_b_result.get("measurements") or {})
        
        merged_lifestyle = {}
        merged_lifestyle.update(group_a_result.get("lifestyle") or {})
        merged_lifestyle.update(group_b_result.get("lifestyle") or {})
        
        # ----------------------------------------
        # meta 처리 (모두 그룹 A에서 받음. null도 키 유지)
        # ----------------------------------------
        group_a_meta = group_a_result.get("meta") or {}
        exam_date = _normalize_exam_date(group_a_meta.get("exam_date"))
        patient_birth, patient_gender = _parse_rrn_prefix(
            group_a_meta.get("patient_rrn_prefix")
        )
        patient_name = _normalize_name(group_a_meta.get("patient_name"))
        hospital = _normalize_hospital(group_a_meta.get("hospital"))
        
        # ----------------------------------------
        # 후처리 (TablePipeline과 동일 함수 재사용)
        # ----------------------------------------
        cleaned_measurements = _clean_measurements(merged_measurements)
        cleaned_lifestyle = _clean_lifestyle(merged_lifestyle)
        
        # ----------------------------------------
        # OCR 신뢰도 산정 (추출 성공률)
        # ----------------------------------------
        ocr_confidence = _compute_ocr_confidence(cleaned_measurements, cleaned_lifestyle)
        
        # ----------------------------------------
        # 결과 통계
        # ----------------------------------------
        m_count = sum(1 for v in cleaned_measurements.values()
                      if v.get("value") is not None or v.get("code") is not None)
        l_count = sum(1 for v in cleaned_lifestyle.values() if v is not None)
        print(f"[GraphicPipeline] 최종 추출: measurements {m_count}/16, lifestyle {l_count}/2 "
              f"(모드 {mode})"
              + (f", exam_date={exam_date}" if exam_date else "")
              + (f", patient={patient_gender}/{patient_birth}" if patient_birth else "")
              + (f", confidence={ocr_confidence}"))
        
        # null도 키 유지 (결정 B): 백엔드가 "검진지에 없음(null) vs OCR 실패(키 누락)"을 구분
        pipeline_meta = {
            "source_pipeline": self.name,
            "graphic_mode": mode,
            "region_source": region_info.source,
            "exam_date": exam_date,
            "patient_birth": patient_birth,
            "patient_gender": patient_gender,
            "patient_name": patient_name,
            "hospital": hospital,
            "ocr_confidence": ocr_confidence,
        }
        
        # ----------------------------------------
        # [step12] Confidence 평가 (LLM + 휴리스틱)
        # ----------------------------------------
        measurements_for_eval = {
            k: v for k, v in cleaned_measurements.items()
            if v.get("value") is not None or v.get("code") is not None
        }
        lifestyle_for_eval = {
            k: v for k, v in cleaned_lifestyle.items() if v is not None
        }
        
        evaluator = ConfidenceEvaluator(model=self.model)
        try:
            llm_eval = evaluator.evaluate(
                image_base64=b64,
                measurements=measurements_for_eval,
                lifestyle=lifestyle_for_eval,
            )
        except Exception as e:
            print(f"[GraphicPipeline] confidence 평가 호출 중 예외: {type(e).__name__}: {e}")
            llm_eval = {"measurements": {}, "lifestyle": {}}
        
        heur_meas = heuristic_measurements(measurements_for_eval)
        heur_life = heuristic_lifestyle(lifestyle_for_eval)
        
        measurements_confidence = combine_confidence(
            llm_eval.get("measurements", {}), heur_meas
        )
        lifestyle_confidence = combine_confidence(
            llm_eval.get("lifestyle", {}), heur_life
        )
        
        return PipelineResult(
            measurements=cleaned_measurements,
            lifestyle=cleaned_lifestyle,
            meta=pipeline_meta,
            debug={
                "region_bbox": list(region_info.bbox),
                "region_label": region_info.label,
                "region_source": region_info.source,
                "mode": mode,
                "group_a": group_a_debug,
                "group_b": group_b_debug,
            },
            measurements_confidence=measurements_confidence,
            lifestyle_confidence=lifestyle_confidence,
        )
    
    # ----------------------------------------
    # 내부 메서드
    # ----------------------------------------
    
    def _select_mode(self, region_info: RegionInfo) -> str:
        """RegionInfo.source 기반으로 모드 선택.
        
        - source="inside_table" → 모드 A
        - source="outside_table" → 모드 B
        - 그 외 (None 등) → 모드 A (기본값, 격자 있다는 가정이 안전)
        """
        if region_info.source == "outside_table":
            return "B"
        # "inside_table" 또는 None → 모드 A (기본)
        return "A"
    
    def _call_group(
        self,
        b64: str,
        system_prompt: str,
        user_prompt: str,
        group_name: str,
    ) -> tuple[dict, dict]:
        """단일 그룹 호출. 실패해도 예외 던지지 않고 빈 결과 반환.
        
        TablePipeline._call_group과 동일한 로직.
        """
        try:
            parsed, meta = ollama_client.call_vision_model(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                image_base64=b64,
                model=self.model,
            )
            print(f"[GraphicPipeline] 그룹 {group_name} 응답 수신 "
                  f"({meta['elapsed_sec']:.1f}초, {meta['tokens_per_sec']:.1f} tok/s)")
            
            debug = {
                "success": True,
                "elapsed_sec": meta.get("elapsed_sec"),
                "tokens_per_sec": meta.get("tokens_per_sec"),
                "eval_count": meta.get("eval_count"),
                "model": meta.get("model"),
                "raw_response": meta.get("raw_response"),
            }
            return parsed, debug
        
        except Exception as e:
            print(f"[GraphicPipeline] 그룹 {group_name} 호출 실패: {type(e).__name__}: {e}")
            debug = {
                "success": False,
                "error": f"{type(e).__name__}: {e}",
            }
            return {}, debug
