"""Pipelines 패키지.

영역 타입별 파이프라인 구현체.
새 파이프라인 추가 시:
  1. pipelines/my_pipeline.py 작성 (BasePipeline 상속)
  2. get_pipeline_for_region() 함수에 분기 추가
"""

from __future__ import annotations

from app.ocr.pipeline.pipelines.base import BasePipeline
from app.ocr.pipeline.utils.schemas import RegionType


def get_pipeline_for_region(region_type: RegionType) -> BasePipeline | None:
    """영역 타입에 맞는 파이프라인 인스턴스 반환.
    
    해당 타입을 처리할 파이프라인이 없으면 None.
    """
    if region_type == RegionType.TABLE:
        from pipelines.table_pipeline import TablePipeline
        return TablePipeline()
    elif region_type == RegionType.GRAPHIC:
        from pipelines.graphic_pipeline import GraphicPipeline
        return GraphicPipeline()
    elif region_type == RegionType.METADATA:
        from pipelines.meta_pipeline import MetadataPipeline
        return MetadataPipeline()
    elif region_type == RegionType.CHECKBOX:
        # 체크박스는 별도 파이프라인 없이 각 영역 파이프라인이 통합 처리
        return None
    else:
        return None


__all__ = ["BasePipeline", "get_pipeline_for_region"]
