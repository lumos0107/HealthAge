"""문서 사진의 기울기·원근 보정.

배경: OCR 앞단의 표 검출(opencv_table_detector)이 «가로선/세로선 morphological
opening»으로 격자를 찾는다. 문서가 기울면 선이 가로도 세로도 아니게 되어 표가 통째로
안 잡힌다. 지금까지 문제가 안 된 건 테스트가 전부 PDF에서 렌더링한 반듯한 이미지였기
때문이고, **폰으로 찍는 순간 깨진다.**

여기서 강제하는 것:
  1. 반듯한 스캔본은 손대지 않는다 — 잘못 편 이미지는 안 편 것보다 나쁘다
  2. 기울인 이미지는 실제로 펴진다 (보정기와 «독립된» 가로선 점수로 측정)
  3. 어떤 입력에도 예외를 던지지 않는다 — 보정 실패는 원본 통과여야 한다
"""
from __future__ import annotations

import io
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

from app.ocr.pipeline.utils.image_utils import correct_document_orientation

SHEET = Path(
    r"C:\Users\seungjun\Documents\work\WITHUS\테스트검진지_마스킹\general_01_p2.png"
)

pytestmark = pytest.mark.skipif(
    not SHEET.exists(), reason="마스킹 테스트 결과지가 없는 환경"
)


def _sheet() -> Image.Image:
    """표 격자가 뚜렷한 실제 검진 결과지(수치 페이지). 폭을 줄여 테스트를 가볍게."""
    img = Image.open(SHEET).convert("RGB")
    return img.resize((img.width // 2, img.height // 2), Image.LANCZOS)


def _horizontal_line_score(img: Image.Image) -> int:
    """긴 가로선으로 잡히는 픽셀 수. 표 양식이 반듯할수록 커진다.

    ⚠️ 보정기가 쓰는 minAreaRect와 **다른 방법**이다. 같은 척도로 재면
       "자기가 한 일을 자기가 채점"하는 테스트가 된다.

    ⚠️ 커널이 200px인 이유: 40px로는 3도 기울여도 선이 안 끊겨(상승 2px) 둔감했다.
       200px면 3도에 10px 올라가 표 선 두께를 넘으므로 확실히 끊긴다.
    ⚠️ 하단 12%를 자르는 이유: 마스킹 스크립트가 발급자 영역을 검게 칠해 둬서,
       그 큰 검은 띠가 어떤 각도에서도 살아남아 점수를 지배한다.
    """
    a = np.array(img.convert("L"))
    a = a[: int(a.shape[0] * 0.88), :]
    bw = cv2.threshold(a, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (200, 1))
    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN, kernel)
    return int((horiz > 0).sum())


def _rotate(img: Image.Image, deg: float) -> Image.Image:
    return img.rotate(deg, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255))


# ── 1. 반듯한 것은 건드리지 않는다 ──────────────────────────────────────────
def test_반듯한_스캔본은_보정하지_않는다():
    img = _sheet()
    out, info = correct_document_orientation(img)
    assert info["method"] == "none", f"불필요한 보정이 일어났다: {info}"
    assert out.size == img.size


# ── 2. 기울인 것은 실제로 펴진다 ────────────────────────────────────────────
@pytest.mark.parametrize("deg", [3.0, -3.0, 5.0, -5.0, 8.0, -8.0])
def test_기울인_이미지가_펴진다(deg):
    """양·음 both 방향을 다 건다.

    ⚠️ 음수 방향이 파라미터에 꼭 있어야 한다. minAreaRect 각도 범위를 한쪽만
       정규화했다가 -3·-5·-8도가 전부 감지 실패한 적이 있다.
    """
    img = _sheet()
    straight = _horizontal_line_score(img)
    tilted = _rotate(img, deg)
    fixed, info = correct_document_orientation(tilted)

    assert info["method"] == "rotate", f"{deg}도 기울었는데 보정이 안 일어났다: {info}"
    # 보정 후 가로선이 «반듯한 원본 수준»으로 돌아와야 한다
    assert _horizontal_line_score(fixed) > straight * 0.8, (
        f"{deg}도 보정 후 가로선이 원본에 못 미친다 "
        f"(원본 {straight} / 기울임 {_horizontal_line_score(tilted)} "
        f"/ 보정 {_horizontal_line_score(fixed)})"
    )
    assert _horizontal_line_score(fixed) > _horizontal_line_score(tilted) * 2


def test_감지한_각도가_실제_기울기와_맞는다():
    img = _sheet()
    fixed, info = correct_document_orientation(_rotate(img, 6.0))
    # PIL rotate(+6)은 반시계 방향 → 보정은 시계 방향(-6도 근처)이어야 한다
    assert abs(abs(info["angle"]) - 6.0) < 2.0, info


# ── 3. 과보정 방지 ──────────────────────────────────────────────────────────
def test_너무_큰_각도는_기울기로_보지_않는다():
    """40도짜리는 «기운 문서»가 아니라 다른 상황이다. 함부로 돌리면 더 나빠진다."""
    img = _sheet()
    out, info = correct_document_orientation(_rotate(img, 40.0))
    assert info["method"] == "none", info


# ── 4. 어떤 입력에도 죽지 않는다 ────────────────────────────────────────────
def test_단색_이미지도_예외를_던지지_않는다():
    blank = Image.new("RGB", (400, 300), (255, 255, 255))
    out, info = correct_document_orientation(blank)
    assert info["method"] == "none"
    assert out.size == blank.size


def test_아주_작은_이미지도_예외를_던지지_않는다():
    tiny = Image.new("RGB", (3, 3), (128, 128, 128))
    out, info = correct_document_orientation(tiny)
    assert out.size == tiny.size


def test_반환은_항상_RGB_PIL_이미지다():
    out, _ = correct_document_orientation(_sheet().convert("L"))
    assert isinstance(out, Image.Image)
    assert out.mode == "RGB"
