"""
OCR 파이프라인 진입점 — 백엔드 통합용.

백엔드의 OllamaBackend/GeminiBackend가 이 함수를 호출.
사용 예:

    from app.ocr.pipeline import entry
    from app.ocr.pipeline.utils.vision_backend import set_vision_backend, OllamaBackend
    
    # 앱 시작 시 한 번:
    set_vision_backend(OllamaBackend())
    
    # 단일 페이지
    result = entry.extract_from_images(image_bytes, "page.png")
    
    # 멀티 페이지
    result = entry.extract_from_images([img1, img2, img3], ["p1", "p2", "p3"])
"""

from __future__ import annotations
from io import BytesIO
from typing import Any, Literal

from PIL import Image

from .merger import PageMerger
from .merger.med_label_merger import MedLabelMerger
from .utils import image_utils
from .pipelines.med_label_pipeline import MedLabelPipeline
from .run_multipage import process_single_page_from_image


DocType = Literal["checkup", "med_label"]


def extract_from_images(
    images: bytes | list[bytes],
    page_names: str | list[str] | None = None,
    mime_type: str | None = None,
    *,
    doc_type: DocType = "checkup",
) -> dict[str, Any]:
    """이미지 bytes를 받아 OCR 최종 JSON dict 반환. 단일/멀티 모두 처리.
    
    Args:
        images: 단일 이미지 bytes 또는 여러 이미지 bytes 리스트.
                PNG/JPEG/WEBP 등 PIL이 감지 가능한 형식.
        page_names: 최종 JSON의 meta.source_images에 들어갈 식별자.
                    단일 입력엔 str, 멀티엔 list[str]. None이면 자동 생성.
        mime_type: MIME 타입 (예: "image/png"). PIL이 자동 감지하므로 무시되지만,
                   백엔드 인터페이스 일관성 위해 받음. None 허용.
        doc_type: 문서 종류. 프론트→백엔드에서 명시되어 내려옴.
                  - "checkup" (기본): 건강검진 결과지 (16 measurements + 2 lifestyle)
                  - "med_label": 약봉투 (medications 리스트)
    
    Returns:
        OCR JSON dict. doc_type에 따라 스키마 다름.
        
        doc_type="checkup" (v1.0):
        {
          "meta": {
            "source_images": [...],
            "page_count": N,
            "exam_date": ... or null,
            "patient_birth": ... or null,
            "patient_gender": ... or null,
            "patient_name": ... or null,
            "hospital": ... or null,
            "ocr_confidence": float
          },
          "measurements": {...},
          "lifestyle": {...}
        }
        
        doc_type="med_label" (v0.1):
        {
          "meta": {
            "source_images": [...],
            "page_count": N,
            "dispense_date": ... or null,
            "patient_name": ... or null,
            "patient_birth": ... or null,
            "pharmacy_name": ... or null,
            "prescriber": ... or null,
            "ocr_confidence": float
          },
          "medications": [...],
          "medication_count_declared": ... or null
        }
    
    Raises:
        ValueError: 입력이 비었거나 이미지 로드 실패 (손상된 bytes 등) 또는 doc_type 미지원
        VisionBackendError: LLM 호출 실패
    """
    # ----------------------------------------
    # 입력 정규화 (단일 → 리스트)
    # ----------------------------------------
    if isinstance(images, bytes):
        images_list = [images]
    elif isinstance(images, list):
        images_list = images
    else:
        raise ValueError(
            f"images는 bytes 또는 list[bytes]여야 합니다. "
            f"받은 타입: {type(images).__name__}"
        )
    
    if not images_list:
        raise ValueError("처리할 이미지가 없습니다.")
    
    # page_names 정규화
    if page_names is None:
        page_names_list = [f"page_{i + 1}" for i in range(len(images_list))]
    elif isinstance(page_names, str):
        page_names_list = [page_names]
    elif isinstance(page_names, list):
        page_names_list = page_names
    else:
        raise ValueError(
            f"page_names는 str, list[str], 또는 None이어야 합니다. "
            f"받은 타입: {type(page_names).__name__}"
        )
    
    if len(page_names_list) != len(images_list):
        raise ValueError(
            f"page_names 길이({len(page_names_list)})와 "
            f"images 길이({len(images_list)})가 다릅니다."
        )
    
    # ----------------------------------------
    # 페이지별 처리 (doc_type 분기)
    # ----------------------------------------
    if doc_type == "checkup":
        return _process_checkup(images_list, page_names_list)
    elif doc_type == "med_label":
        return _process_med_label(images_list, page_names_list)
    else:
        raise ValueError(
            f"지원하지 않는 doc_type: {doc_type!r}. "
            f"'checkup' 또는 'med_label' 사용."
        )


def _process_checkup(
    images_list: list[bytes],
    page_names_list: list[str],
) -> dict[str, Any]:
    """검진지 흐름 — 기존 로직 그대로 (회귀 위험 0)."""
    page_results = []
    for idx, (image_bytes, page_name) in enumerate(zip(images_list, page_names_list)):
        try:
            image = Image.open(BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            raise ValueError(
                f"페이지 {idx + 1} ({page_name}) 이미지 로드 실패 "
                f"({type(e).__name__}): {e}"
            )

        # 기울기 보정 — 뒤따르는 표 검출이 «가로선/세로선 opening»이라 문서가 기울면
        # 격자를 통째로 못 잡는다. 폰으로 찍으면 항상 기운다.
        # 반듯하면 손대지 않고, 어떤 입력에도 예외를 던지지 않는다(원본 통과).
        image, orient = image_utils.correct_document_orientation(image)
        if orient["method"] != "none":
            print(f"  기울기 보정: {orient['method']} {orient['angle']}도 ({page_name})")

        page_result = process_single_page_from_image(
            image=image,
            page_name=page_name,
            page_index=idx,
            total=len(images_list),
            save_debug=False,
        )
        page_results.append(page_result)
    
    merger = PageMerger()
    merged = merger.merge(page_results)
    return merged.to_final_json()


def _process_med_label(
    images_list: list[bytes],
    page_names_list: list[str],
) -> dict[str, Any]:
    """약봉투 흐름 — splitter 없이 단일 호출.
    
    각 이미지를 독립된 약봉투로 처리. medications는 누적.
    """
    pipeline = MedLabelPipeline()
    page_results = []
    for idx, (image_bytes, page_name) in enumerate(zip(images_list, page_names_list)):
        try:
            image = Image.open(BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            raise ValueError(
                f"페이지 {idx + 1} ({page_name}) 이미지 로드 실패 "
                f"({type(e).__name__}): {e}"
            )
        
        print(f"\n{'=' * 60}\n  [약봉투 {idx + 1}/{len(images_list)}] {page_name}\n{'=' * 60}")
        page_result = pipeline.process(image=image, page_name=page_name)
        page_results.append(page_result)
    
    merger = MedLabelMerger()
    merged = merger.merge(page_results)
    return merged.to_final_json()
