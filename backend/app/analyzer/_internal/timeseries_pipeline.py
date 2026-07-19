"""시계열 통합 진입점 (백엔드 ↔ 분석 모듈 결합점).

분석쪽이 따로 둔 3개 모듈을 한 번에 호출해 통합 결과를 반환한다.
백엔드는 이 파일의 run_timeseries_pipeline 한 함수만 호출하면 된다.

3단계 체인:
    1. analyze_timeseries        — 본인 변화량 vs 모집단 평균 변화량
    2. analyze_full_timeseries   — 양방향 항목 정상/비정상 방향 판단
    3. generate_insight          — 자연어 인사이트 (1, 2 결과 + basic_report 종합)
"""
from __future__ import annotations

from typing import Any

from .timeseries_analysis import analyze_timeseries
from .timeseries_full import analyze_full_timeseries
from .insight_generator import generate_insight


def run_timeseries_pipeline(
    user_info: dict[str, Any],
    history: list[dict[str, Any]],
    basic_report: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """사용자의 모든 회차 검진 데이터 → 시계열 + 인사이트 통합 결과.

    Args:
        user_info: {"user_id", "name", "gender", "birth_year", ...}
        history:   [{"year": int, "checkup": {"BMI": ..., ...}}, ...]
                   백엔드가 DB(checkup_records + analysis_results)에서 조립.
        basic_report: 최근 검진의 basic_report (인사이트 생성용).
                      없으면 인사이트 단계 생략.

    Returns:
        통합 결과 dict:
        {
            "available": bool,                       # 시계열 분석 가능 여부 (history >= 2)
            "year_range": "2022~2024 (2년간)",
            "metrics": {...},                        # analyze_timeseries 결과
            "highlights": [...],
            "exam_pattern": {...},
            "full_timeseries": {...},                # analyze_full_timeseries 결과
            "insight": {...},                        # generate_insight 결과 (basic_report 있을 때만)
            "_meta": {
                "user_id": str,
                "history_count": int,
            }
        }

        history < 2 이면:
        {
            "available": false,
            "reason": "검진 데이터 부족 (현재 N개, 시계열은 2회 이상 필요)",
            "exam_pattern": {...},                   # 다음 검진 예정 등 안내
            "_meta": {"user_id": str, "history_count": int}
        }
    """
    history_count = len(history) if history else 0

    # Step 1: 본인 변화량 분석
    ts_result = analyze_timeseries(user_info, history)

    # history 부족이면 여기서 종료 (분석 모듈이 error 필드 + exam_pattern 반환함)
    if ts_result.get("error"):
        return {
            "available": False,
            "reason": ts_result["error"],
            "exam_pattern": ts_result.get("exam_pattern"),
            "_meta": {
                "user_id": user_info.get("user_id"),
                "history_count": history_count,
            },
        }

    # Step 2: 양방향 항목 방향 판단
    full_result = analyze_full_timeseries(user_info, history)

    # Step 3: 자연어 인사이트 (basic_report 있을 때만)
    insight_result = None
    if basic_report:
        insight_result = generate_insight(user_info, basic_report, ts_result)

    return {
        "available": True,
        "year_range": ts_result.get("year_range"),
        "years": ts_result.get("years"),
        "current_age": ts_result.get("current_age"),
        "metrics": ts_result.get("metrics"),
        "highlights": ts_result.get("highlights"),
        "exam_pattern": ts_result.get("exam_pattern"),
        "full_timeseries": full_result if not full_result.get("error") else None,
        "insight": insight_result if insight_result and not insight_result.get("error") else None,
        "_meta": {
            "user_id": user_info.get("user_id"),
            "user_name": user_info.get("name"),
            "history_count": history_count,
            "analyzed_at": ts_result.get("_meta", {}).get("analyzed_at"),
        },
    }
