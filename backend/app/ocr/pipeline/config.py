"""
전역 설정값.

향후 구현체 교체 시 이 파일의 *_TYPE 값만 바꾸면 됨.
"""

from pathlib import Path

# ----------------------------------------
# Ollama 설정
# ----------------------------------------

OLLAMA_HOST = "http://localhost:11434"
OLLAMA_MODEL_VISION = "qwen2.5vl:7b-q8_0"
OLLAMA_TIMEOUT_SEC = 300  # 5분
OLLAMA_OPTIONS = {
    "temperature": 0,
    "top_p": 0.9,
    "num_ctx": 8192,
    "repeat_penalty": 1.0,
    "seed": 42,
}

# ----------------------------------------
# Splitter 구현체 선택
# ----------------------------------------

# 전체 splitter 타입: "hybrid" | "llm"
#   - "hybrid": 구조 검출기 + 그래픽 검출기 조합 (권장)
#   - "llm":    LLM 통째 분할 (폴백/비교용)
SPLITTER_TYPE = "hybrid"

# hybrid splitter의 세부 컴포넌트:

# 구조 검출기(표/체크박스): "opencv" | "none"
#   - "opencv": OpenCV로 표 격자 및 체크박스 검출
#   - "none":   구조 검출 비활성화
STRUCTURAL_DETECTOR_TYPE = "opencv"

# 그래픽 검출기(막대그래프/자/게이지): "none" | "llm"
#   - "none":  그래픽 검출 비활성화 (속도 우선)
#   - "llm":   LLM으로 표 영역의 그래픽 포함 여부 분류 + 표 외 그래픽 검출
GRAPHIC_DETECTOR_TYPE = "llm"

# ----------------------------------------
# Pipeline 구현체 선택
# ----------------------------------------

# 체크박스 파이프라인: "vision_llm" (향후 "opencv" 추가 가능)
CHECKBOX_PIPELINE_TYPE = "vision_llm"

# ----------------------------------------
# 디렉토리
# ----------------------------------------

PROJECT_ROOT = Path(__file__).parent
DEBUG_DIR = PROJECT_ROOT / "debug"
# ----------------------------------------
# 이미지 전처리 (업스케일링)
# ----------------------------------------
# 작은 이미지(저해상도)는 비전 모델이 글자를 잘 못 읽음.
# 일정 크기 이하면 자동 업스케일링.

# 이 값보다 짧은 변이 작으면 업스케일링 적용
# 주의: crop된 영역의 짧은 변 기준 (전체 이미지 아님).
#       900으로 설정하여 graphic_test(595x841)만 업스케일되도록 함.
UPSCALE_THRESHOLD_PX = 900

# 업스케일링 후 목표 짧은 변 길이
UPSCALE_TARGET_PX = 2400

# 배율 상한 (가로로 매우 긴 영역에서 폭주 방지)
# 짧은 변 기준 배율이 이 값을 넘지 못함. 예: 4.0이면 최대 4배까지만.
UPSCALE_MAX_SCALE = 4.0

# 긴 변 픽셀 상한 (메모리/속도 보호)
# 업스케일 후 긴 변이 이 값을 넘으면 배율을 더 줄임.
UPSCALE_MAX_LONG_SIDE = 3200

# 업스케일링 시 보간 방식: "lanczos" (느리지만 품질 좋음) | "bicubic" | "nearest"
UPSCALE_METHOD = "lanczos"

# ----------------------------------------
# 좌표 검증 임계값
# ----------------------------------------

MIN_REGION_RATIO = 0.01  # 1% 미만이면 경고
MAX_REGION_RATIO = 0.98  # 98% 초과면 경고

# ----------------------------------------
# 의학적 범위 검증 (validator 단계에서 사용)
# ----------------------------------------

MEDICAL_RANGES = {
    "height":            (100, 250),    # cm
    "weight":            (20, 300),     # kg
    "waist":             (40, 200),     # cm
    "sbp":               (60, 250),     # mmHg
    "dbp":               (30, 200),     # mmHg
    "fbs":               (30, 600),     # mg/dL
    "total_cholesterol": (50, 600),     # mg/dL
    "ldl":               (10, 400),     # mg/dL
    "hdl":               (10, 200),     # mg/dL
    "tg":                (20, 1500),    # mg/dL
    "hb":                (3, 25),       # g/dL
    "creatinine":        (0.1, 15),     # mg/dL
    "ast":               (1, 2000),     # IU/L
    "alt":               (1, 2000),     # IU/L
    "ggt":               (1, 2000),     # IU/L
}

# ----------------------------------------
# 항목 그룹 (호출 분리용)
# ----------------------------------------
# 표 파이프라인은 항목을 두 그룹으로 나눠 각각 한 번씩 호출.
# 각 그룹은 양식의 표현 방식(표/체크박스/그래픽)과 무관하게 항목 단위로 정의.
# 한 호출의 프롬프트가 짧아져 모델 집중도가 향상되며,
# 한 호출이 실패해도 다른 호출 결과는 보존됨.

ITEM_GROUP_A = [
    # 신체계측
    "height", "weight", "waist",
    # 혈압
    "sbp", "dbp",
    # 혈당 + 일반혈액 + 신장
    "fbs", "hb", "creatinine",
    # 소변
    "urine_protein",
]

ITEM_GROUP_B = [
    # 지질 4종
    "total_cholesterol", "ldl", "hdl", "tg",
    # 간기능 3종
    "ast", "alt", "ggt",
    # 생활습관 (lifestyle)
    "smoking", "drinking",
]
