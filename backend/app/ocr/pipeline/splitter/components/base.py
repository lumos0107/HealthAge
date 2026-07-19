"""
검출 컴포넌트 추상 인터페이스.

영역 분할을 두 가지 책임으로 분리:
  1. BaseStructuralDetector: 표, 체크박스 같은 명확한 기하 구조 검출
  2. BaseGraphicDetector: 막대그래프, 자, 게이지 같은 그래픽 영역 검출

각 컴포넌트는 독립적으로 교체 가능.

새 검출기 추가 시:
    class MyNewDetector(BaseStructuralDetector):
        def detect(self, image) -> list[RegionInfo]: ...
"""

from __future__ import annotations
from abc import ABC, abstractmethod

from PIL import Image

from app.ocr.pipeline.utils.schemas import RegionInfo


class BaseStructuralDetector(ABC):
    """표, 체크박스 등 기하학적 구조가 있는 영역을 검출."""
    
    @abstractmethod
    def detect(self, image: Image.Image) -> list[RegionInfo]:
        """이미지에서 표/체크박스 영역 검출.
        
        Returns:
            검출된 영역들의 RegionInfo 리스트.
            (RegionType.TABLE 또는 RegionType.CHECKBOX)
        """
        raise NotImplementedError
    
    @property
    def name(self) -> str:
        return self.__class__.__name__


class BaseGraphicDetector(ABC):
    """막대그래프, 자, 게이지 등 그래픽 영역을 검출.
    
    그래픽은 기하 구조가 없거나 양식별로 매우 달라 휴리스틱이 어려움.
    LLM 또는 전용 모델로 처리하는 경우가 많음.
    """
    
    @abstractmethod
    def detect(
        self,
        image: Image.Image,
        exclude_regions: list[RegionInfo] | None = None,
    ) -> list[RegionInfo]:
        """이미지에서 그래픽 영역 검출.
        
        Args:
            image: 분석할 이미지
            exclude_regions: 이미 다른 검출기가 잡은 영역들.
                             이 영역과 겹치는 부분은 제외함 (중복 방지).
        
        Returns:
            검출된 그래픽 영역들의 RegionInfo 리스트.
            (RegionType.GRAPHIC)
        """
        raise NotImplementedError
    
    @property
    def name(self) -> str:
        return self.__class__.__name__
