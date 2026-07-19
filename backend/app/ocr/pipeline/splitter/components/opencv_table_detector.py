"""
OpenCV 기반 표 검출기 (단순화 버전).

이 검출기는 다음 두 종류의 영역을 반환:
  1. 표 영역: 격자 선이 검출된 영역
  2. 그래픽 후보 영역: 표가 아닌 큰 비여백 영역 (옵션)

체크박스는 별도 검출하지 않음. 각 파이프라인이 영역 내 체크박스를 통합 처리.

알고리즘:
  표 검출:
    1. 이진화 (Otsu) - 표 선을 흰색으로
    2. 가로선/세로선 morphological opening
    3. 두 mask의 합집합 → 표 격자 mask
    4. 연결 컴포넌트 → 표 영역 후보
    5. 최소 크기 필터링 + 사방 패딩
    6. 포함 관계 정리 (작은 영역이 큰 영역에 포함되면 제거)

  그래픽 후보 (옵션):
    1. 원본 이미지에서 표 영역 마스킹
    2. 남은 영역 중 일정 크기 이상의 콘텐츠 영역 추출
    3. 그래픽 후보로 분류 (정확도 보장 안 함)
"""

from __future__ import annotations
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.ocr.pipeline.splitter.components.base import BaseStructuralDetector
from app.ocr.pipeline.utils.schemas import RegionInfo, RegionType


# ----------------------------------------
# 검출 파라미터
# ----------------------------------------

@dataclass
class TableDetectionParams:
    """표 검출 파라미터."""
    # 가로/세로선 검출용 커널 크기 (이미지 가로/세로 길이 대비 비율)
    horizontal_kernel_ratio: float = 1 / 30
    vertical_kernel_ratio: float = 1 / 30
    
    # 이진화
    use_otsu: bool = True
    binary_threshold: int = 200
    
    # 표 영역 최소 크기 (이미지 면적 대비 비율)
    min_table_area_ratio: float = 0.02
    
    # 사방 패딩 (양식의 항목명, 단위 등 잘리지 않게)
    padding_top: int = 10
    padding_bottom: int = 10
    padding_left: int = 30      # 항목명이 표 왼쪽에 있는 경우가 많아 큰 패딩
    padding_right: int = 30     # 단위, 판정이 오른쪽에 있는 경우
    
    # 잘림 감지: crop 경계 N픽셀 내에 텍스트 픽셀이 있으면 경고
    truncation_check_margin: int = 3
    truncation_density_threshold: float = 0.05  # 경계 픽셀 중 5% 이상이 텍스트면 경고


@dataclass
class GraphicCandidateParams:
    """그래픽 후보 영역 검출 파라미터."""
    # 그래픽 후보로 인정할 최소 크기 (이미지 면적 대비 비율)
    min_area_ratio: float = 0.03
    
    # 표가 아닌 영역 중 콘텐츠 밀도(텍스트/도형 픽셀 비율)가 이 값 이상이어야 함
    min_content_density: float = 0.05
    
    # 사방 패딩
    padding_px: int = 15


# ----------------------------------------
# 검출기
# ----------------------------------------

