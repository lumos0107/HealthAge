"""공통 권장사항의 조건 필터 — 재료가 있는데 안 쓰던 판단을 강제한다.

배경: 비흡연·비음주에 허리둘레만 초과한 사람에게도 "금연 클리닉 또는 의료진 상담을
권장합니다"가 붙었다. 흡연·음주 여부는 이미 user_groups에 판정돼 있는데 조건에 쓰지
않고 COMMON_RECOMMENDATIONS 5개를 무조건 전부 붙였기 때문이다.

여기서 강제하는 것:
  1. 금연은 현재 흡연자에게만 / 절주는 음주자에게만
  2. 나트륨 제한(1일 2,000mg)은 고혈압군에게만 — 효과크기가 고혈압군 기준인 지침 권고다
  3. 문진이 비어 '모르는' 상태는 '아니다'와 다르게 다룬다 — 빼되 왜 뺐는지 남긴다
"""
from __future__ import annotations

from app.analyzer._internal.pipeline import run_recommendations
from app.analyzer._internal.recommendation_generator import SODIUM_ITEM


def _group_analysis(**overrides) -> dict:
    """허리둘레 1개만 걸린 44세 남성 — 대사증후군 인자 1개라 공통 권장이 붙는 최소 조건."""
    base = {
        "user_id": "u1",
        "user_name": "테스트",
        "age": 44,
        "medications": {"hypertension": False, "diabetes": False, "dyslipidemia": False},
        "user_groups": {
            "g_obesity": False,
            "g_fatty_liver_suspect": False,
            "g_hypertension": False,
            "g_smoker_current": False,
            "g_smoker_former": False,
            "g_non_smoker": True,
            "g_drinker": False,
            "g_non_drinker": True,
        },
        "metabolic_syndrome_detail": {
            "count": 1,
            "evaluable": 5,
            "is_metabolic_syndrome": False,
            "factors": {
                "복부비만": {"met": True, "by_medication": False, "reason": "허리둘레 92cm"},
                "고혈압": {"met": False, "by_medication": False},
                "고혈당": {"met": False, "by_medication": False},
                "낮은 HDL": {"met": False, "by_medication": False},
                "고중성지방": {"met": False, "by_medication": False},
            },
        },
    }
    base.update(overrides)
    return base


def _categories(result: dict) -> list[str]:
    return [c["category"] for c in result["recommendations"]["common"]]


def _items_of(result: dict, category: str) -> list[str]:
    for c in result["recommendations"]["common"]:
        if c["category"] == category:
            return c["items"]
    return []


def _omitted_categories(result: dict) -> list[str]:
    return [o["category"] for o in result["recommendations"].get("omitted", [])]


# ── 1. 흡연 ────────────────────────────────────────────────────────────────
def test_비흡연자에게는_금연_권고가_붙지_않는다():
    result = run_recommendations(_group_analysis())
    assert "금연" not in _categories(result)


def test_현재_흡연자에게는_금연_권고가_붙는다():
    ga = _group_analysis()
    ga["user_groups"]["g_smoker_current"] = True
    ga["user_groups"]["g_non_smoker"] = False
    result = run_recommendations(ga)
    assert "금연" in _categories(result)


def test_과거_흡연자에게는_금연_권고가_붙지_않는다():
    ga = _group_analysis()
    ga["user_groups"]["g_smoker_former"] = True
    ga["user_groups"]["g_non_smoker"] = False
    result = run_recommendations(ga)
    assert "금연" not in _categories(result)


# ── 2. 음주 ────────────────────────────────────────────────────────────────
def test_비음주자에게는_절주_권고가_붙지_않는다():
    result = run_recommendations(_group_analysis())
    assert "절주 / 음주 관리" not in _categories(result)


def test_음주자에게는_절주_권고가_붙는다():
    ga = _group_analysis()
    ga["user_groups"]["g_drinker"] = True
    ga["user_groups"]["g_non_drinker"] = False
    result = run_recommendations(ga)
    assert "절주 / 음주 관리" in _categories(result)


# ── 3. 나트륨 ──────────────────────────────────────────────────────────────
def test_고혈압군이_아니면_나트륨_제한이_식사요법에_들어가지_않는다():
    result = run_recommendations(_group_analysis())
    assert "식사 요법" in _categories(result)
    assert SODIUM_ITEM not in _items_of(result, "식사 요법")


def test_고혈압군이면_나트륨_제한이_식사요법에_들어간다():
    ga = _group_analysis()
    ga["user_groups"]["g_hypertension"] = True
    result = run_recommendations(ga)
    assert SODIUM_ITEM in _items_of(result, "식사 요법")


def test_고혈압약_복용_중이면_나트륨_제한이_들어간다():
    """약으로 혈압이 잡혀 있어도 저염은 유지해야 하는 대상이다."""
    ga = _group_analysis()
    ga["medications"]["hypertension"] = True
    ga["user_groups"]["g_hypertension"] = True
    result = run_recommendations(ga)
    assert SODIUM_ITEM in _items_of(result, "식사 요법")


# ── 4. 문진이 비어 있을 때 ─────────────────────────────────────────────────
def test_흡연_문진이_없으면_금연을_빼고_이유를_남긴다():
    """'모른다'와 '아니다'는 다르다. 단정하지 않되 조용히 사라지게 두지도 않는다."""
    ga = _group_analysis()
    for k in ("g_smoker_current", "g_smoker_former", "g_non_smoker"):
        del ga["user_groups"][k]
    result = run_recommendations(ga)
    assert "금연" not in _categories(result)
    assert "금연" in _omitted_categories(result)


def test_음주_문진이_없으면_절주를_빼고_이유를_남긴다():
    ga = _group_analysis()
    for k in ("g_drinker", "g_non_drinker"):
        del ga["user_groups"][k]
    result = run_recommendations(ga)
    assert "절주 / 음주 관리" not in _categories(result)
    assert "절주 / 음주 관리" in _omitted_categories(result)


def test_비흡연자로_판정된_경우에는_이유를_남기지_않는다():
    """답이 '아니오'인 것은 빠지는 게 당연하다 — 노트로 화면을 채우지 않는다."""
    result = run_recommendations(_group_analysis())
    assert "금연" not in _omitted_categories(result)
    assert "절주 / 음주 관리" not in _omitted_categories(result)


def test_고혈압군이_아니면_저염을_뺀_이유를_남긴다():
    result = run_recommendations(_group_analysis())
    omitted = _omitted_categories(result)
    assert any("저염" in o or "나트륨" in o for o in omitted)


# ── 5. 무회귀 ──────────────────────────────────────────────────────────────
def test_체중조절과_운동요법은_조건과_무관하게_유지된다():
    result = run_recommendations(_group_analysis())
    cats = _categories(result)
    assert "체중 조절" in cats
    assert "운동 요법" in cats


def test_위험요인이_하나도_없으면_공통_권장이_비어_있다():
    ga = _group_analysis()
    ga["metabolic_syndrome_detail"]["count"] = 0
    ga["metabolic_syndrome_detail"]["factors"]["복부비만"]["met"] = False
    result = run_recommendations(ga)
    assert _categories(result) == []
    assert _omitted_categories(result) == []
