"""
약봉투 멀티 페이지 병합기.

시나리오 가정:
  각 이미지 = 독립된 약봉투 (다른 날짜의 시계열 히스토리)
  → medications는 모든 페이지에서 누적
  → meta는 첫 페이지 또는 최고 confidence 페이지 기준
  → medication_count_declared는 합산 (각 페이지의 declared 합)

이건 영양제 추천 목적의 가장 흔한 시나리오 ((A) 시나리오 — 합의 내용).
드물게 (B) 시나리오 (한 조제의 멀티 페이지)는 일단 미지원.
"""

from __future__ import annotations

from app.ocr.pipeline.utils.schemas_med_label import (
    MedLabelFinalResult,
    MedLabelMeta,
    MedLabelPageResult,
)


class MedLabelMerger:
    """약봉투 페이지 결과 병합 → 최종 dict."""

    def merge(self, page_results: list[MedLabelPageResult]) -> MedLabelFinalResult:
        if not page_results:
            return MedLabelFinalResult(
                source_images=[],
                page_count=0,
                meta=MedLabelMeta(),
                medications=[],
                medication_count_declared=None,
                ocr_confidence=0.0,
            )

        # source_images
        source_images = [p.page_name for p in page_results]

        # medications: 모든 페이지 누적
        all_medications = []
        for p in page_results:
            all_medications.extend(p.medications)

        # meta: 최고 confidence 페이지 것 사용
        # (각 페이지가 독립 약봉투면 meta가 페이지마다 다를 수 있는데, 일단 대표값으로)
        best_page = max(page_results, key=lambda p: p.ocr_confidence)
        meta = best_page.meta

        # medication_count_declared: 합산 (None은 0으로 취급)
        declared_sum = 0
        any_declared = False
        for p in page_results:
            if p.medication_count_declared is not None:
                declared_sum += p.medication_count_declared
                any_declared = True
        med_count_declared = declared_sum if any_declared else None

        # ocr_confidence: 페이지별 가중평균 (약품 개수 가중)
        # 약품 0개 페이지가 confidence 낮춤 — 약품 많이 잡은 페이지에 가중
        total_weight = 0
        weighted_sum = 0.0
        for p in page_results:
            weight = max(len(p.medications), 1)  # 최소 1
            weighted_sum += p.ocr_confidence * weight
            total_weight += weight
        confidence = weighted_sum / total_weight if total_weight > 0 else 0.0

        return MedLabelFinalResult(
            source_images=source_images,
            page_count=len(page_results),
            meta=meta,
            medications=all_medications,
            medication_count_declared=med_count_declared,
            ocr_confidence=confidence,
        )
