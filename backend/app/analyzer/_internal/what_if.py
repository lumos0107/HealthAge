"""검진값 What-if 재계산 (④ 개선 시뮬레이터).

핵심 원칙 — **예측이 아니다.**
    "살을 빼면 이렇게 될 것이다"를 추정하지 않는다. 사용자가 검진값을 직접 바꿔
    넣었을 때, 그 값으로부터 **결정론적 공식**이 산출하는 결과만 다시 계산한다.
    (계산기 15종·대사증후군 5기준·집단군 판정·LDL 목표 — 모두 공식/컷오프)

    그래서 답할 수 있는 질문은 이것이다:
        "다음 검진에서 허리 88cm·중성지방 140이 나오면 대사증후군에서 벗어나나?"
    답할 수 없는 질문은 이것이다:
        "5kg 빼면 중성지방이 얼마나 내려가나?"  ← 개인차가 커서 추정 불가

    후자를 추정하지 않는 이유를 응답의 limitations에 명시한다.

⚠️ 체중만 바꾸면 TyG는 그대로다(TyG = ln(TG×공복혈당/2), 체중이 식에 없음).
   실제로는 체중이 줄면 중성지방·혈당도 내려가지만 그 인과를 우리가 추정하지
   않으므로, 화면에서 "안 바뀌는 지표"로 보이는 게 정상이다 — 이 점도 안내한다.
"""
from __future__ import annotations

from typing import Any, Optional

# 사용자가 조정할 수 있는 검진 항목 → 표준 검진 키.
# "행동"이 아니라 "다음 검진에 찍힐 수치"를 조정한다는 점이 중요하다.
ADJUSTABLE: dict[str, str] = {
    "weight": "체중",
    "waist": "허리둘레",
    "sbp": "수축기혈압",
    "dbp": "이완기혈압",
    "fbs": "식전혈당(공복혈당)",
    "tg": "트리글리세라이드",
    "hdl": "HDL콜레스테롤",
    "ldl": "LDL콜레스테롤",
}


def _apply_changes(checkup: dict[str, Any], changes: dict[str, Any]) -> tuple[dict, list[dict]]:
    """검진 dict 복사본에 변경을 적용하고, 실제로 반영된 항목 목록을 함께 돌려준다."""
    out = dict(checkup)
    applied: list[dict] = []

    for key, std_key in ADJUSTABLE.items():
        if key not in changes:
            continue
        new_v = changes[key]
        if not isinstance(new_v, (int, float)):
            continue
        old_v = out.get(std_key)
        out[std_key] = float(new_v)
        applied.append({
            "key": key,
            "label": std_key,
            "before": old_v if isinstance(old_v, (int, float)) else None,
            "after": float(new_v),
        })

    # 체중이 바뀌면 BMI·맥압 같은 파생값도 같이 맞춰야 한다(안 하면 앞뒤가 안 맞는다).
    height = out.get("신장")
    weight = out.get("체중")
    if isinstance(height, (int, float)) and isinstance(weight, (int, float)) and height > 0:
        out["BMI"] = round(weight / ((height / 100) ** 2), 1)

    sbp, dbp = out.get("수축기혈압"), out.get("이완기혈압")
    if isinstance(sbp, (int, float)) and isinstance(dbp, (int, float)):
        out["맥압"] = round(sbp - dbp, 1)

    tc, hdl = out.get("총콜레스테롤"), out.get("HDL콜레스테롤")
    if isinstance(tc, (int, float)) and isinstance(hdl, (int, float)):
        out["non_HDL"] = round(tc - hdl, 1)

    return out, applied


def _ms_summary(ms: dict[str, Any]) -> dict[str, Any]:
    """대사증후군 평가에서 화면이 쓰는 부분만 뽑는다(count·evaluable은 모듈이 이미 계산)."""
    factors = ms.get("factors") or {}
    return {
        "count": ms.get("count"),
        "evaluable": ms.get("evaluable"),
        "is_metabolic_syndrome": ms.get("is_metabolic_syndrome"),
        "met_factors": [n for n, f in factors.items() if isinstance(f, dict) and f.get("met")],
    }


