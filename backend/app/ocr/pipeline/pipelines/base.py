"""
Pipeline 추상 클래스.

각 영역 타입(표/체크박스/그래픽)을 처리하는 파이프라인의 공통 인터페이스.
구현체가 교체되어도 main.py는 동일하게 동작.

새 파이프라인 추가 시:
    class MyNewPipeline(BasePipeline):
        def process(self, image, region) -> PipelineResult: ...
"""

from __future__ import annotations
from abc import ABC, abstractmethod

from PIL import Image

from app.ocr.pipeline.utils.schemas import PipelineResult, RegionInfo, RegionType


class BasePipeline(ABC):
    """crop된 영역 이미지를 받아 정보를 추출하는 추상 인터페이스."""
    
    @property
    @abstractmethod
    def supported_region_type(self) -> RegionType:
        """이 파이프라인이 처리할 영역 타입."""
        raise NotImplementedError
    
    @abstractmethod
    def process(
        self,
        region_image: Image.Image,
        region_info: RegionInfo,
    ) -> PipelineResult:
        """crop된 영역 이미지에서 정보 추출.
        
        Args:
            region_image: splitter가 잘라준 영역 이미지 (PIL Image)
            region_info: 해당 영역의 메타정보 (원본에서의 좌표 등)
        
        Returns:
            PipelineResult: 추출된 measurements/lifestyle/meta/debug
        """
        raise NotImplementedError
    
    @property
    def name(self) -> str:
        """구현체 식별자 (디버깅 로그용)."""
        return self.__class__.__name__
