"""Splitter 패키지.

config.SPLITTER_TYPE에 따라 적절한 splitter를 자동 구성.

새 구현체/컴포넌트 추가 시:
  1. 새 파일 작성 (BaseSplitter, BaseStructuralDetector, BaseGraphicDetector 상속)
  2. 아래 _get_*_detector() 또는 get_splitter()에 분기 추가
  3. config.py의 *_TYPE 값에 새 옵션 등록
"""

from __future__ import annotations

from app.ocr.pipeline import config
from app.ocr.pipeline.splitter.base import BaseSplitter
from app.ocr.pipeline.splitter.components.base import BaseStructuralDetector, BaseGraphicDetector


def _get_structural_detector(
    detector_type: str,
) -> BaseStructuralDetector | None:
    """구조 검출기(표/체크박스) 인스턴스 생성."""
    if detector_type == "none":
        return None
    elif detector_type == "opencv":
        from splitter.components.opencv_table_detector import OpenCVTableDetector
        return OpenCVTableDetector()
    # 향후 추가:
    # elif detector_type == "llm":
    #     from splitter.components.llm_structural_detector import LLMStructuralDetector
    #     return LLMStructuralDetector()
    else:
        raise ValueError(f"알 수 없는 structural_detector 타입: '{detector_type}'")


def _get_graphic_detector(
    detector_type: str,
) -> BaseGraphicDetector | None:
    """그래픽 검출기 인스턴스 생성."""
    if detector_type == "none":
        return None
    elif detector_type == "llm":
        from splitter.components.llm_graphic_classifier import LLMGraphicClassifier
        return LLMGraphicClassifier()
    # 향후 추가:
    # elif detector_type == "yolo":
    #     ...
    else:
        raise ValueError(f"알 수 없는 graphic_detector 타입: '{detector_type}'")


def get_splitter(splitter_type: str | None = None) -> BaseSplitter:
    """설정에 따라 적절한 splitter 인스턴스 반환."""
    stype = splitter_type or config.SPLITTER_TYPE
    
    if stype == "hybrid":
        # 하이브리드: 구조 검출기 + 그래픽 검출기 조합
        from splitter.hybrid_splitter import HybridSplitter
        structural = _get_structural_detector(config.STRUCTURAL_DETECTOR_TYPE)
        graphic = _get_graphic_detector(config.GRAPHIC_DETECTOR_TYPE)
        return HybridSplitter(
            structural_detector=structural,
            graphic_detector=graphic,
        )
    elif stype == "llm":
        # 기존 LLM 통째 분할 (폴백/비교용)
        from splitter.llm_splitter import LLMSplitter
        return LLMSplitter()
    else:
        raise ValueError(f"알 수 없는 splitter 타입: '{stype}'")


__all__ = ["BaseSplitter", "get_splitter"]
