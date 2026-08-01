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


# ----------------------------------------
# 문서 기울기 · 원근 보정
# ----------------------------------------
# ⚠️ 왜 필요한가: 뒤따르는 표 검출(opencv_table_detector)이 «가로선/세로선
#    morphological opening»으로 격자를 찾는다. 문서가 기울면 선이 가로도 세로도
#    아니게 되어 표가 통째로 안 잡히고, 그러면 수치 추출이 0이 된다.
#    지금까지 문제가 안 된 건 테스트가 전부 PDF 렌더링본(반듯함)이었기 때문이다.
#    폰 카메라로 찍는 실제 사용 경로에서는 기울기와 원근이 항상 생긴다.
#
# ⚠️ 설계 원칙: **확신이 없으면 손대지 않는다.** 잘못 편 이미지는 안 편 이미지보다
#    나쁘다(표가 오히려 더 안 잡힌다). 그래서 각 단계에 «안 하는 조건»을 명시해 둔다.

# 기울기로 인정할 최대 각도. 이보다 크면 «기운 문서»가 아니라 다른 상황(가로/세로 촬영 등).
_MAX_SKEW_DEG = 20.0
# 이보다 작으면 보정 이득이 없다. 굳이 리샘플링해서 화질만 깎을 이유가 없다.
_MIN_SKEW_DEG = 0.4

# ⚠️ 원근(4점 투시) 보정은 **일부러 넣지 않았다.**
#    시도해 봤고, 반듯한 스캔본에서 «표 테두리»를 문서 사각형으로 오인해 표만 잘라내는
#    문제가 나왔다. 제대로 하려면 "배경 위에 놓인 문서"와 "종이 안의 표"를 가려야 하는데
#    (윤곽 밖 영역의 밝기·질감을 종이와 비교하는 식), 잘못 판단하면 이미지를 통째로
#    망가뜨린다. 회전 보정만으로도 표 격자 검출이 살아나는 것이 주 목적이므로
#    거기까지만 한다. 원근은 실제 폰 촬영 샘플을 모은 뒤에 붙이는 게 맞다.


def _skew_angle(gray: "np.ndarray") -> "float | None":
    """글자·선 픽셀의 최소외접사각형 각도로 기울기를 잰다. 판단 불가면 None."""
    import cv2
    import numpy as np

    bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    coords = cv2.findNonZero(bw)
    if coords is None or len(coords) < 50:
        return None                      # 내용이 거의 없는 이미지
    angle = cv2.minAreaRect(coords)[-1]
    # ⚠️ OpenCV 버전마다 각도 범위가 다르다. 4.5 이후는 (-90, 0], 그 이전은 [0, 90).
    #    한쪽만 정규화하면 반대 방향 기울기를 통째로 놓친다 —
    #    실제로 `> 45`만 처리했다가 -3·-5·-8도가 전부 감지 실패했다.
    if angle < -45:
        angle += 90
    elif angle > 45:
        angle -= 90
    return float(angle)


def correct_document_orientation(image: "Image.Image") -> "tuple[Image.Image, dict]":
    """문서 사진의 기울기를 편다. 보정할 수 없거나 필요 없으면 원본 그대로.

    Returns:
        (보정된 RGB 이미지, {"method": "rotate"|"none", "angle": float})
        **어떤 입력에도 예외를 던지지 않는다.** 보정 실패는 원본 통과여야 한다 —
        여기서 터지면 업로드 전체가 실패한다.
    """
    info: dict = {"method": "none", "angle": 0.0}
    try:
        import cv2
        import numpy as np

        rgb = image.convert("RGB")
        arr = np.array(rgb)
        if arr.shape[0] < 50 or arr.shape[1] < 50:
            return rgb, info             # 너무 작아 판단 불가

        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        angle = _skew_angle(gray)
        if angle is None or abs(angle) < _MIN_SKEW_DEG or abs(angle) > _MAX_SKEW_DEG:
            return rgb, info             # 반듯하거나, 기울기로 볼 수 없는 각도

        h, w = arr.shape[:2]
        matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        rotated = cv2.warpAffine(
            arr, matrix, (w, h),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE,
        )
        info = {"method": "rotate", "angle": round(angle, 2)}
        return Image.fromarray(rotated), info

    except Exception as e:                # noqa: BLE001 — 보정 실패로 업로드를 죽이지 않는다
        info["error"] = f"{type(e).__name__}: {e}"
        try:
            return image.convert("RGB"), info
        except Exception:
            return image, info


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
