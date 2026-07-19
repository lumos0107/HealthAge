"""분석 모듈 진입점 (1B 패턴 — 단순 import).

라우터는 항상 이 모듈만 import한다:

    from app.analyzer import analyze
    result = await analyze(ocr_json, user_info)

────────────────────────────────────────────────────────────────────
분리 시점 작업 (미래):
    이 파일의 내용을 HTTP 호출 함수로 교체하면 끝.
    라우터 코드 한 줄도 안 바뀐다.

    교체 예시:
        import os, httpx
        ANALYZER_URL = os.environ["ANALYZER_SERVICE_URL"]
        async def analyze(ocr_json, user_info):
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{ANALYZER_URL}/analyze",
                    json={"ocr_json": ocr_json, "user_info": user_info},
                )
                resp.raise_for_status()
            return resp.json()
────────────────────────────────────────────────────────────────────

지금은 _internal/의 동기 함수를 async로 감싸기만 한다.
이렇게 두면 분리 후 진짜 HTTP 호출이 되어도 라우터의 `await` 표현은 그대로다.
"""
from __future__ import annotations

from typing import Any

# ⚠️ _internal/의 함수를 import. 이 import는 패키지 내부라 OK (격리 규칙 위반 아님).
from app.analyzer._internal.pipeline import run_full_pipeline

from app.analyzer._internal.pipeline import run_full_pipeline
from app.analyzer._internal.timeseries_pipeline import run_timeseries_pipeline

# 분석 모듈 버전 — analysis_results.analyzer_version에 기록됨.
# _internal/의 코드 변경 시 같이 올린다.
ANALYZER_VERSION = "0.1.0"


async def analyze(
    ocr_json: dict[str, Any],
    user_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """OCR JSON → 기본 리포트 + 종합 평가.

    Args:
        ocr_json: OCR이 내놓은 dict (검수된 형태).
        user_info: {"user_id", "name", "gender", "birth_year", ...} 등.

    Returns:
        {
            "basic_report": {...},
            "comprehensive": {...},
        }

    Raises:
        ValueError: 필수 정보 누락, OCR 파싱 실패 등.
    """
    # 분리 후엔 여기가 await client.post(...) 가 됨.
    # 지금은 동기 함수를 그대로 부른다.
    return run_full_pipeline(ocr_json, user_info)

async def analyze_timeseries(
    user_info: dict[str, Any],
    history: list[dict[str, Any]],
    basic_report: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """여러 회차 검진 → 시계열 + 인사이트 통합 분석.

    Args:
        user_info: {"user_id", "name", "gender", "birth_year", ...}
        history:   [{"year": int, "checkup": {"BMI": ..., ...}}, ...]
        basic_report: 최근 검진의 basic_report (인사이트 생성용, 옵션)

    Returns:
        시계열 통합 결과 dict.
        history < 2 이면 {"available": false, "reason": "...", ...} 반환.
    """
    return run_timeseries_pipeline(user_info, history, basic_report)

__all__ = ["analyze", "analyze_timeseries", "ANALYZER_VERSION"]