def simulate_checkup(
    checkup: dict[str, Any],
    gender: int,
    age: Optional[int],
    changes: dict[str, Any],
    medications: Optional[dict[str, bool]] = None,
) -> dict[str, Any]:
    """검진값을 바꿔 넣고 지표를 다시 계산해 전/후를 비교한다.

    Returns:
        {"changes_applied", "metabolic_syndrome", "calculators",
         "groups", "ldl_target", "unchanged_note", "limitations"}
    """
    from .user_group_analysis import classify_user_groups, evaluate_metabolic_syndrome, GROUP_INFO
    from .calculators import additional_calculators
    from .clinical_targets import classify_ldl_risk

    medications = medications or {}
    after, applied = _apply_changes(checkup, changes)

    if not applied:
        return {
            "changes_applied": [],
            "error": "바꿀 검진값이 지정되지 않았습니다.",
        }

    def analyze(ck: dict) -> dict:
        groups = classify_user_groups(ck, gender, medications)
        return {
            "groups": groups,
            "ms": evaluate_metabolic_syndrome(ck, gender, medications),
            "calc": additional_calculators(ck, gender, age, groups, medications),
            "ldl": classify_ldl_risk(ck, gender, age, groups, medications),
        }

    base = analyze(checkup)
    sim = analyze(after)

    # ── 계산기 전/후 ─────────────────────────────────────────────
    base_items = {i["key"]: i for i in (base["calc"].get("items") or [])}
    calc_diff: list[dict[str, Any]] = []
    for item in sim["calc"].get("items") or []:
        b = base_items.get(item["key"])
        if not b:
            continue
        bv, av = b.get("value"), item.get("value")
        delta = round(av - bv, 2) if isinstance(bv, (int, float)) and isinstance(av, (int, float)) else None
        calc_diff.append({
            "key": item["key"],
            "title": item["title"],
            "category": item["category"],
            "before": bv,
            "after": av,
            "delta": delta,
            "changed": bool(delta),
            "before_level": b.get("level"),
            "after_level": item.get("level"),
            "after_interpretation": item.get("interpretation"),
            # 또래 백분위가 붙는 5종(TyG·METS-IR·AIP·LAP·VAI)은 위치 이동도 보여준다.
            "before_percentile": b.get("percentile"),
            "after_percentile": item.get("percentile"),
            "after_peer_label": item.get("peer_label"),
        })

    # ── 집단군 전/후 ─────────────────────────────────────────────
    resolved = [
        GROUP_INFO.get(k, {}).get("name", k)
        for k, v in base["groups"].items()
        if v and not sim["groups"].get(k)
    ]
    added = [
        GROUP_INFO.get(k, {}).get("name", k)
        for k, v in sim["groups"].items()
        if v and not base["groups"].get(k)
    ]

    # ── 값이 안 바뀐 이유 안내 ────────────────────────────────────
    # 예: 체중만 바꿨는데 TyG가 그대로인 경우 — 식에 체중이 없어서다.
    unchanged = [c["title"] for c in calc_diff if not c["changed"]]

    base_ldl, sim_ldl = base["ldl"], sim["ldl"]
    return {
        "changes_applied": applied,
        "metabolic_syndrome": {
            "before": _ms_summary(base["ms"]),
            "after": _ms_summary(sim["ms"]),
        },
        "calculators": calc_diff,
        "groups": {"resolved": resolved, "added": added},
        "ldl_target": {
            "target_ldl": sim_ldl.get("target_ldl"),
            "label": sim_ldl.get("label"),
            "before_ldl": base_ldl.get("current_ldl"),
            "after_ldl": sim_ldl.get("current_ldl"),
            "before_achieved": base_ldl.get("achieved"),
            "after_achieved": sim_ldl.get("achieved"),
        },
        "unchanged": unchanged,
        "limitations": [
            "바뀐 검진값으로 공식을 다시 계산한 결과입니다. "
            "생활습관을 바꾸면 수치가 얼마나 변할지는 개인차가 커서 추정하지 않습니다.",
            "식에 포함되지 않은 값을 바꾸면 그 지표는 그대로입니다"
            "(예: TyG는 중성지방·공복혈당으로만 계산되어 체중 변화에 반응하지 않습니다).",
            "진단이 아니라 참고용 재계산이며, 치료 판단은 의료진과 상의하세요.",
        ],
    }
