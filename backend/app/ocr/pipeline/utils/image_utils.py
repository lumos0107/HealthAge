"""
이미지 처리 유틸리티.

- 이미지 로드 / base64 변환
- 좌표 검증 (이미지 범위 내, 합리적 크기)
- 영역별 crop
- 디버깅 시각화 (원본 + 박스 표시)
"""

from __future__ import annotations
import base64
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

from app.ocr.pipeline.utils.schemas import RegionInfo, RegionType, SplitResult


# ----------------------------------------
# 이미지 로드 / 인코딩
# ----------------------------------------

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def load_image(image_path: str | Path) -> Image.Image:
    """이미지를 PIL Image로 로드. 형식 검증 포함."""
    path = Path(image_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"이미지 파일이 없습니다: {path}")
    if path.suffix.lower() not in SUPPORTED_EXTS:
        raise ValueError(
            f"지원하지 않는 형식: {path.suffix}. "
            f"지원: {', '.join(SUPPORTED_EXTS)}"
        )
    return Image.open(path).convert("RGB")


def image_to_base64(image: Image.Image, format: str = "PNG") -> str:
    """PIL Image → base64 문자열."""
    import io
    buf = io.BytesIO()
    image.save(buf, format=format)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def image_file_to_base64(image_path: str | Path) -> str:
    """이미지 파일 → base64 (파일을 그대로 읽음)."""
    path = Path(image_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"이미지 파일이 없습니다: {path}")
    return base64.b64encode(path.read_bytes()).decode("utf-8")


# ----------------------------------------
# 업스케일링
# ----------------------------------------

_RESAMPLE_MAP = {
    "lanczos":  Image.LANCZOS,
    "bicubic":  Image.BICUBIC,
    "nearest":  Image.NEAREST,
}


def upscale_if_small(
    image: Image.Image,
    threshold_px: int,
    target_px: int,
    method: str = "lanczos",
    max_scale: float | None = None,
    max_long_side: int | None = None,
) -> tuple[Image.Image, float]:
    """짧은 변이 threshold_px보다 작으면 target_px로 업스케일.
    
    Args:
        image: 입력 이미지
        threshold_px: 짧은 변이 이 값보다 작아야 업스케일 적용
        target_px: 업스케일 후 목표 짧은 변 길이
        method: 보간 방식 ("lanczos" | "bicubic" | "nearest")
        max_scale: 배율 상한. 짧은 변 기준 배율이 이 값을 넘으면 이 값으로 제한.
                   None이면 무제한.
        max_long_side: 긴 변 픽셀 상한. 업스케일 후 긴 변이 이 값을 넘으면
                       긴 변이 이 값에 맞도록 배율을 더 줄임. None이면 무제한.
    
    Returns:
        (업스케일된 이미지 또는 원본, 적용된 배율).
        배율이 1.0이면 업스케일 안 함.
    """
    w, h = image.size
    short_side = min(w, h)
    long_side = max(w, h)
    
    if short_side >= threshold_px:
        return image, 1.0
    
    # 1차: 짧은 변을 target_px로 맞추는 배율
    scale = target_px / short_side
    
    # 2차: 배율 상한 적용
    if max_scale is not None and scale > max_scale:
        scale = max_scale
    
    # 3차: 긴 변 상한 적용 (배율을 더 줄여야 할 수도)
    if max_long_side is not None and long_side * scale > max_long_side:
        scale = max_long_side / long_side
    
    # 배율이 1.0 이하로 떨어지면 업스케일 안 함
    if scale <= 1.0:
        return image, 1.0
    
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    
    resample = _RESAMPLE_MAP.get(method, Image.LANCZOS)
    upscaled = image.resize((new_w, new_h), resample)
    
    return upscaled, scale


# ----------------------------------------
# 좌표 검증
# ----------------------------------------

class CoordinateValidationError(ValueError):
    """좌표 검증 실패 예외."""
    pass


