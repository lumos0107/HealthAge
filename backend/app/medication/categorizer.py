"""HIRA 투약이력 → 약물 카테고리 boolean dict 변환.

대사증후군 약물 결합 연산용. 다음 3개 카테고리 boolean 반환:
  - hypertension (고혈압약)
  - diabetes (당뇨약)
  - dyslipidemia (이상지질혈증약)

복용 판정 로직 (하이브리드):
  1. 정확 윈도우: dispensed_date + total_days >= today → 복용 중
  2. 백업 윈도우: 최근 60일 안에 처방받았으면 복용 중 (만성질환 가정)

매핑 테이블: backend/data/drug_categories.json
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 매핑 테이블 위치
_CATEGORIES_PATH = Path(__file__).resolve().parents[2] / "data" / "drug_categories.json"

# 백업 윈도우 (정확 윈도우 빗나간 경우, 만성질환 가정)
_BACKUP_WINDOW_DAYS = 60

# KST 시간대 (HIRA dispensed_date는 한국 기준)
_KST = timezone(timedelta(hours=9))

# 카테고리 캐시 (모듈 로드 시 1회만 읽음)
_categories_cache: dict[str, list[str]] | None = None


def _load_categories() -> dict[str, list[str]]:
    """drug_categories.json을 읽어 카테고리별 평탄화된 키워드 리스트로 변환.

    Returns:
        {
          "hypertension": ["enalapril", "ramipril", ..., "metoprolol", ...],
          "diabetes": ["metformin", "sitagliptin", ...],
          "dyslipidemia": ["atorvastatin", ...],
        }
    """
    global _categories_cache
    if _categories_cache is not None:
        return _categories_cache

    if not _CATEGORIES_PATH.exists():
        raise FileNotFoundError(
            f"약물 카테고리 매핑 파일 없음: {_CATEGORIES_PATH}"
        )

    with open(_CATEGORIES_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    flat: dict[str, list[str]] = {}
    for category in ("hypertension", "diabetes", "dyslipidemia"):
        subcategories = raw.get(category, {})
        keywords: list[str] = []
        for drugs in subcategories.values():
            keywords.extend(d.lower() for d in drugs)
        flat[category] = keywords

    _categories_cache = flat
    logger.info(
        "drug_categories 로드: hypertension=%d, diabetes=%d, dyslipidemia=%d",
        len(flat["hypertension"]),
        len(flat["diabetes"]),
        len(flat["dyslipidemia"]),
    )
    return flat


def _today_kst() -> date:
    """오늘 날짜 (KST 기준)."""
    return datetime.now(_KST).date()


def _parse_dispensed_date(s: str | None) -> date | None:
    """YYYYMMDD 문자열 → date. 실패 시 None."""
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y%m%d").date()
    except ValueError:
        return None


def _is_on_medication(
    dispensed_date: date,
    total_days: int | None,
    today: date,
) -> bool:
    """하이브리드 복용 판정.

    Args:
        dispensed_date: 조제일
        total_days: 처방일수 (None이면 백업 윈도우만 평가)
        today: 오늘 (테스트용 주입 가능)

    Returns:
        True: 복용 중 (정확 또는 백업 윈도우 충족)
        False: 복용 안 함
    """
    # 정확 윈도우
    if total_days is not None and total_days > 0:
        end_date = dispensed_date + timedelta(days=total_days)
        if today <= end_date:
            return True

    # 백업 윈도우 (만성질환 처방 주기 가정)
    days_since = (today - dispensed_date).days
    if 0 <= days_since <= _BACKUP_WINDOW_DAYS:
        return True

    return False


def _match_category(
    ingredient_en: str,
    categories: dict[str, list[str]],
) -> str | None:
    """ingredient_en이 어떤 카테고리에 속하는지 판정.

    Returns:
        "hypertension" | "diabetes" | "dyslipidemia" | None (매칭 없음)
    """
    if not ingredient_en:
        return None

    text = ingredient_en.lower()

    # 카테고리별로 키워드 부분 일치 검사
    for category, keywords in categories.items():
        for keyword in keywords:
            if keyword in text:
                return category
    return None


def categorize_medications(
    records: list[dict[str, Any]],
    today: date | None = None,
) -> dict[str, bool]:
    """HIRA 투약이력 → 복용 중 약물 카테고리 dict.

    Args:
        records: medication_records 테이블에서 조회한 행 리스트.
                 각 행은 최소 {dispensed_date, ingredient_en, total_days} 포함.
        today: 평가 기준일 (None이면 오늘 KST).

    Returns:
        {"hypertension": bool, "diabetes": bool, "dyslipidemia": bool}

    Note:
        한 행이라도 카테고리 + 복용 중 충족하면 True.
        ingredient_en이 비어있거나 매칭 안 되는 행은 무시.
    """
    if today is None:
        today = _today_kst()

    categories = _load_categories()
    result = {
        "hypertension": False,
        "diabetes": False,
        "dyslipidemia": False,
    }

    for row in records:
        ingredient_en = row.get("ingredient_en") or ""
        category = _match_category(ingredient_en, categories)
        if category is None:
            continue

        # 이미 True인 카테고리는 더 볼 필요 없음
        if result[category]:
            continue

        dispensed = _parse_dispensed_date(row.get("dispensed_date"))
        if dispensed is None:
            continue

        total_days = row.get("total_days")
        if isinstance(total_days, (int, float)):
            total_days = int(total_days)
        else:
            total_days = None

        if _is_on_medication(dispensed, total_days, today):
            result[category] = True

    return result


def has_any_records(records: list[dict[str, Any]]) -> bool:
    """HIRA 이력이 존재하는지 (= medications_known flag).

    빈 리스트면 False (= 약물 정보 없음, 분석 시 medications 미반영).
    """
    return len(records) > 0