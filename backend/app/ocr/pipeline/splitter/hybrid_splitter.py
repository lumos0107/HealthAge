"""
하이브리드 Splitter.

구조 검출기(표/체크박스)와 그래픽 검출기를 조합해 영역 분할.
각 검출기는 독립적으로 교체 가능.

설정 조합 예:
  - OpenCV 구조 + None 그래픽: 표 양식만 빠르게 처리
  - OpenCV 구조 + LLM 그래픽: 표/체크박스는 정확히, 그래픽은 시도
  - LLM 구조 + LLM 그래픽: 통째 LLM (현재 LLMSplitter와 유사, 폴백)
"""

from __future__ import annotations
import json
from pathlib import Path

from PIL import Image

from app.ocr.pipeline import config
from app.ocr.pipeline.splitter.base import BaseSplitter
from app.ocr.pipeline.splitter.components.base import BaseStructuralDetector, BaseGraphicDetector
from app.ocr.pipeline.utils import image_utils
from app.ocr.pipeline.utils.schemas import RegionInfo, SplitResult


class HybridSplitter(BaseSplitter):
    """구조 검출기와 그래픽 검출기를 조합한 splitter."""
    
    def __init__(
        self,
        structural_detector: BaseStructuralDetector | None = None,
        graphic_detector: BaseGraphicDetector | None = None,
        debug_dir: Path | None = None,
        save_debug_images: bool = True,
    ):
        """
        Args:
            structural_detector: 표/체크박스 검출기 (None이면 검출 안 함)
            graphic_detector: 그래픽 검출기 (None이면 검출 안 함)
            debug_dir: 디버깅 이미지 저장 폴더
            save_debug_images: 디버깅 이미지 저장 여부
        """
        if structural_detector is None and graphic_detector is None:
            raise ValueError(
                "structural_detector와 graphic_detector 모두 None일 수 없음. "
                "최소 하나는 활성화해야 함."
            )
        
        self.structural = structural_detector
        self.graphic = graphic_detector
        self.debug_dir = debug_dir or config.DEBUG_DIR
        self.save_debug_images = save_debug_images
    
    def split(self, image_path: "str | Path | Image.Image") -> SplitResult:
        # 1) 이미지 로드 (PIL Image면 그대로, path면 load)
        if isinstance(image_path, Image.Image):
            image = image_path
        else:
            image = image_utils.load_image(image_path)
        img_w, img_h = image.size
        
        # 2) 구조 영역 검출 (표/체크박스)
        structural_regions: list[RegionInfo] = []
        if self.structural is not None:
            print(f"[HybridSplitter] 구조 검출: {self.structural.name}")
            structural_regions = self.structural.detect(image)
        
        # 3) 그래픽 영역 검출 (이미 잡힌 영역 제외)
        graphic_regions: list[RegionInfo] = []
        if self.graphic is not None:
            print(f"[HybridSplitter] 그래픽 검출: {self.graphic.name}")
            graphic_regions = self.graphic.detect(
                image,
                exclude_regions=structural_regions,
            )
        
        # 4) 좌표 검증 (각 영역이 이미지 범위 내에 있는지)
        all_regions = structural_regions + graphic_regions
        validated_regions = self._validate_regions(all_regions, img_w, img_h)
        
        result = SplitResult(
            regions=validated_regions,
            image_width=img_w,
            image_height=img_h,
        )
        
        # 5) 디버깅 이미지 저장
        if self.save_debug_images:
            self._save_debug_images(image, result)
        
        print(f"[HybridSplitter] 최종: 총 {len(validated_regions)}개 영역 "
              f"(표/체크박스 {len(structural_regions)}, "
              f"그래픽 {len(graphic_regions)})")
        
        return result
    
    def _validate_regions(
        self,
        regions: list[RegionInfo],
        img_w: int,
        img_h: int,
    ) -> list[RegionInfo]:
        """각 영역의 좌표를 검증하고 경고 출력."""
        validated: list[RegionInfo] = []
        for i, region in enumerate(regions):
            try:
                warnings = image_utils.validate_bbox(
                    region.bbox, img_w, img_h,
                    min_ratio=config.MIN_REGION_RATIO,
                    max_ratio=config.MAX_REGION_RATIO,
                )
                for w in warnings:
                    print(f"[HybridSplitter] 영역 #{i} ({region.region_type.value}) 경고: {w}")
                validated.append(region)
            except image_utils.CoordinateValidationError as e:
                print(f"[HybridSplitter] 영역 #{i} 검증 실패 (제외): {e}")
        return validated
    
    def _save_debug_images(
        self,
        image: Image.Image,
        split_result: SplitResult,
    ) -> None:
        """디버깅용 이미지 저장."""
        # 1) 분할 시각화
        vis_path = self.debug_dir / "split_visualization.png"
        image_utils.draw_split_visualization(image, split_result, vis_path)
        print(f"[HybridSplitter] 분할 시각화 저장: {vis_path}")
        
        # 2) 영역별 crop
        crop_dir = self.debug_dir / "regions"
        if crop_dir.exists():
            for f in crop_dir.glob("region_*.png"):
                f.unlink()
        paths = image_utils.save_cropped_regions(
            image, split_result, crop_dir, prefix="region",
        )
        print(f"[HybridSplitter] 영역 crop 저장: {len(paths)}개 → {crop_dir}")
        
        # 3) 분할 결과 JSON
        result_path = self.debug_dir / "splitter_result.json"
        result_path.write_text(
            json.dumps(split_result.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
