"""_internal의 eGFR 계산이 app/renal/gfr.py와 항상 같은 값을 내는지 고정한다.

배경: calculators.py가 `from app.renal.gfr import calculate_egfr`를 하고 있어서
_internal/ 격리 규칙(test_analyzer_isolation)을 깨고 있었다. 분석 모듈을 별도
서비스로 떼어낼 때 app.* 의존이 남으면 작업이 폭증한다.

주입으로 풀면 run_full_pipeline → run_group_analysis → additional_calculators →
what_if 까지 시그니처 네 곳이 바뀐다. CKD-EPI 2021은 발표된 5줄짜리 공식이라
_internal 안에 순수 함수로 두는 편이 낫다고 판단했다.

대신 «두 벌이 갈라지는 것»이 이 선택의 유일한 위험이므로, 그걸 이 테스트가 막는다.
한쪽만 고치면 여기서 깨진다.
"""
from __future__ import annotations

import pytest

from app.analyzer._internal.calculators import ckd_epi_2021
from app.renal.gfr import Sex, calculate_egfr

# κ 경계(남 0.9 · 여 0.7) 양쪽, 노인·젊은층, 정상~신부전 범위를 두루 태운다.
CASES = [
    (0.6, 25), (0.7, 40), (0.8, 55), (0.9, 55), (1.0, 55),
    (1.01, 56), (1.2, 65), (1.5, 70), (2.0, 80), (3.5, 85),
]


@pytest.mark.parametrize("scr,age", CASES)
@pytest.mark.parametrize("gender,sex", [(1, Sex.MALE), (2, Sex.FEMALE)])
def test_두_구현이_같은_값을_낸다(scr, age, gender, sex):
    assert ckd_epi_2021(scr, age, gender) == calculate_egfr(scr, age, sex)


def test_κ_경계에서_지수가_갈린다():
    """Scr ≤ κ와 Scr > κ에서 지수가 다르다. 경계를 잘못 넣으면 여기서 깨진다."""
    below = ckd_epi_2021(0.9, 50, 1)      # 남 κ=0.9 → alpha
    above = ckd_epi_2021(0.91, 50, 1)     # κ 초과 → -1.200
    assert below > above


def test_성별_계수가_반영된다():
    """같은 크레아티닌·나이라도 성별로 값이 갈린다.

    여성 κ가 0.7로 더 낮아 «같은 Scr이 더 나쁜 신장 기능»을 뜻한다(근육량 차이 보정).
    그래서 Scr 1.0 · 50세면 남성 91.7 > 여성 68.6이다. 성별을 안 넣으면 여기서 깨진다.
    """
    male = ckd_epi_2021(1.0, 50, 1)
    female = ckd_epi_2021(1.0, 50, 2)
    assert male > female
    assert (male, female) == (91.7, 68.6)


def test_계산_불가한_입력은_None():
    """_internal 쪽은 예외를 던지지 않는다 — 계산기 목록에서 조용히 빠져야 한다."""
    assert ckd_epi_2021(0, 50, 1) is None
    assert ckd_epi_2021(-1, 50, 1) is None
    assert ckd_epi_2021(1.0, 0, 1) is None
    assert ckd_epi_2021(None, 50, 1) is None
    assert ckd_epi_2021(1.0, None, 1) is None
