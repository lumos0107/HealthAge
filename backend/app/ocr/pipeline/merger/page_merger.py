"""
페이지별 PipelineResult를 하나로 병합하는 모듈.

병합 규칙:
  - non-null 값이 null을 채움
  - 두 페이지에서 같은 항목에 다른 값이 있으면 먼저 발견된 값 유지
  - 충돌은 디버그 로그에 기록

여러 페이지 결과를 합쳐서 환자 한 명의 완성된 JSON 생성.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MergeConflict:
    """병합 중 발견된 값 충돌 정보."""
    path: str                      # 예: "measurements.hb.value"
    chosen_value: Any              # 채택된 값 (먼저 발견)
    chosen_from: str               # 채택된 출처 (예: "page_1.png")
    rejected_value: Any            # 거부된 값
    rejected_from: str             # 거부된 출처
    
    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "chosen_value": self.chosen_value,
            "chosen_from": self.chosen_from,
            "rejected_value": self.rejected_value,
            "rejected_from": self.rejected_from,
        }


@dataclass
class PageResult:
    """단일 페이지의 처리 결과 (병합 입력)."""
    source_image: str                          # 페이지 파일명
    measurements: dict[str, dict[str, Any]] = field(default_factory=dict)
    lifestyle: dict[str, str | None] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)  # exam_date 등
    pipeline_debug: dict[str, Any] = field(default_factory=dict)
    # [step12] confidence
    measurements_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)
    lifestyle_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class MergedResult:
    """병합된 최종 결과."""
    source_images: list[str]                   # 모든 페이지 파일명
    measurements: dict[str, dict[str, Any]]
    lifestyle: dict[str, str | None]
    meta: dict[str, Any]                       # exam_date 등
    conflicts: list[MergeConflict]             # 발견된 충돌들
    per_page_debug: list[dict[str, Any]]       # 페이지별 디버그
    # [step12] confidence (병합 후)
    measurements_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)
    lifestyle_confidence: dict[str, dict[str, Any]] = field(default_factory=dict)
    
    def to_final_json(self) -> dict[str, Any]:
        """가이드 문서 v1.0 형식으로 변환.
        
        정책 (결정 B):
          - meta: 키 항상 유지 (null도 보존). 백엔드가 "검진지에 없음 vs OCR 실패"를 구분 가능.
          - measurements/lifestyle: null 키 제거 (기존 정책).
          - ocr_confidence: 페이지별 값이 아니라 통합 결과 기준으로 재계산.
            (페이지별 confidence는 per_page_debug에 그대로 보존됨)
        
        [step12] 추가:
          - extraction_rate: 기존 추출률 (변수별 confidence 추가 전의 의미). (m_count + l_count) / 18
          - ocr_confidence: 변수별 confidence의 평균 (휴리스틱+LLM 결합 후).
            confidence 평가 결과 없으면 extraction_rate와 동일.
          - measurements_confidence, lifestyle_confidence: 변수별 평가 결과 dict.
        """
        # meta는 모든 키 유지 (null 보존)
        meta_out = {
            "source_images": self.source_images,
            "page_count": len(self.source_images),
        }
        # source_pipeline은 OCR 내부 디버그용이라 최종 출력에서 제외
        # ocr_confidence는 페이지별 값이라 통합 후 재계산해야 하므로 일단 제외
        for k, v in self.meta.items():
            if k in ("source_pipeline", "ocr_confidence"):
                continue
            meta_out[k] = v  # null 포함
        
        # measurements/lifestyle만 null 제거
        cleaned_measurements = _prune_null(self.measurements) or {}
        cleaned_lifestyle = _prune_null(self.lifestyle) or {}
        
        # ----------------------------------------
        # 추출률 (extraction_rate) — 기존 ocr_confidence와 동일한 식
        # ----------------------------------------
        m_count = sum(
            1 for v in cleaned_measurements.values()
            if isinstance(v, dict) and
            (v.get("value") is not None or v.get("code") is not None)
        )
        l_count = sum(1 for v in cleaned_lifestyle.values() if v is not None)
        extraction_rate = round((m_count + l_count) / 18.0, 2)
        
        # ----------------------------------------
        # [step12] 새 ocr_confidence — 변수별 confidence 평균
        # ----------------------------------------
        # measurements_confidence/lifestyle_confidence에서 confidence 값만 모음
        # 추출 안 된 키는 평가 대상 아니므로 제외 (이미 confidence dict에 없을 것)
        all_confidences: list[float] = []
        for k, v in (self.measurements_confidence or {}).items():
            # 해당 키가 실제 추출된 경우만 (휴리스틱 부작용 방지)
            if k in cleaned_measurements and isinstance(v, dict):
                c = v.get("confidence")
                if isinstance(c, (int, float)):
                    all_confidences.append(float(c))
        for k, v in (self.lifestyle_confidence or {}).items():
            if k in cleaned_lifestyle and isinstance(v, dict):
                c = v.get("confidence")
                if isinstance(c, (int, float)):
                    all_confidences.append(float(c))
        
        if all_confidences:
            new_ocr_confidence = round(sum(all_confidences) / len(all_confidences), 2)
        else:
            # confidence 평가 결과 없음 (실패 등) → extraction_rate fallback
            new_ocr_confidence = extraction_rate
        
        meta_out["ocr_confidence"] = new_ocr_confidence
        meta_out["extraction_rate"] = extraction_rate
        
        # ----------------------------------------
        # 응답 dict 구성
        # ----------------------------------------
        out: dict[str, Any] = {
            "meta": meta_out,
            "measurements": cleaned_measurements,
            "lifestyle": cleaned_lifestyle,
        }
        
        # [step12] confidence dict — 추출된 키만 포함하도록 정제
        if self.measurements_confidence:
            out["measurements_confidence"] = {
                k: v for k, v in self.measurements_confidence.items()
                if k in cleaned_measurements
            }
        else:
            out["measurements_confidence"] = {}
        
        if self.lifestyle_confidence:
            out["lifestyle_confidence"] = {
                k: v for k, v in self.lifestyle_confidence.items()
                if k in cleaned_lifestyle
            }
        else:
            out["lifestyle_confidence"] = {}
        
        return out


def _is_meaningful(value: Any) -> bool:
    """값이 의미 있는지 (null/빈 값이 아닌지) 판별."""
    if value is None:
        return False
    if isinstance(value, dict):
        # measurement 객체는 value 또는 code가 있어야 의미 있음
        return value.get("value") is not None or value.get("code") is not None
    if isinstance(value, str):
        return value.strip() != ""
    return True


def _prune_null(obj: Any) -> Any:
    """재귀적으로 null/빈 객체 키 제거."""
    if obj is None:
        return None
    if isinstance(obj, list):
        return [_prune_null(v) for v in obj if v is not None] or None
    if not isinstance(obj, dict):
        return obj
    out = {}
    for k, v in obj.items():
        if v is None:
            continue
        cleaned = _prune_null(v)
        if cleaned is None:
            continue
        if isinstance(cleaned, dict) and not cleaned:
            continue
        out[k] = cleaned
    return out or None


class PageMerger:
    """여러 페이지의 PipelineResult를 하나로 병합.
    
    병합 정책: 먼저 발견된 값 우선 (팀 결정 4-가).
    """
    
    def merge(self, pages: list[PageResult]) -> MergedResult:
        """페이지 리스트 → 병합된 최종 결과."""
        if not pages:
            raise ValueError("병합할 페이지가 없습니다.")
        
        merged_measurements: dict[str, dict[str, Any]] = {}
        merged_lifestyle: dict[str, str | None] = {}
        merged_meta: dict[str, Any] = {}
        # [step12] confidence 병합
        merged_measurements_conf: dict[str, dict[str, Any]] = {}
        merged_lifestyle_conf: dict[str, dict[str, Any]] = {}
        # 항목별 출처 추적 (충돌 감지용)
        measurement_sources: dict[str, str] = {}
        lifestyle_sources: dict[str, str] = {}
        meta_sources: dict[str, str] = {}
        conflicts: list[MergeConflict] = []
        per_page_debug: list[dict[str, Any]] = []
        
        for page in pages:
            # measurements 병합
            for key, val in page.measurements.items():
                if not _is_meaningful(val):
                    continue
                
                if key not in merged_measurements:
                    # 처음 등장 → 채택
                    merged_measurements[key] = val
                    measurement_sources[key] = page.source_image
                    # [step12] 같은 페이지의 confidence도 같이 채택
                    if key in (page.measurements_confidence or {}):
                        merged_measurements_conf[key] = page.measurements_confidence[key]
                else:
                    # 이미 존재 → 충돌 확인
                    existing = merged_measurements[key]
                    if self._values_differ(existing, val):
                        conflicts.append(MergeConflict(
                            path=f"measurements.{key}",
                            chosen_value=existing,
                            chosen_from=measurement_sources[key],
                            rejected_value=val,
                            rejected_from=page.source_image,
                        ))
                    # 정책: 먼저 발견 우선 → 그대로 유지 (confidence도 그대로)
            
            # lifestyle 병합
            for key, val in page.lifestyle.items():
                if val is None:
                    continue
                
                if key not in merged_lifestyle or merged_lifestyle[key] is None:
                    merged_lifestyle[key] = val
                    lifestyle_sources[key] = page.source_image
                    # [step12] confidence 같이 채택
                    if key in (page.lifestyle_confidence or {}):
                        merged_lifestyle_conf[key] = page.lifestyle_confidence[key]
                else:
                    existing = merged_lifestyle[key]
                    if existing != val:
                        conflicts.append(MergeConflict(
                            path=f"lifestyle.{key}",
                            chosen_value=existing,
                            chosen_from=lifestyle_sources[key],
                            rejected_value=val,
                            rejected_from=page.source_image,
                        ))
            
            # meta 병합 (결정 B: null도 키 유지하되 의미 있는 값이 오면 덮어씀)
            # ocr_confidence는 페이지별로 다른 게 정상이라 충돌 처리하지 않음
            #   (최종 ocr_confidence는 to_final_json에서 통합 결과 기준으로 재계산)
            for key, val in page.meta.items():
                if key not in merged_meta:
                    # 처음 보는 키 — null이든 아니든 일단 저장
                    merged_meta[key] = val
                    meta_sources[key] = page.source_image
                else:
                    existing = merged_meta[key]
                    if existing is None and val is not None:
                        # 기존이 null인데 의미 있는 값이 옴 → 덮어씀
                        merged_meta[key] = val
                        meta_sources[key] = page.source_image
                    elif existing is not None and val is not None and existing != val:
                        # ocr_confidence는 페이지별 값이라 충돌이 아닌 정상 동작
                        if key == "ocr_confidence":
                            continue
                        # 둘 다 의미 있는 값인데 다름 → 충돌 (먼저 발견 우선)
                        conflicts.append(MergeConflict(
                            path=f"meta.{key}",
                            chosen_value=existing,
                            chosen_from=meta_sources[key],
                            rejected_value=val,
                            rejected_from=page.source_image,
                        ))
                    # 그 외 (기존 valid + val=None, 또는 둘 다 None, 또는 둘 다 같음): 변경 없음
            
            # 페이지별 디버그
            per_page_debug.append({
                "source_image": page.source_image,
                "extracted_measurements_count": sum(
                    1 for v in page.measurements.values() if _is_meaningful(v)
                ),
                "extracted_lifestyle_count": sum(
                    1 for v in page.lifestyle.values() if v is not None
                ),
                "page_meta": page.meta,
                "pipeline_debug": page.pipeline_debug,
            })
        
        return MergedResult(
            source_images=[p.source_image for p in pages],
            measurements=merged_measurements,
            lifestyle=merged_lifestyle,
            meta=merged_meta,
            conflicts=conflicts,
            per_page_debug=per_page_debug,
            # [step12] confidence
            measurements_confidence=merged_measurements_conf,
            lifestyle_confidence=merged_lifestyle_conf,
        )
    
    @staticmethod
    def _values_differ(existing: dict, new: dict) -> bool:
        """두 measurement 객체가 의미 있게 다른지 비교."""
        # value 비교 (숫자는 약간의 오차 허용)
        ev = existing.get("value")
        nv = new.get("value")
        if ev != nv:
            # 둘 다 숫자면 작은 오차 허용 (예: 15.9 vs 15.90)
            if isinstance(ev, (int, float)) and isinstance(nv, (int, float)):
                if abs(ev - nv) > 0.01:
                    return True
            else:
                return True
        
        # code 비교 (요단백)
        ec = existing.get("code")
        nc = new.get("code")
        if ec != nc and not (ec is None or nc is None):
            return True
        
        return False
