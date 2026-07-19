"""
Splitter 추상 클래스.

모든 splitter 구현체(LLM, OpenCV 등)는 이 인터페이스를 따라야 한다.
이를 통해 main.py는 splitter 종류에 무관하게 동작할 수 있다.

새 splitter 추가 시:
    class MyNewSplitter(BaseSplitter):
        def split(self, image_path) -> SplitResult: ...
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from pathlib import Path
from typing import TYPE_CHECKING

from app.ocr.pipeline.utils.schemas import SplitResult

if TYPE_CHECKING:
    from PIL import Image as PILImage


class BaseSplitter(ABC):
    """이미지를 영역(표/체크박스/그래픽)으로 분할하는 추상 인터페이스."""
    
    @abstractmethod
    def split(self, image_path: "str | Path | PILImage.Image") -> SplitResult:
        """이미지에서 영역들을 검출하여 SplitResult로 반환.
        
        Args:
            image_path: 분석할 이미지. 다음 중 하나:
                - str | Path: 파일 경로
                - PIL.Image.Image: 이미 로드된 이미지 객체 (백엔드 통합용)
        
        Returns:
            SplitResult: 검출된 모든 영역 정보 (좌표, 타입, 신뢰도)
        
        Raises:
            FileNotFoundError: 이미지 파일이 없음 (path 입력 시)
            ValueError: 지원하지 않는 형식
            VisionBackendError: LLM 호출 실패 (LLM 기반 splitter의 경우)
        """
        raise NotImplementedError
    
    @property
    def name(self) -> str:
        """구현체 식별자 (디버깅 로그용)."""
        return self.__class__.__name__
