"""권장 문구에 «내 값과 목표까지의 거리»를 넣는다 (감사표 #30·#31·#32).

배경: 권장사항은 "목표 <150mg/dL"까지만 말하고 "지금 178이라 28 남았어요"를 말하지
않았다. 재료(value·threshold)는 이미 같은 응답 안 factors[*]에 들어 있었다.

⚠️ factors[*]의 threshold는 인자마다 타입이 다르다 — 90(int) / "130/85"(str) /
   "<40"(str) / 150(int). 이 테스트가 네 모양을 전부 건드려, 위쪽 표현이 바뀌면
   조용히 깨지지 않고 여기서 잡히게 한다.
"""
from __future__ import annotations

from app.analyzer._internal.pipeline import run_recommendations

# 데모 페르소나 2024년 회차 — 허리 93 · 혈압 138/88 · 공복혈당 112 · HDL 39 · TG 178
DEMO_CHECKUP = {
    "신장": 165.9, "체중": 72.4, "허리둘레": 93,
    "수축기혈압": 138, "이완기혈압": 88, "식전혈당(공복혈당)": 112,
    "HDL콜레스테롤": 39, "트리글리세라이드": 178,
    "혈청지피티(ALT)": 45, "감마지티피": 68,
}


def _factor(met=True, **kw):
    base = {"met": met, "by_medication": False, "reason": ""}
    base.update(kw)
    return base


def _group_analysis(**overrides) -> dict:
    base = {
        "age": 56,
        "medications": {"hypertension": False, "diabetes": False, "dyslipidemia": False},
        "user_groups": {
            "g_obesity": True,
            "g_fatty_liver_suspect": True,
            "g_hypertension": False,
            "g_smoker_current": True, "g_smoker_former": False, "g_non_smoker": False,
            "g_drinker": True, "g_non_drinker": False,
        },
        "metabolic_syndrome_detail": {
            "count": 5, "evaluable": 5, "is_metabolic_syndrome": True,
            "factors": {
                "복부비만": _factor(value=93, threshold=90),
                "고혈압": _factor(value="138/88", threshold="130/85"),
                "고혈당": _factor(value=112, threshold=100),
                "낮은 HDL": _factor(value=39, threshold="<40"),
                "고중성지방": _factor(value=178, threshold=150),
            },
        },
    }
    base.update(overrides)
    return base


def _gap(result: dict, factor: str) -> str | None:
    for f in result["recommendations"]["metabolic_factors"]:
        if f["factor"] == factor:
            return f.get("gap_note")
    raise AssertionError(f"{factor} 블록이 없다")


def _group_gap(result: dict, group_id: str) -> str | None:
    for g in result["recommendations"]["group_specific"]:
        if g["group_id"] == group_id:
            return g.get("gap_note")
    raise AssertionError(f"{group_id} 블록이 없다")


# ── #30 인자별 — 네 가지 threshold 모양 ────────────────────────────────────
def test_고중성지방은_내_값과_남은_거리를_말한다():
    note = _gap(run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP), "고중성지방")
    assert "178" in note and "28" in note


def test_복부비만은_cm로_말한다():
    note = _gap(run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP), "복부비만")
    assert "93" in note and "3" in note and "cm" in note


def test_공복혈당은_남은_거리를_말한다():
    note = _gap(run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP), "고혈당")
    assert "112" in note and "12" in note


def test_낮은_HDL은_올려야_할_만큼을_말한다():
    """HDL만 방향이 반대다 — 목표가 기준 «이상»이라 모자란 만큼을 말해야 한다."""
    note = _gap(run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP), "낮은 HDL")
    assert "39" in note and "1" in note


def test_고혈압은_수축기_이완기를_따로_말한다():
    note = _gap(run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP), "고혈압")
    assert "138" in note and "88" in note
    assert "8" in note and "3" in note


def test_한쪽만_기준을_넘으면_그쪽만_말한다():
    ga = _group_analysis()
    ga["metabolic_syndrome_detail"]["factors"]["고혈압"] = _factor(value="138/80", threshold="130/85")
    note = _gap(run_recommendations(ga, checkup=DEMO_CHECKUP), "고혈압")
    assert "수축기" in note
    assert "이완기" not in note


