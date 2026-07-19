"""
LLM 기반 그래픽 분류 검출기.

두 가지 일을 수행:
  1. 기존 표 영역들에 대해: 각각 "그래픽 포함?" 분류
     → 결과는 RegionInfo.source = "inside_table"로 in-place 마킹
        (그래픽 포함 표는 GRAPHIC으로 region_type도 변경)
  2. 표 외 영역에 대해: 사전 픽셀 필터링 후 "그래픽 있음?" 분류
     → 그래픽이면 새 RegionInfo(GRAPHIC, source="outside_table") 반환

검출은 LLM에 의존:
  - 양식 다양성에 대응 (막대그래프/선그래프/자/게이지/마커 등)
  - OpenCV 휴리스틱은 임계값 튜닝 필요해서 양식 의존적
"""

from __future__ import annotations
import json

import numpy as np
from PIL import Image

from app.ocr.pipeline import config
from app.ocr.pipeline.splitter.components.base import BaseGraphicDetector
from app.ocr.pipeline.utils import image_utils, ollama_client
from app.ocr.pipeline.utils.schemas import RegionInfo, RegionType


# ----------------------------------------
# 표 영역 분류 프롬프트
# ----------------------------------------

INSIDE_TABLE_SYSTEM_PROMPT = """당신은 건강검진 결과지의 표 영역을 분류하는 분류기입니다.
주어진 이미지가 표 영역의 crop이며, 이 안에 그래픽 요소(막대그래프, 선그래프, 자/눈금, 게이지, 마커 등)가
포함되어 있는지 판단하세요.

판단 기준:
- 표 행 안에 가로 막대그래프(정상/경계/질환의심 구간 표시)가 있으면 그래픽 포함
- 그래프 위에 마커(▼, ●, 빨간 박스 등)로 측정값 위치 표시되어 있으면 그래픽 포함
- 단순 텍스트와 숫자만 있고 시각화 요소 없으면 그래픽 없음

응답은 JSON 한 줄만: {"has_graphic": true} 또는 {"has_graphic": false}
설명, 마크다운, 다른 문구 금지."""

INSIDE_TABLE_USER_PROMPT = """이 표 영역에 그래픽 요소(막대그래프/선그래프/자/게이지/마커 등)가 있는가?
{"has_graphic": true/false} 한 줄만 응답."""


# ----------------------------------------
# 표 외 영역 분류 프롬프트 (3분류)
# ----------------------------------------

OUTSIDE_TABLE_SYSTEM_PROMPT = """당신은 건강검진 결과지의 단독 영역(표가 아닌)을 분류하는 분류기입니다.
주어진 이미지가 격자가 없는 영역의 crop이며, 이 안에 무엇이 있는지 다음 3가지 중 하나로 분류하세요.

[분류 카테고리]

1. "graphic" — 그래프/차트/시각화가 있는 영역
   예: 단독 막대그래프, 시계열 추이 그래프, 게이지, 다이어그램
   특징: 막대/선/마커/축 같은 시각적 요소가 핵심
   
2. "metadata" — 환자/검진 정보가 있는 텍스트 영역
   예: 환자 성명, 주민등록번호, 생년월일, 검진일자, 병원명/검진기관, 의사명
   라벨 예시: "성명", "주민번호", "검사일자", "발급일", "검진기관", "병원명"
   특징: 격자 없이 라벨과 값이 텍스트로 나열됨 (한 줄씩, 또는 자연어 형식)
   
3. "empty" — 위 둘 다 아닌 경우
   예: 안내문, 페이지 번호, 로고, 빈 여백, 의학 소견 텍스트, 종합 의견
   특징: 환자 식별 정보도 그래프도 없음

[중요]
- 환자 정보가 있으면 무조건 "metadata"를 우선 선택 (그래프와 같이 있어도 metadata)
- 측정값 표(키/체중/혈압 등)는 이미 표 영역에서 처리되므로 무시
- 의사 소견 텍스트만 있으면 "empty" (개별 환자 정보가 아님)

응답은 JSON 한 줄만: {"category": "graphic"} 또는 {"category": "metadata"} 또는 {"category": "empty"}
설명, 마크다운, 다른 문구 금지."""

OUTSIDE_TABLE_USER_PROMPT = """이 영역의 카테고리는?
- graphic: 그래프/차트/시각화
- metadata: 환자정보/검진일자/병원명 등 텍스트 메타
- empty: 위 둘 다 아님 (안내문, 빈 여백 등)

{"category": "graphic"/"metadata"/"empty"} 한 줄만 응답."""


# ----------------------------------------
# 표 외 영역 탐지 파라미터
# ----------------------------------------

# 표 외 영역으로 인정할 최소 크기 (이미지 면적 대비 비율)
# 너무 작은 여백/조각은 후보에서 제외
OUTSIDE_MIN_AREA_RATIO = 0.02

# 사전 필터링: 영역의 비-흰색 픽셀 비율이 이 값 미만이면 LLM 호출 스킵
# (거의 빈 영역은 분류해봐야 그래픽 없음)
OUTSIDE_MIN_CONTENT_DENSITY = 0.03

