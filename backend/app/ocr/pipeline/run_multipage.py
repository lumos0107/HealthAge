"""
멀티 페이지 검진지 처리 진입점.

같은 환자의 여러 페이지를 입력으로 받아 통합 JSON 생성.

사용법:
  python run_multipage.py page1.png page2.png page3.png    # 파일 나열
  python run_multipage.py 환자_검진/                        # 폴더
  python run_multipage.py single_page.png                  # 단일 파일도 가능

지원 이미지 형식: .jpg, .jpeg, .png, .webp, .bmp
폴더 입력 시: 폴더 안의 모든 이미지를 파일명 알파벳 순으로 처리
              (팀 결정 2: 페이지 순서 상관없음)
"""

from __future__ import annotations
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.ocr.pipeline import config
from PIL import Image
from app.ocr.pipeline.splitter import get_splitter
from app.ocr.pipeline.pipelines import get_pipeline_for_region
from app.ocr.pipeline.pipelines.table_pipeline import page_has_measurement_values
from app.ocr.pipeline.utils import image_utils, ollama_client
from app.ocr.pipeline.utils.schemas import PipelineResult, RegionType
from app.ocr.pipeline.merger import PageMerger, PageResult


SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def section(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print('=' * 60)


# ============================================================
# 입력 처리: 파일/폴더 → 이미지 경로 리스트
# ============================================================

def collect_image_paths(args: list[str]) -> list[Path]:
    """명령줄 인자를 받아 처리할 이미지 경로 리스트로 변환.
    
    - 단일 파일: 그대로 [Path]
    - 여러 파일: 입력 순서대로 [Path, Path, ...]
    - 폴더: 폴더 안의 모든 이미지를 파일명 순으로 [Path, ...]
    """
    if not args:
        raise ValueError("입력 경로가 없습니다.")
    
    paths: list[Path] = []
    
    for arg in args:
        p = Path(arg).resolve()
        if not p.exists():
            raise FileNotFoundError(f"경로를 찾을 수 없습니다: {p}")
        
        if p.is_dir():
            # 폴더: 안의 이미지 모두 (알파벳 순)
            images_in_dir = sorted([
                f for f in p.iterdir()
                if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS
            ])
            if not images_in_dir:
                print(f"[경고] 폴더에 이미지가 없습니다: {p}")
            paths.extend(images_in_dir)
        elif p.is_file():
            if p.suffix.lower() not in SUPPORTED_EXTS:
                raise ValueError(
                    f"지원하지 않는 형식: {p.suffix}\n"
                    f"지원 형식: {', '.join(SUPPORTED_EXTS)}"
                )
            paths.append(p)
        else:
            raise ValueError(f"파일도 폴더도 아닌 경로: {p}")
    
    if not paths:
        raise ValueError("처리할 이미지가 없습니다.")
    
    return paths


# ============================================================
# 단일 페이지 처리
# ============================================================

def process_single_page(image_path: Path, page_index: int, total: int) -> PageResult:
    """한 페이지를 splitter + pipeline으로 처리 (path 받는 버전 — CLI용)."""
    image = image_utils.load_image(image_path)
    return _process_page_core(
        image=image,
        page_name=image_path.name,
        page_stem=image_path.stem,
        page_index=page_index,
        total=total,
        save_debug=True,
    )


def process_single_page_from_image(
    image: "Image.Image",
    page_name: str,
    page_index: int = 0,
    total: int = 1,
    save_debug: bool = False,
) -> PageResult:
    """한 페이지를 splitter + pipeline으로 처리 (PIL Image 받는 버전 — 백엔드 통합용).
    
    Args:
        image: 이미 로드된 PIL Image
        page_name: source_image 식별자 (예: "uploaded_image.png")
        page_index: 멀티페이지 중 몇 번째 (0부터). 단일이면 0.
        total: 전체 페이지 수. 단일이면 1.
        save_debug: 디버그 이미지/JSON을 디스크에 저장할지.
            CLI에선 True, 백엔드에선 False 권장 (멀티유저 충돌 회피).
    """
    # page_stem은 디버그 폴더명용. page_name에서 확장자 제거.
    page_stem = Path(page_name).stem if page_name else f"page_{page_index + 1}"
    return _process_page_core(
        image=image,
        page_name=page_name,
        page_stem=page_stem,
        page_index=page_index,
        total=total,
        save_debug=save_debug,
    )


def _process_page_core(
    image: "Image.Image",
    page_name: str,
    page_stem: str,
    page_index: int,
    total: int,
    save_debug: bool,
) -> PageResult:
    """한 페이지 처리 — 핵심 로직 (PIL Image 기반)."""
    section(f"[페이지 {page_index + 1}/{total}] {page_name}")
    
    # 디버그 폴더 (save_debug=True일 때만 생성)
    page_debug_dir = None
    if save_debug:
        page_debug_dir = config.DEBUG_DIR / f"page_{page_index + 1:02d}_{page_stem}"
        page_debug_dir.mkdir(parents=True, exist_ok=True)
    
    # splitter
    splitter = get_splitter()
    if hasattr(splitter, "debug_dir") and page_debug_dir is not None:
        splitter.debug_dir = page_debug_dir
    if hasattr(splitter, "save_debug_images"):
        splitter.save_debug_images = save_debug
    
    t0 = time.time()
    try:
        # PIL Image 직접 전달 (splitter가 path/PIL 둘 다 받음)
        split_result = splitter.split(image)
    except Exception as e:
        print(f"[FAIL] 분할 실패: {type(e).__name__}: {e}")
        return PageResult(
            source_image=page_name,
            pipeline_debug={"error": f"split_failed: {e}"},
        )
    
    split_elapsed = time.time() - t0
    print(f"  분할 완료: {split_elapsed:.2f}초, {len(split_result.regions)}개 영역")

    # 페이지 단위 환각 게이트 — 종합소견/안내 페이지면 수치를 추출·보존하지 않는다.
    # 영역 단위 게이트만으론 페이지 일부 스트립이 "표처럼" 보여 통과하는 사례가 있었다.
    page_has_values, page_gate_debug = page_has_measurement_values(image)

    # 영역별 파이프라인 처리 → 페이지 단위로 병합
    page_measurements: dict = {}
    page_lifestyle: dict = {"smoking": None, "drinking": None}
    page_meta: dict = {}  # exam_date 등 (영역별 result.meta에서 누적)
    region_debugs: list = []
    # [step12] confidence 페이지 누적
    page_measurements_conf: dict = {}
    page_lifestyle_conf: dict = {}
    
    for i, region in enumerate(split_result.regions):
        pipeline = get_pipeline_for_region(region.region_type)
        if pipeline is None:
            print(f"  [영역 #{i}: {region.region_type.value}] 파이프라인 없음, 스킵")
            continue
        
        print(f"  [영역 #{i}: {region.region_type.value}] → {pipeline.name}")
        # 페이지 게이트 결과 주입 (지원하는 파이프라인만)
        if hasattr(pipeline, "extract_measurements"):
            pipeline.extract_measurements = page_has_values
        cropped = image_utils.crop_region(image, region.bbox)
        
        # crop된 영역이 작으면 업스케일 (파이프라인이 더 잘 읽도록)
        cropped, region_scale = image_utils.upscale_if_small(
            cropped,
            threshold_px=config.UPSCALE_THRESHOLD_PX,
            target_px=config.UPSCALE_TARGET_PX,
            method=config.UPSCALE_METHOD,
            max_scale=config.UPSCALE_MAX_SCALE,
            max_long_side=config.UPSCALE_MAX_LONG_SIDE,
        )
        if region_scale != 1.0:
            print(f"    업스케일 적용: 배율 {region_scale:.2f} "
                  f"→ {cropped.size[0]}x{cropped.size[1]}")
        
        try:
            result = pipeline.process(cropped, region)
        except Exception as e:
            print(f"    [FAIL] {type(e).__name__}: {e}")
            region_debugs.append({
                "region_index": i,
                "region_type": region.region_type.value,
                "error": f"{type(e).__name__}: {e}",
            })
            continue
        
        # 페이지 내 영역 결과 누적 (한 페이지에 같은 항목이 두 번 나오기 어려우니 단순 update)
        for k, v in result.measurements.items():
            if v.get("value") is not None or v.get("code") is not None:
                page_measurements.setdefault(k, v)
        
        for k, v in result.lifestyle.items():
            if v is not None and page_lifestyle.get(k) is None:
                page_lifestyle[k] = v
        
        # [step12] confidence도 같이 누적 — measurements/lifestyle와 같은 키 정책 (먼저 발견 우선)
        for k, v in (result.measurements_confidence or {}).items():
            page_measurements_conf.setdefault(k, v)
        for k, v in (result.lifestyle_confidence or {}).items():
            page_lifestyle_conf.setdefault(k, v)
        
        # meta 누적 (exam_date 등) — 영역별로 들어올 수 있음
        # 정책 (결정 B): null 키도 보존 — 백엔드가 "검진지에 없음 vs OCR 실패"를 구분
        for k, v in (result.meta or {}).items():
            if k in ("source_pipeline", "graphic_mode", "region_source"):
                continue  # 영역별 메타는 페이지 meta에 올리지 않음
            if k not in page_meta:
                # 처음 보는 키 — null이든 아니든 저장
                page_meta[k] = v
            elif page_meta[k] is None and v is not None:
                # 기존이 null인데 의미 있는 값이 옴 → 덮어쓰기
                page_meta[k] = v
            # 그 외 (기존 valid + val=None, 또는 둘 다 None, 또는 둘 다 같음): 변경 없음
        
        region_debugs.append({
            "region_index": i,
            "region_type": region.region_type.value,
            "pipeline": pipeline.name,
            "debug": result.debug,
        })
    
    # 페이지 게이트가 "수치 없는 페이지"로 판정하면 어떤 영역에서 나왔든 수치를 버린다.
    # (metadata 파이프라인 등 게이트를 모르는 경로로 새어 들어온 값까지 확실히 차단)
    if not page_has_values:
        discarded = sum(
            1 for v in page_measurements.values()
            if v.get("value") is not None or v.get("code") is not None
        )
        if discarded:
            print(f"  [페이지 게이트] 수치 {discarded}개 폐기 (환각 의심)")
        page_measurements = {}
        page_lifestyle = {"smoking": None, "drinking": None}
        page_measurements_conf = {}
        page_lifestyle_conf = {}

    return PageResult(
        source_image=page_name,
        measurements=page_measurements,
        lifestyle=page_lifestyle,
        meta=page_meta,
        pipeline_debug={
            "split_elapsed_sec": round(split_elapsed, 2),
            "region_count": len(split_result.regions),
            "page_gate": page_gate_debug,
            "regions": region_debugs,
        },
        # [step12] confidence 전달
        measurements_confidence=page_measurements_conf,
        lifestyle_confidence=page_lifestyle_conf,
    )


# ============================================================
# 메인
# ============================================================

def main(args: list[str]) -> None:
    section("멀티 페이지 검진지 처리")
    
    # 1) 입력 수집
    try:
        image_paths = collect_image_paths(args)
    except (ValueError, FileNotFoundError) as e:
        print(f"[FAIL] {e}")
        sys.exit(1)
    
    print(f"처리할 페이지 수: {len(image_paths)}")
    for i, p in enumerate(image_paths, 1):
        print(f"  {i}. {p.name}")
    
    # 2) 사전 점검
    try:
        ollama_client.check_model_installed(config.OLLAMA_MODEL_VISION)
        print(f"\n[OK] 모델 사용 가능: {config.OLLAMA_MODEL_VISION}")
    except (ollama_client.OllamaServerError,
            ollama_client.OllamaModelNotFoundError) as e:
        print(f"[FAIL] {e}")
        sys.exit(1)
    
    # 3) 페이지별 처리
    overall_start = time.time()
    pages: list[PageResult] = []
    
    for idx, image_path in enumerate(image_paths):
        page_result = process_single_page(image_path, idx, len(image_paths))
        pages.append(page_result)
    
    total_elapsed = time.time() - overall_start
    
    # 4) 병합
    section("페이지 결과 병합")
    merger = PageMerger()
    merged = merger.merge(pages)
    
    print(f"병합 완료:")
    print(f"  measurements: {len(merged.measurements)}개")
    print(f"  lifestyle:    {sum(1 for v in merged.lifestyle.values() if v is not None)}개")
    print(f"  충돌:         {len(merged.conflicts)}건")
    
    if merged.conflicts:
        print(f"\n[충돌 상세]")
        for c in merged.conflicts:
            print(f"  • {c.path}")
            print(f"    채택: {c.chosen_value} (from {c.chosen_from})")
            print(f"    거부: {c.rejected_value} (from {c.rejected_from})")
    
    # 5) 최종 출력
    final = merged.to_final_json()
    
    section("최종 결과")
    print(json.dumps(final, ensure_ascii=False, indent=2))
    
    # 6) 통계
    print(f"\n[요약]")
    print(f"  총 처리 시간:  {total_elapsed:.1f}초 ({total_elapsed / len(pages):.1f}초/페이지)")
    print(f"  measurements: {len(final.get('measurements', {}))}/16")
    print(f"  lifestyle:    {len(final.get('lifestyle', {}))}/2")
    print(f"  충돌:         {len(merged.conflicts)}건")
    
    # 7) 저장
    output_path = config.DEBUG_DIR / "multipage_result.json"
    output_path.write_text(
        json.dumps(final, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\n[저장] 최종 결과: {output_path}")
    
    # 디버그 로그 (모든 페이지의 모든 영역 정보)
    debug_path = config.DEBUG_DIR / "multipage_debug.json"
    debug_path.write_text(
        json.dumps({
            "source_images": merged.source_images,
            "total_elapsed_sec": round(total_elapsed, 2),
            "conflicts": [c.to_dict() for c in merged.conflicts],
            "per_page": merged.per_page_debug,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[저장] 디버깅 로그: {debug_path}")
    
    # 시각화 안내
    print(f"\n[페이지별 디버깅 자료]")
    for i, p in enumerate(image_paths, 1):
        page_dir = config.DEBUG_DIR / f"page_{i:02d}_{p.stem}"
        print(f"  페이지 {i}: {page_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법:")
        print("  python run_multipage.py <이미지1> [이미지2] [이미지3] ...")
        print("  python run_multipage.py <폴더경로>")
        print()
        print("예시:")
        print("  python run_multipage.py page1.png page2.png page3.png")
        print("  python run_multipage.py 환자A_검진/")
        print("  python run_multipage.py single.png")
        sys.exit(1)
    main(sys.argv[1:])
