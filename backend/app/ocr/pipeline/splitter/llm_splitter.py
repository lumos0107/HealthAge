"""
LLM 기반 Splitter 구현.

비전 LLM(qwen2.5vl)에게 이미지를 주고 영역의 종류와 좌표를 받는다.
좌표는 원본 이미지의 픽셀 좌표(x1, y1, x2, y2)로 받으며,
정규화된 좌표(0~1000)가 올 경우 자동 변환한다.

다른 splitter 구현체(예: OpenCVSplitter)로 교체 시,
이 파일과 동일한 BaseSplitter 인터페이스만 따르면 됨.
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any

from PIL import Image

from app.ocr.pipeline import config
from app.ocr.pipeline.splitter.base import BaseSplitter
from app.ocr.pipeline.utils import image_utils, ollama_client
from app.ocr.pipeline.utils.schemas import RegionInfo, RegionType, SplitResult


# ----------------------------------------
# 시스템 프롬프트
# ----------------------------------------

SPLITTER_SYSTEM_PROMPT = """당신은 한국 건강검진 결과지의 레이아웃을 분석하는 전문가입니다.
이미지에서 정보가 담긴 영역들을 찾아 종류별로 분류하고 좌표를 반환합니다.

[영역 종류]
- "table": 표 형태로 정리된 수치 데이터 영역
   (예: 신장/체중/혈압/혈액검사 수치들이 행으로 나열된 표 전체)
- "checkbox": 체크박스(■, □, ☑, ☐, ●, ○)로 응답을 표시한 영역
   (예: 흡연/음주 문진, 비만도 판정 체크박스 묶음)
- "graphic": 막대그래프, 게이지, 자(눈금), 색상 막대 등 시각적 수치 표현
   (예: "14.5g/dL"가 막대 위의 마커로 표시된 영역)

[규칙]
1. 같은 종류의 영역이 여러 개일 수 있습니다. (예: 표가 2개로 나뉘어 있음)
2. 영역들은 가능한 한 겹치지 않게 분리하세요.
3. 한 영역에 두 종류가 섞여 있으면(예: 표 안에 체크박스), 큰 종류 기준으로 한 영역으로 묶고
   해당 영역의 region_type을 더 비중이 큰 쪽으로 정하세요.
4. 의사 소견, 도장, 서명, 환자 인적사항 헤더는 영역에서 제외하세요.
5. 좌표는 반드시 원본 이미지의 픽셀 단위로 반환하세요.
   - x1, y1: 영역의 좌상단 픽셀 좌표
   - x2, y2: 영역의 우하단 픽셀 좌표
   - x1 < x2, y1 < y2 이어야 합니다.

[출력 JSON 형식 — 정확히 이대로]
{
  "image_width": <원본 이미지 가로 픽셀>,
  "image_height": <원본 이미지 세로 픽셀>,
  "regions": [
    {
      "region_type": "table",
      "bbox": [x1, y1, x2, y2],
      "label": "영역에 대한 짧은 한글 설명 (예: 혈액검사 표)",
      "confidence": 0.0~1.0
    },
    ...
  ]
}

JSON 외 텍스트, 마크다운 코드블록 절대 출력 금지."""


SPLITTER_USER_PROMPT = """이 건강검진 결과지 이미지를 분석해 영역들을 분할해주세요.