# 흰색 판정 임계값 (RGB 평균이 이 값 이상이면 흰색으로 간주)
WHITE_THRESHOLD = 240


# ----------------------------------------
# 검출기
# ----------------------------------------

class LLMGraphicClassifier(BaseGraphicDetector):
    """LLM으로 그래픽 영역 분류.
    
    두 가지 일을 함:
      1. exclude_regions (기존 표 영역)의 각 영역을 LLM에 분류.
         그래픽 포함이면 그 영역의 region_type을 GRAPHIC으로 바꾸고
         source="inside_table" in-place 마킹.
      2. 표 외 영역 후보 검출 → 사전 필터링 → LLM 분류.
         그래픽이면 새 RegionInfo 반환.
    
    Returns:
        새로 검출된 그래픽 영역 (= 표 외 그래픽)만 반환.
        표 안 그래픽은 exclude_regions의 객체를 in-place 수정해서 표현.
    """
    
    def __init__(
        self,
        model: str | None = None,
        outside_min_area_ratio: float = OUTSIDE_MIN_AREA_RATIO,
        outside_min_content_density: float = OUTSIDE_MIN_CONTENT_DENSITY,
    ):
        # [step10] Ollama 모델명 fallback 제거.
        # backend 추상화에 따라 None이면 vision_backend의 default_model 사용 (Gemini/Ollama 자동 호환).
        self.model = model
        self.outside_min_area_ratio = outside_min_area_ratio
        self.outside_min_content_density = outside_min_content_density
    
    def detect(
        self,
        image: Image.Image,
        exclude_regions: list[RegionInfo] | None = None,
    ) -> list[RegionInfo]:
        exclude_regions = exclude_regions or []
        
        # ---- 1단계: 기존 표 영역 각각을 LLM에 분류 ----
        n_inside_graphic = 0
        for region in exclude_regions:
            if region.region_type != RegionType.TABLE:
                continue  # 표 외 타입은 건너뜀
            
            try:
                has_graphic = self._classify_region(
                    image,
                    region,
                    system_prompt=INSIDE_TABLE_SYSTEM_PROMPT,
                    user_prompt=INSIDE_TABLE_USER_PROMPT,
                )
            except Exception as e:
                print(f"[LLMGraphicClassifier] 표 영역 {region.bbox} 분류 실패 (스킵): "
                      f"{type(e).__name__}: {e}")
                continue
            
            if has_graphic:
                # in-place: region_type 변경 + source 마킹
                region.region_type = RegionType.GRAPHIC
                region.source = "inside_table"
                n_inside_graphic += 1
                print(f"[LLMGraphicClassifier] 표 영역 {region.bbox} → 그래픽 표로 재분류")
        
        print(f"[LLMGraphicClassifier] 표 안 그래픽 {n_inside_graphic}/{len(exclude_regions)}개")
        
        # ---- 2단계: 표 외 영역 후보 검출 ----
        outside_candidates = self._find_outside_candidates(image, exclude_regions)
        print(f"[LLMGraphicClassifier] 표 외 후보 영역: {len(outside_candidates)}개")
        
        # ---- 3단계: 표 외 후보를 LLM에 3분류 (graphic/metadata/empty) ----
        outside_regions: list[RegionInfo] = []
        n_graphic, n_metadata, n_empty = 0, 0, 0
        for candidate_bbox in outside_candidates:
            try:
                category = self._classify_outside_region(image, candidate_bbox)
            except Exception as e:
                print(f"[LLMGraphicClassifier] 표 외 영역 {candidate_bbox} 분류 실패 (스킵): "
                      f"{type(e).__name__}: {e}")
                continue
            
            if category == "graphic":
                outside_regions.append(RegionInfo(
                    region_type=RegionType.GRAPHIC,
                    bbox=candidate_bbox,
                    source="outside_table",
                ))
                n_graphic += 1
                print(f"[LLMGraphicClassifier] 표 외 그래픽 검출: {candidate_bbox}")
            elif category == "metadata":
                outside_regions.append(RegionInfo(
                    region_type=RegionType.METADATA,
                    bbox=candidate_bbox,
                    source="outside_table",
                ))
                n_metadata += 1
                print(f"[LLMGraphicClassifier] 표 외 메타 검출: {candidate_bbox}")
            else:  # "empty" 또는 알 수 없음
                n_empty += 1
        
        print(f"[LLMGraphicClassifier] 표 외 분류: graphic={n_graphic}, "
              f"metadata={n_metadata}, empty={n_empty}")
        
        return outside_regions
    
    # ----------------------------------------
    # 내부 메서드
    # ----------------------------------------
    
    def _classify_region(
        self,
        image: Image.Image,
        region: RegionInfo,
        system_prompt: str,
        user_prompt: str,
    ) -> bool:
        """단일 영역에 대해 LLM 분류 호출. has_graphic bool 반환."""
        cropped = image_utils.crop_region(image, region.bbox)
        b64 = image_utils.image_to_base64(cropped, format="PNG")
        
        parsed, meta = ollama_client.call_vision_model(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            image_base64=b64,
            model=self.model,
        )
        
        # 응답 검증
        if not isinstance(parsed, dict) or "has_graphic" not in parsed:
            print(f"[LLMGraphicClassifier] 응답 형식 이상 (기본값 false): {parsed}")
            return False
        
        result = parsed["has_graphic"]
        if not isinstance(result, bool):
            # 문자열 "true"/"false"도 허용
            if isinstance(result, str):
                result = result.lower() == "true"
            else:
                print(f"[LLMGraphicClassifier] has_graphic 타입 이상 (기본값 false): {result}")
                return False
        
        return result
    
    def _classify_outside_region(
        self,
        image: Image.Image,
        bbox: tuple[int, int, int, int],
    ) -> str:
        """표 외 영역에 대해 LLM 3분류 호출.
        
        Returns:
            "graphic" | "metadata" | "empty"
            응답 형식 이상이면 "empty" (안전한 기본값).
        """
        cropped = image_utils.crop_region(image, bbox)
        b64 = image_utils.image_to_base64(cropped, format="PNG")
        
        parsed, meta = ollama_client.call_vision_model(
            system_prompt=OUTSIDE_TABLE_SYSTEM_PROMPT,
            user_prompt=OUTSIDE_TABLE_USER_PROMPT,
            image_base64=b64,
            model=self.model,
        )
        
        # 응답 검증
        if not isinstance(parsed, dict) or "category" not in parsed:
            print(f"[LLMGraphicClassifier] 표 외 분류 응답 형식 이상 (기본값 empty): {parsed}")
            return "empty"
        
        category = parsed["category"]
        if not isinstance(category, str):
            print(f"[LLMGraphicClassifier] category 타입 이상 (기본값 empty): {category}")
            return "empty"
        
        category = category.lower().strip()
        if category not in ("graphic", "metadata", "empty"):
            print(f"[LLMGraphicClassifier] 알 수 없는 category (기본값 empty): '{category}'")
            return "empty"
        
        return category
    
    def _find_outside_candidates(
        self,
        image: Image.Image,
        table_regions: list[RegionInfo],
    ) -> list[tuple[int, int, int, int]]:
        """표 영역 외의 큰 콘텐츠 영역을 후보로 검출.
        
        알고리즘:
          1. 이미지를 numpy로 변환
          2. 표 영역들을 흰색으로 마스킹 (제외)
          3. 남은 영역에서 비-흰색 픽셀을 연결 컴포넌트로 그룹화
          4. 일정 크기 이상이고, 콘텐츠 밀도가 임계값 이상인 영역만 후보
        """
        img_w, img_h = image.size
        img_array = np.array(image.convert("RGB"))
        
        # 표 영역들을 흰색으로 마스킹 (이후 분석에서 제외)
        masked = img_array.copy()
        for region in table_regions:
            x1, y1, x2, y2 = region.bbox
            masked[y1:y2, x1:x2] = 255
        
        # 그레이스케일 변환 후 이진화 (비-흰색 = 콘텐츠)
        gray = np.mean(masked, axis=2)
        content_mask = gray < WHITE_THRESHOLD  # True = 콘텐츠 픽셀
        
        # 단순화된 접근: 표 외 영역을 큰 직사각형 블록으로 분할
        # 표 영역들의 y 좌표 기준으로 위/아래/사이 영역들 찾기
        candidates: list[tuple[int, int, int, int]] = []
        
        # 표 영역들의 y 범위 수집 (정렬)
        table_y_ranges = sorted(
            [(r.bbox[1], r.bbox[3]) for r in table_regions]
        )
        
        # 수평 띠 단위로 표 외 영역 분리
        # (검진지는 보통 세로로 표가 쌓여있으므로 위/아래 띠만 찾으면 충분)
        bands: list[tuple[int, int]] = []  # (y1, y2) 띠들
        prev_end = 0
        for y1, y2 in table_y_ranges:
            if y1 > prev_end:
                bands.append((prev_end, y1))
            prev_end = max(prev_end, y2)
        if prev_end < img_h:
            bands.append((prev_end, img_h))
        
        # 각 띠에 대해 콘텐츠 밀도 확인 후 후보 결정
        min_area = self.outside_min_area_ratio * img_w * img_h
        for y1, y2 in bands:
            if (y2 - y1) * img_w < min_area:
                continue  # 너무 작은 띠
            
            # 콘텐츠 밀도 계산
            band_mask = content_mask[y1:y2, :]
            density = band_mask.mean() if band_mask.size > 0 else 0.0
            
            if density < self.outside_min_content_density:
                continue  # 거의 빈 영역
            
            # 띠 안에서 콘텐츠가 있는 x 범위로 좁히기
            col_has_content = band_mask.any(axis=0)
            if not col_has_content.any():
                continue
            
            x_indices = np.where(col_has_content)[0]
            x1 = int(x_indices[0])
            x2 = int(x_indices[-1]) + 1
            
            # 약간의 패딩
            x1 = max(0, x1 - 5)
            x2 = min(img_w, x2 + 5)
            y1_p = max(0, y1 - 5)
            y2_p = min(img_h, y2 + 5)
            
            candidates.append((x1, y1_p, x2, y2_p))
        
        return candidates
