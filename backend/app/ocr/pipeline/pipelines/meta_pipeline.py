"""
메타데이터 파이프라인.

표가 아닌 텍스트 영역(헤더, 환자정보 표, 자연어 메타 등)에서 메타데이터만 추출.
단일 LLM 호출로 4개 필드 (exam_date, patient_rrn_prefix, patient_name, hospital) 추출.

용도: 표 영역에는 측정값이 메인이고 메타가 부수적이지만,
      메타 전용 영역(헤더 등)에는 측정값이 없고 메타만 있음.
      그래서 TablePipeline처럼 그룹 A/B로 나눠 호출할 필요 없이 단일 호출로 처리.
"""

from __future__ import annotations

from PIL import Image

from app.ocr.pipeline import config
from app.ocr.pipeline.pipelines.base import BasePipeline
from app.ocr.pipeline.pipelines.table_pipeline import (
    _normalize_exam_date,
    _parse_rrn_prefix,
    _normalize_name,
    _normalize_hospital,
)
from app.ocr.pipeline.utils import image_utils, ollama_client
from app.ocr.pipeline.utils.schemas import PipelineResult, RegionInfo, RegionType


# ============================================================
# 프롬프트 — 단일 호출로 메타 4필드 추출
# ============================================================

METADATA_SYSTEM_PROMPT = """당신은 한국 건강검진 결과지의 메타데이터 추출 OCR 전문가입니다.

이 이미지는 검진지의 메타데이터 영역(환자 정보, 검진일자, 병원명 등이 적힌 부분)입니다.
다음 4개 메타데이터만 추출하세요. 측정값(키/체중/혈압 등)은 무시하세요.

[추출 대상 4개 메타데이터]

▶ exam_date: 검진일자 (검사일/검진일/시행일/발급일)
- "YYYY-MM-DD" 형식으로 변환
- "2024-03-15", "2024년 3월 15일", "2024.03.15", "2024/3/15" → "2024-03-15"
- 명확하지 않으면 null
- 발급일과 검진일이 모두 있으면 검진일(검사일/시행일) 우선

▶ patient_rrn_prefix: 주민등록번호의 앞 7자리
- 라벨 예시: "주민등록번호", "주민번호", "RRN", "ID" 등
- 어떤 형식이든 앞 7자리만 가져옴 (구분자 -, 공백, 없음 모두 흡수)
- 뒷자리가 마스킹(*)되어 있어도 앞 7자리는 추출
  예: "940315-1******" → "940315-1"
  예: "940315 - 1234567" → "940315-1"
  예: "9403151234567" → "940315-1"
- 가능하면 "YYMMDD-N" 형식으로 출력 (구분자 포함)
- 보이지 않거나 6자리 미만이면 null
- 다른 숫자(전화번호, 환자번호, 검사번호 등)와 혼동 금지

▶ patient_name: 환자/수검자 이름
- 라벨 예시: "성명", "이름", "환자명", "수검자", "Name" 등
- 한글 이름 그대로 추출 (예: "홍길동")
- 마스킹된 경우(예: "홍*동") 마스킹된 그대로 추출
- 보이지 않으면 null
- 의사명, 검사기관명과 혼동 금지

▶ hospital: 검진을 시행한 의료기관명
- 라벨 예시: "검진기관", "의료기관명", "병원", "검진센터" 등
- 보통 검진지 상단 헤더 또는 하단 푸터에 표시됨
- 정식 명칭 그대로 추출 (예: "서울대학교병원 건강검진센터")
- 보이지 않으면 null

[중요 — 여러 환자 정보가 있는 경우]

같은 영역에 여러 환자 정보가 보이면 첫 번째 환자의 정보를 우선 사용.
양식 변형 예시(라벨 변형, 자연어 형식)는 모두 동일 환자로 간주하지 말고,
검진지 상단/주요 영역의 정보 우선.

[출력 JSON 스키마 — 이 구조 그대로]

{
  "meta": {
    "exam_date": null,
    "patient_rrn_prefix": null,
    "patient_name": null,
    "hospital": null
  }
}

명확하지 않은 필드는 null로 두세요. 추측 금지.
JSON 객체 하나만 출력. 설명, 마크다운 코드블록 절대 금지."""