def validate_bbox(
    bbox: tuple[int, int, int, int],
    image_width: int,
    image_height: int,
    min_ratio: float = 0.01,
    max_ratio: float = 0.98,
) -> list[str]:
    """좌표가 유효한지 검증.
    
    반환: 경고 메시지 리스트 (빈 리스트면 정상)
    심각한 오류(범위 초과 등)는 예외 발생.
    """
    x1, y1, x2, y2 = bbox
    warnings = []
    
    # 순서 검증
    if x1 >= x2 or y1 >= y2:
        raise CoordinateValidationError(
            f"잘못된 bbox 순서: ({x1}, {y1}, {x2}, {y2}). "
            f"x1<x2, y1<y2 필요."
        )
    
    # 이미지 범위 내 검증
    if x1 < 0 or y1 < 0:
        raise CoordinateValidationError(
            f"음수 좌표: ({x1}, {y1}). 이미지 좌상단은 (0, 0)."
        )
    if x2 > image_width or y2 > image_height:
        raise CoordinateValidationError(
            f"이미지 범위 초과: bbox=({x1},{y1},{x2},{y2}), "
            f"이미지 크기=({image_width}, {image_height})"
        )
    
    # 크기 검증 (경고만)
    width = x2 - x1
    height = y2 - y1
    area_ratio = (width * height) / (image_width * image_height)
    
    if area_ratio < min_ratio:
        warnings.append(
            f"영역이 너무 작음 (전체의 {area_ratio*100:.2f}%). "
            f"좌표 오류 가능성."
        )
    if area_ratio > max_ratio:
        warnings.append(
            f"영역이 거의 전체 이미지 ({area_ratio*100:.2f}%). "
            f"분할 실패 가능성."
        )
    
    return warnings


# ----------------------------------------
# 영역 crop
# ----------------------------------------

def crop_region(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    """이미지에서 bbox 영역을 잘라낸다."""
    x1, y1, x2, y2 = bbox
    return image.crop((x1, y1, x2, y2))


def crop_regions(
    image: Image.Image,
    regions: Iterable[RegionInfo],
) -> list[tuple[RegionInfo, Image.Image]]:
    """여러 영역을 한꺼번에 crop. (region, cropped_image) 튜플 리스트 반환."""
    return [(r, crop_region(image, r.bbox)) for r in regions]


# ----------------------------------------
# 디버깅 시각화
# ----------------------------------------

# 영역 타입별 색상
REGION_COLORS: dict[RegionType, str] = {
    RegionType.TABLE: "red",
    RegionType.CHECKBOX: "blue",
    RegionType.GRAPHIC: "green",
    RegionType.METADATA: "purple",
    RegionType.UNKNOWN: "gray",
}


def draw_split_visualization(
    image: Image.Image,
    split_result: SplitResult,
    output_path: str | Path,
) -> None:
    """원본 이미지 위에 분할 박스를 그려서 저장 (시각적 검증용)."""
    vis = image.copy()
    draw = ImageDraw.Draw(vis)
    
    # 폰트 (Windows 기본 폰트 시도, 실패 시 기본)
    try:
        font = ImageFont.truetype("malgun.ttf", 16)  # 맑은 고딕
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("arial.ttf", 16)
        except (OSError, IOError):
            font = ImageFont.load_default()
    
    for i, region in enumerate(split_result.regions):
        color = REGION_COLORS.get(region.region_type, "gray")
        x1, y1, x2, y2 = region.bbox
        
        # 박스 그리기
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        
        # 라벨 텍스트
        label = f"[{i}] {region.region_type.value}"
        if region.label:
            label += f" / {region.label}"
        label += f" (conf={region.confidence:.2f})"
        
        # 라벨 배경 (가독성)
        text_bbox = draw.textbbox((x1, y1 - 22), label, font=font)
        draw.rectangle(text_bbox, fill=color)
        draw.text((x1, y1 - 22), label, fill="white", font=font)
    
    vis.save(output_path)


def save_cropped_regions(
    image: Image.Image,
    split_result: SplitResult,
    output_dir: str | Path,
    prefix: str = "region",
) -> list[Path]:
    """각 영역을 잘라서 별도 이미지로 저장."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    saved_paths = []
    for i, region in enumerate(split_result.regions):
        cropped = crop_region(image, region.bbox)
        filename = f"{prefix}_{i:02d}_{region.region_type.value}.png"
        path = output_dir / filename
        cropped.save(path)
        saved_paths.append(path)
    
    return saved_paths
