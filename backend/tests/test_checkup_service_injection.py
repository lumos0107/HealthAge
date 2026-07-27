"""combo_analysis 주입 — rarity·metabolic_syndrome_detail이 저장 대상에 포함되는지."""
from __future__ import annotations


def test_inject_group_extras_adds_rarity_and_ms_detail():
    from app.services.checkup_service import _inject_group_extras

    combo = {"combo_groups": {"matched": []}}
    group_analysis = {
        "user_groups": {},
        "ascvd_simulation": {"available": False},
        "calculators": {"items": []},
        "ldl_target": {"target_ldl": 130},
        "rarity": {
            "clinical_groups": ["고혈압군"],
            "lifestyle_groups": [],
            "clinical_count": 1,
            "lifestyle_count": 0,
            "interpretation": "단일 위험 요인 (관리 필요)",
        },
        "metabolic_syndrome_detail": {"count": 2, "is_metabolic_syndrome": False},
    }

    _inject_group_extras(combo, group_analysis)

    assert combo["rarity"]["clinical_count"] == 1
    assert combo["rarity"]["interpretation"] == "단일 위험 요인 (관리 필요)"
    assert combo["metabolic_syndrome_detail"]["count"] == 2
    # 기존 주입도 그대로 유지되어야 한다
    assert combo["calculators"] == {"items": []}
    assert combo["ldl_target"] == {"target_ldl": 130}
    assert "single_groups" in combo


def test_inject_group_extras_tolerates_missing_keys():
    """group_analysis에 rarity가 없어도 예외 없이 None으로 넣는다."""
    from app.services.checkup_service import _inject_group_extras

    combo = {}
    _inject_group_extras(combo, {"user_groups": {}})

    assert combo["rarity"] is None
    assert combo["metabolic_syndrome_detail"] is None