class OpenCVTableDetector(BaseStructuralDetector):
    """OpenCV로 표 영역을 검출. 옵션으로 그래픽 후보 영역도 추출."""
    
    def __init__(
        self,
        table_params: TableDetectionParams | None = None,
        graphic_params: GraphicCandidateParams | None = None,
        detect_graphic_candidates: bool = False,
    ):
        """
        Args:
            table_params: 표 검출 파라미터
            graphic_params: 그래픽 후보 검출 파라미터
            detect_graphic_candidates: True면 표가 아닌 영역을 graphic으로 표시.
                                       향후 그래픽 파이프라인 추가 시 활성화 예정.
        """
        self.table_params = table_params or TableDetectionParams()
        self.graphic_params = graphic_params or GraphicCandidateParams()
        self.detect_graphic_candidates = detect_graphic_candidates
    
    def detect(self, image: Image.Image) -> list[RegionInfo]:
        img_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # 이진화 (표 선과 텍스트를 흰색으로)
        binary = self._binarize(gray)
        
        # 1) 표 검출
        table_regions, table_mask = self._detect_tables(binary, image, gray)
        print(f"[OpenCVTableDetector] 표 검출: {len(table_regions)}개")
        
        # 2) 잘림 감지
        for i, region in enumerate(table_regions):
            self._check_truncation(region, gray, index=i)
        
        regions = list(table_regions)
        
        # 3) 그래픽 후보 (옵션)
        if self.detect_graphic_candidates:
            graphic_regions = self._detect_graphic_candidates(
                binary, image, table_mask,
            )
            print(f"[OpenCVTableDetector] 그래픽 후보: {len(graphic_regions)}개")
            regions.extend(graphic_regions)
        
        return regions
    
    # ------------------------------------
    # 이진화
    # ------------------------------------
    
    def _binarize(self, gray: np.ndarray) -> np.ndarray:
        p = self.table_params
        if p.use_otsu:
            _, binary = cv2.threshold(
                gray, 0, 255,
                cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU,
            )
        else:
            _, binary = cv2.threshold(
                gray, p.binary_threshold, 255,
                cv2.THRESH_BINARY_INV,
            )
        return binary
    
    # ------------------------------------
    # 표 검출
    # ------------------------------------
    
    def _detect_tables(
        self,
        binary: np.ndarray,
        image: Image.Image,
        gray: np.ndarray,
    ) -> tuple[list[RegionInfo], np.ndarray]:
        """표 영역 검출. (영역 리스트, 표 마스크) 반환."""
        img_w, img_h = image.size
        p = self.table_params
        
        # 가로선
        h_kernel_len = max(20, int(img_w * p.horizontal_kernel_ratio))
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_kernel_len, 1))
        h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel, iterations=2)
        
        # 세로선
        v_kernel_len = max(20, int(img_h * p.vertical_kernel_ratio))
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_kernel_len))
        v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel, iterations=2)
        
        # 표 격자
        table_mask = cv2.bitwise_or(h_lines, v_lines)
        
        # 끊긴 선 잇기
        dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        table_mask = cv2.dilate(table_mask, dilate_kernel, iterations=1)
        
        # 연결 컴포넌트
        contours, _ = cv2.findContours(
            table_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
        )
        
        # 최소 크기 필터 + 사방 패딩
        min_area = img_w * img_h * p.min_table_area_ratio
        regions: list[RegionInfo] = []
        
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w * h < min_area:
                continue
            
            # 사방 패딩 (각각 다르게)
            x1 = max(0, x - p.padding_left)
            y1 = max(0, y - p.padding_top)
            x2 = min(img_w, x + w + p.padding_right)
            y2 = min(img_h, y + h + p.padding_bottom)
            
            regions.append(RegionInfo(
                region_type=RegionType.TABLE,
                bbox=(x1, y1, x2, y2),
                confidence=1.0,
                label="표 (격자 검출)",
            ))
        
        # 포함 관계 정리
        regions = self._remove_contained(regions)
        
        return regions, table_mask
    
    # ------------------------------------
    # 그래픽 후보 검출 (표가 아닌 영역)
    # ------------------------------------
    
    def _detect_graphic_candidates(
        self,
        binary: np.ndarray,
        image: Image.Image,
        table_mask: np.ndarray,
    ) -> list[RegionInfo]:
        """표가 아닌 영역 중 콘텐츠가 있는 부분을 그래픽 후보로 표시.
        
        주의: 정확도가 보장되지 않음. 향후 그래픽 파이프라인이 자체 검증해야 함.
        """
        img_w, img_h = image.size
        p = self.graphic_params
        
        # 1) 표 영역을 마스킹 (표 영역은 그래픽이 아님)
        # 표 격자를 dilate해서 표 셀 내부도 마스킹
        table_dilated = cv2.dilate(
            table_mask,
            cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)),
            iterations=3,
        )
        non_table = cv2.bitwise_and(binary, cv2.bitwise_not(table_dilated))
        
        # 2) 콘텐츠 영역만 남기기 (텍스트/도형 픽셀)
        # 작은 노이즈 제거를 위한 morphological opening
        clean = cv2.morphologyEx(
            non_table, cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10)),
            iterations=2,
        )
        
        # 3) 연결 컴포넌트
        contours, _ = cv2.findContours(
            clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
        )
        
        min_area = img_w * img_h * p.min_area_ratio
        regions: list[RegionInfo] = []
        
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w * h < min_area:
                continue
            
            # 콘텐츠 밀도 확인 (영역 안의 비여백 픽셀 비율)
            roi = binary[y:y + h, x:x + w]
            if roi.size == 0:
                continue
            density = float(np.sum(roi > 0)) / roi.size
            if density < p.min_content_density:
                continue
            
            x1 = max(0, x - p.padding_px)
            y1 = max(0, y - p.padding_px)
            x2 = min(img_w, x + w + p.padding_px)
            y2 = min(img_h, y + h + p.padding_px)
            
            regions.append(RegionInfo(
                region_type=RegionType.GRAPHIC,
                bbox=(x1, y1, x2, y2),
                confidence=0.5,  # 후보일 뿐 정확도 낮음
                label="그래픽 후보 (검증 필요)",
            ))
        
        return regions
    
    # ------------------------------------
    # 잘림 감지
    # ------------------------------------
    
    def _check_truncation(
        self,
        region: RegionInfo,
        gray: np.ndarray,
        index: int,
    ) -> None:
        """crop 가장자리에 텍스트가 있는지 확인. 있으면 경고만 출력."""
        p = self.table_params
        x1, y1, x2, y2 = region.bbox
        margin = p.truncation_check_margin
        
        # 4개 경계 영역
        edges = {
            "top":    gray[y1:y1 + margin, x1:x2],
            "bottom": gray[max(y1, y2 - margin):y2, x1:x2],
            "left":   gray[y1:y2, x1:x1 + margin],
            "right":  gray[y1:y2, max(x1, x2 - margin):x2],
        }
        
        truncated_sides = []
        for side, edge in edges.items():
            if edge.size == 0:
                continue
            # 텍스트는 어두운 픽셀 (gray < 128)
            dark_ratio = float(np.sum(edge < 128)) / edge.size
            if dark_ratio > p.truncation_density_threshold:
                truncated_sides.append(f"{side}({dark_ratio:.0%})")
        
        if truncated_sides:
            print(f"[OpenCVTableDetector] 영역 #{index} 잘림 가능성: "
                  f"{', '.join(truncated_sides)}")
    
    # ------------------------------------
    # 포함 관계 정리
    # ------------------------------------
    
    def _remove_contained(self, regions: list[RegionInfo]) -> list[RegionInfo]:
        """다른 영역에 완전히 포함된 작은 영역을 제거."""
        if len(regions) <= 1:
            return regions
        
        keep = [True] * len(regions)
        for i, r1 in enumerate(regions):
            if not keep[i]:
                continue
            for j, r2 in enumerate(regions):
                if i == j or not keep[j]:
                    continue
                if self._contains(r2.bbox, r1.bbox):
                    keep[i] = False
                    break
        
        return [r for r, k in zip(regions, keep) if k]
    
    @staticmethod
    def _contains(
        outer: tuple[int, int, int, int],
        inner: tuple[int, int, int, int],
    ) -> bool:
        return (outer[0] <= inner[0] and outer[1] <= inner[1] and
                outer[2] >= inner[2] and outer[3] >= inner[3])