각 영역의 종류(table/checkbox/graphic)와 픽셀 좌표(x1, y1, x2, y2)를 알려주세요.
좌표는 반드시 이 이미지의 실제 픽셀 크기 기준이어야 합니다.
영역이 겹치지 않게, 그리고 빠뜨림 없이 찾아주세요."""


# ----------------------------------------
# 구현체
# ----------------------------------------

class LLMSplitter(BaseSplitter):
    """비전 LLM에게 이미지를 보내 영역 좌표를 받아오는 splitter."""
    
    def __init__(
        self,
        model: str | None = None,
        debug_dir: Path | None = None,
        save_debug_images: bool = True,
    ):
        """
        Args:
            model: 사용할 vision 모델명. None이면 주입된 vision_backend의 default_model 사용
                   (Gemini/Ollama 등 backend 종류 무관).
            debug_dir: 디버깅 이미지 저장 폴더 (기본: config.DEBUG_DIR)
            save_debug_images: 디버깅 이미지 저장 여부
        """
        # [step10] Ollama 모델명 fallback 제거.
        # backend 추상화에 따라 None이면 vision_backend의 default_model 사용.
        self.model = model
        self.debug_dir = debug_dir or config.DEBUG_DIR
        self.save_debug_images = save_debug_images
    
    def split(self, image_path: str | Path) -> SplitResult:
        # 1) 이미지 로드
        image = image_utils.load_image(image_path)
        actual_w, actual_h = image.size
        
        # 2) base64 변환
        b64 = image_utils.image_file_to_base64(image_path)
        
        # 3) LLM 호출
        parsed, meta = ollama_client.call_vision_model(
            system_prompt=SPLITTER_SYSTEM_PROMPT,
            user_prompt=SPLITTER_USER_PROMPT,
            image_base64=b64,
            model=self.model,
        )
        
        # 4) 원본 응답을 디버깅용으로 저장
        if self.save_debug_images:
            raw_log_path = self.debug_dir / "splitter_raw_response.json"
            raw_log_path.write_text(
                json.dumps(
                    {"meta": meta, "parsed": parsed},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        
        # 5) 응답 검증 및 RegionInfo 변환
        regions = self._parse_regions(
            parsed,
            actual_w=actual_w,
            actual_h=actual_h,
        )
        
        result = SplitResult(
            regions=regions,
            image_width=actual_w,
            image_height=actual_h,
        )
        
        # 6) 디버깅 이미지 저장 (원본 + 박스 + 영역별 crop)
        if self.save_debug_images:
            self._save_debug_images(image, result)
        
        # 7) 호출 메타 로깅
        print(f"[LLMSplitter] {meta['elapsed_sec']:.1f}초, "
              f"{meta['tokens_per_sec']:.1f} tok/s, "
              f"{len(regions)}개 영역 검출")
        
        return result
    
    # ------------------------------------
    # 내부 메서드
    # ------------------------------------
    
    def _parse_regions(
        self,
        parsed: dict[str, Any],
        actual_w: int,
        actual_h: int,
    ) -> list[RegionInfo]:
        """LLM 응답 dict를 검증하여 RegionInfo 리스트로 변환."""
        raw_regions = parsed.get("regions", [])
        if not isinstance(raw_regions, list):
            raise ValueError(f"regions가 리스트가 아님: {type(raw_regions)}")
        
        # LLM이 보고한 이미지 크기 (좌표 스케일 보정용)
        reported_w = parsed.get("image_width", actual_w)
        reported_h = parsed.get("image_height", actual_h)
        
        # 좌표 스케일 검사: LLM이 정규화 좌표(0~1000)를 줬을 가능성
        coord_scale_x, coord_scale_y = self._detect_coordinate_scale(
            raw_regions, actual_w, actual_h, reported_w, reported_h,
        )
        if coord_scale_x != 1.0 or coord_scale_y != 1.0:
            print(f"[LLMSplitter] 좌표 스케일 보정 적용: "
                  f"x={coord_scale_x:.3f}, y={coord_scale_y:.3f}")
        
        regions: list[RegionInfo] = []
        for i, raw in enumerate(raw_regions):
            try:
                region = self._parse_single_region(
                    raw, i, actual_w, actual_h,
                    coord_scale_x, coord_scale_y,
                )
                if region is not None:
                    regions.append(region)
            except ValueError as e:
                print(f"[LLMSplitter] 영역 #{i} 파싱 실패 (스킵): {e}")
        
        if not regions:
            raise RuntimeError(
                "분할된 영역이 0개입니다. LLM이 좌표를 제대로 주지 못함.\n"
                f"원본 응답을 확인하세요: {self.debug_dir / 'splitter_raw_response.json'}"
            )
        
        return regions
    
    def _parse_single_region(
        self,
        raw: dict[str, Any],
        index: int,
        actual_w: int,
        actual_h: int,
        scale_x: float,
        scale_y: float,
    ) -> RegionInfo | None:
        """단일 영역 dict → RegionInfo. 검증 실패 시 ValueError."""
        # region_type
        rtype_str = raw.get("region_type", "").lower().strip()
        try:
            region_type = RegionType(rtype_str)
        except ValueError:
            raise ValueError(f"알 수 없는 region_type: '{rtype_str}'")
        
        # bbox
        bbox_raw = raw.get("bbox")
        if not isinstance(bbox_raw, list) or len(bbox_raw) != 4:
            raise ValueError(f"bbox 형식 오류: {bbox_raw}")
        
        try:
            x1 = int(round(float(bbox_raw[0]) * scale_x))
            y1 = int(round(float(bbox_raw[1]) * scale_y))
            x2 = int(round(float(bbox_raw[2]) * scale_x))
            y2 = int(round(float(bbox_raw[3]) * scale_y))
        except (TypeError, ValueError) as e:
            raise ValueError(f"bbox 숫자 변환 실패: {bbox_raw} ({e})")
        
        # 이미지 범위로 클램핑 (1~2픽셀 정도 넘어가는 건 흔함)
        x1 = max(0, min(x1, actual_w))
        y1 = max(0, min(y1, actual_h))
        x2 = max(0, min(x2, actual_w))
        y2 = max(0, min(y2, actual_h))
        
        bbox = (x1, y1, x2, y2)
        
        # 좌표 검증 (예외 가능)
        warnings = image_utils.validate_bbox(
            bbox, actual_w, actual_h,
            min_ratio=config.MIN_REGION_RATIO,
            max_ratio=config.MAX_REGION_RATIO,
        )
        for w in warnings:
            print(f"[LLMSplitter] 영역 #{index} ({region_type.value}) 경고: {w}")
        
        return RegionInfo(
            region_type=region_type,
            bbox=bbox,
            confidence=float(raw.get("confidence", 1.0)),
            label=raw.get("label"),
        )
    
    def _detect_coordinate_scale(
        self,
        raw_regions: list[dict[str, Any]],
        actual_w: int,
        actual_h: int,
        reported_w: int,
        reported_h: int,
    ) -> tuple[float, float]:
        """LLM이 보낸 좌표의 스케일을 자동 감지.
        
        경우의 수:
        1. LLM이 실제 픽셀 좌표를 줌 → scale = 1.0
        2. LLM이 0~1000 정규화 좌표를 줌 (Qwen 종종 발생) → scale = actual / 1000
        3. LLM이 보고한 image_width와 실제가 다름 → scale = actual / reported
        """
        if not raw_regions:
            return 1.0, 1.0
        
        # 모든 bbox의 x, y 최대값 확인
        max_x = 0.0
        max_y = 0.0
        for r in raw_regions:
            bbox = r.get("bbox", [])
            if isinstance(bbox, list) and len(bbox) == 4:
                try:
                    max_x = max(max_x, float(bbox[0]), float(bbox[2]))
                    max_y = max(max_y, float(bbox[1]), float(bbox[3]))
                except (TypeError, ValueError):
                    continue
        
        if max_x == 0 or max_y == 0:
            return 1.0, 1.0
        
        # 케이스 1: 좌표가 실제 이미지 크기 범위 내
        # 약간의 마진 허용 (1.05배까지는 정상 범위)
        if max_x <= actual_w * 1.05 and max_y <= actual_h * 1.05:
            return 1.0, 1.0
        
        # 케이스 3: LLM이 보고한 크기와 실제가 다름
        # 보고한 크기 범위 내라면 그걸로 보정
        if reported_w > 0 and reported_h > 0:
            if max_x <= reported_w * 1.05 and max_y <= reported_h * 1.05:
                return actual_w / reported_w, actual_h / reported_h
        
        # 케이스 2: 0~1000 또는 0~1 정규화
        if max_x <= 1000 and max_y <= 1000:
            return actual_w / 1000, actual_h / 1000
        if max_x <= 1.0 and max_y <= 1.0:
            return float(actual_w), float(actual_h)
        
        # 모르겠으면 그대로 (검증 단계에서 잡힐 것)
        print(f"[LLMSplitter] 좌표 스케일 추정 실패. "
              f"max_x={max_x}, max_y={max_y}, "
              f"actual=({actual_w},{actual_h}), reported=({reported_w},{reported_h})")
        return 1.0, 1.0
    
    def _save_debug_images(
        self,
        image: Image.Image,
        split_result: SplitResult,
    ) -> None:
        """디버깅용 이미지 저장: 분할 시각화 + 영역별 crop."""
        # 1) 원본 + 박스 시각화
        vis_path = self.debug_dir / "split_visualization.png"
        image_utils.draw_split_visualization(image, split_result, vis_path)
        print(f"[LLMSplitter] 분할 시각화 저장: {vis_path}")
        
        # 2) 영역별 crop 저장
        crop_dir = self.debug_dir / "regions"
        # 기존 crop 정리
        if crop_dir.exists():
            for f in crop_dir.glob("region_*.png"):
                f.unlink()
        paths = image_utils.save_cropped_regions(
            image, split_result, crop_dir, prefix="region",
        )
        print(f"[LLMSplitter] 영역 crop 저장: {len(paths)}개 → {crop_dir}")