METADATA_USER_PROMPT = """이 영역에서 4개 메타데이터를 추출하세요:
- exam_date (검진일자, YYYY-MM-DD)
- patient_rrn_prefix (주민번호 앞 7자리)
- patient_name (환자명)
- hospital (검진기관)

명확하지 않으면 각각 null. JSON 한 번에 응답."""


# ============================================================
# MetadataPipeline 본체
# ============================================================

class MetadataPipeline(BasePipeline):
    """메타데이터 영역 처리 파이프라인.
    
    단일 LLM 호출로 메타 4필드 추출. measurements/lifestyle 처리 안 함.
    """
    
    def __init__(
        self,
        model: str | None = None,
    ):
        # [step10] Ollama 모델명 fallback 제거.
        # backend 추상화에 따라 None이면 vision_backend의 default_model 사용 (Gemini/Ollama 자동 호환).
        self.model = model
    
    @property
    def supported_region_type(self) -> RegionType:
        return RegionType.METADATA
    
    def process(
        self,
        region_image: Image.Image,
        region_info: RegionInfo,
    ) -> PipelineResult:
        b64 = image_utils.image_to_base64(region_image, format="PNG")
        
        print(f"[MetadataPipeline] 영역 {region_info.bbox} 처리 시작 (1회 호출)")
        
        # ----------------------------------------
        # LLM 호출 (단일)
        # ----------------------------------------
        try:
            parsed, call_meta = ollama_client.call_vision_model(
                system_prompt=METADATA_SYSTEM_PROMPT,
                user_prompt=METADATA_USER_PROMPT,
                image_base64=b64,
                model=self.model,
            )
            print(f"[MetadataPipeline] 응답 수신 "
                  f"({call_meta['elapsed_sec']:.1f}초, {call_meta['tokens_per_sec']:.1f} tok/s)")
            
            debug = {
                "success": True,
                "elapsed_sec": call_meta.get("elapsed_sec"),
                "tokens_per_sec": call_meta.get("tokens_per_sec"),
                "eval_count": call_meta.get("eval_count"),
                "model": call_meta.get("model"),
                "raw_response": call_meta.get("raw_response"),
            }
        except Exception as e:
            print(f"[MetadataPipeline] 호출 실패: {type(e).__name__}: {e}")
            parsed = {}
            debug = {
                "success": False,
                "error": f"{type(e).__name__}: {e}",
            }
        
        # ----------------------------------------
        # 메타 추출 및 정규화
        # ----------------------------------------
        raw_meta = parsed.get("meta") or {}
        exam_date = _normalize_exam_date(raw_meta.get("exam_date"))
        patient_birth, patient_gender = _parse_rrn_prefix(
            raw_meta.get("patient_rrn_prefix")
        )
        patient_name = _normalize_name(raw_meta.get("patient_name"))
        hospital = _normalize_hospital(raw_meta.get("hospital"))
        
        # ----------------------------------------
        # 결과 통계
        # ----------------------------------------
        extracted_count = sum(
            1 for v in (exam_date, patient_birth, patient_name, hospital)
            if v is not None
        )
        print(f"[MetadataPipeline] 최종 추출: {extracted_count}/4 필드"
              + (f", exam_date={exam_date}" if exam_date else "")
              + (f", patient={patient_gender}/{patient_birth}" if patient_birth else "")
              + (f", name={patient_name}" if patient_name else "")
              + (f", hospital={hospital[:20]}..." if hospital else ""))
        
        # null도 키 유지 (결정 B)
        pipeline_meta = {
            "source_pipeline": self.name,
            "exam_date": exam_date,
            "patient_birth": patient_birth,
            "patient_gender": patient_gender,
            "patient_name": patient_name,
            "hospital": hospital,
            # ocr_confidence는 MetadataPipeline에서 산정하지 않음
            # (measurements/lifestyle 기준이므로 의미 없음)
        }
        
        return PipelineResult(
            measurements={},  # MetadataPipeline은 measurements 처리 안 함
            lifestyle={"smoking": None, "drinking": None},
            meta=pipeline_meta,
            debug={
                "region_bbox": list(region_info.bbox),
                "region_label": region_info.label,
                "region_source": region_info.source,
                "llm_call": debug,
            },
        )