# ── #30 경계 ───────────────────────────────────────────────────────────────
def test_약으로_수치가_잡혀_있으면_남은_거리_대신_그_사실을_말한다():
    """by_medication이면 수치는 목표 안이다. "28 남았어요"라고 하면 거짓말이 된다."""
    ga = _group_analysis()
    ga["medications"]["dyslipidemia"] = True
    ga["metabolic_syndrome_detail"]["factors"]["고중성지방"] = _factor(
        value=120, threshold=150, by_medication=True,
    )
    note = _gap(run_recommendations(ga, checkup=DEMO_CHECKUP), "고중성지방")
    assert "남았" not in note
    assert "120" in note


def test_수치_없이_약만_복용하면_거리를_말하지_않는다():
    ga = _group_analysis()
    ga["metabolic_syndrome_detail"]["factors"]["고혈당"] = _factor(
        value=None, threshold=100, by_medication=True,
    )
    assert _gap(run_recommendations(ga, checkup=DEMO_CHECKUP), "고혈당") is None


def test_성별_기준은_threshold를_그대로_따른다():
    """여성 허리 기준은 85다. 코드가 90을 박아두면 여기서 걸린다."""
    ga = _group_analysis()
    ga["metabolic_syndrome_detail"]["factors"]["복부비만"] = _factor(value=87, threshold=85)
    note = _gap(run_recommendations(ga, checkup=DEMO_CHECKUP), "복부비만")
    assert "87" in note and "2" in note


# ── #31 그룹별 ─────────────────────────────────────────────────────────────
def test_비만_권장은_지금_BMI와_남은_거리를_말한다():
    note = _group_gap(run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP), "g_obesity")
    assert "26.3" in note and "1.3" in note


def test_지방간_권장은_어느_간_수치가_걸렸는지_말한다():
    """ALT 45는 기준(40) 초과, 감마-GTP 68은 기준(75) 안이다. 걸린 것만 말해야 한다."""
    note = _group_gap(run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP), "g_fatty_liver_suspect")
    assert "ALT" in note and "45" in note
    assert "감마-GTP" not in note


def test_숫자_목표가_없는_그룹은_거리를_말하지_않는다():
    result = run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP)
    assert _group_gap(result, "g_smoker_current") is None
    assert _group_gap(result, "g_drinker") is None


def test_checkup을_안_주면_예전처럼_동작한다():
    """구버전 호출부·저장분과의 하위호환. 인자별 거리는 factors만으로 되므로 그대로 나온다."""
    result = run_recommendations(_group_analysis())
    assert _group_gap(result, "g_obesity") is None
    assert _gap(result, "고중성지방") is not None


# ── #32 우선순위 메시지 ────────────────────────────────────────────────────
def test_대사증후군_메시지가_어느_기준을_충족했는지_말한다():
    msgs = run_recommendations(_group_analysis(), checkup=DEMO_CHECKUP)["priority_messages"]
    ms_msg = next(m for m in msgs if "대사증후군" in m)
    for name in ["복부비만", "고혈압", "고혈당", "낮은 HDL", "고중성지방"]:
        assert name in ms_msg, f"{name}이 빠졌다"


def test_충족하지_않은_기준은_메시지에_넣지_않는다():
    ga = _group_analysis()
    ga["metabolic_syndrome_detail"]["count"] = 3
    ga["metabolic_syndrome_detail"]["factors"]["낮은 HDL"] = _factor(met=False, value=55, threshold="<40")
    ga["metabolic_syndrome_detail"]["factors"]["고혈당"] = _factor(met=False, value=92, threshold=100)
    msgs = run_recommendations(ga, checkup=DEMO_CHECKUP)["priority_messages"]
    ms_msg = next(m for m in msgs if "대사증후군" in m)
    assert "낮은 HDL" not in ms_msg
    assert "고혈당" not in ms_msg
    assert "복부비만" in ms_msg
