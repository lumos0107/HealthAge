"""
사용자 그룹 분석 모듈 (v2 - 약대 교수님 자문 반영)
- 대사증후군 5가지 인자에 약물 복용 결합 연산
- 약물 복용 정보를 users.json에서 가져옴
- 인자별 충족 사유(수치 / 약물) 기록
"""
import json
import polars as pl
from pathlib import Path
from typing import Optional
from datetime import datetime

from .peer_compare import age_to_code


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
GROUP_STATS_PATH = PROJECT_ROOT / "data" / "stats" / "group_stats.parquet"
GROUP_DEMO_PATH = PROJECT_ROOT / "data" / "stats" / "group_demographics.parquet"



# ============================================================
# 그룹 메타정보
# ============================================================
GROUP_INFO = {
    "g_hypertension": {"name": "고혈압", "category": "임상",
                       "desc": "수축기 ≥140 또는 이완기 ≥90 또는 고혈압약 복용"},
    "g_pre_hypertension": {"name": "고혈압 전단계", "category": "임상",
                           "desc": "수축기 130-139 또는 이완기 80-89"},
    "g_diabetes": {"name": "당뇨", "category": "임상",
                   "desc": "공복혈당 ≥126 또는 당뇨약 복용"},
    "g_pre_diabetes": {"name": "당뇨 전단계", "category": "임상",
                       "desc": "공복혈당 100-125"},
    "g_metabolic_syndrome": {"name": "대사증후군", "category": "임상",
                             "desc": "5개 기준 중 3개 이상 (약물 복용 포함)"},
    "g_obesity": {"name": "비만", "category": "임상",
                  "desc": "BMI ≥25"},
    "g_dyslipidemia": {"name": "이상지질혈증", "category": "임상",
                       "desc": "LDL≥160 또는 HDL미달 또는 TG≥200 또는 이상지질혈증약 복용"},
    "g_fatty_liver_suspect": {"name": "지방간 의심", "category": "임상",
                              "desc": "ALT>40 또는 GGT>75"},
    "g_smoker_current": {"name": "현재 흡연자", "category": "생활습관"},
    "g_smoker_former": {"name": "과거 흡연자", "category": "생활습관"},
    "g_non_smoker": {"name": "비흡연자", "category": "생활습관"},
    "g_drinker": {"name": "음주자", "category": "생활습관"},
    "g_non_drinker": {"name": "비음주자", "category": "생활습관"},
}

COMPARE_METRICS = [
    "수축기혈압", "이완기혈압",
    "식전혈당(공복혈당)",
    "LDL콜레스테롤", "HDL콜레스테롤", "트리글리세라이드", "총콜레스테롤",
    "BMI", "허리둘레",
    "혈청지오티(AST)", "혈청지피티(ALT)", "감마지티피",
]


# 캐시
_group_stats: Optional[pl.DataFrame] = None
_group_demo: Optional[pl.DataFrame] = None


def load_group_stats() -> pl.DataFrame:
    global _group_stats
    if _group_stats is None:
        _group_stats = pl.read_parquet(GROUP_STATS_PATH)
    return _group_stats


def load_group_demographics() -> pl.DataFrame:
    global _group_demo
    if _group_demo is None:
        _group_demo = pl.read_parquet(GROUP_DEMO_PATH)
    return _group_demo



# ============================================================
# 대사증후군 5가지 인자 평가 (약물 결합)
# ============================================================
def evaluate_metabolic_syndrome(checkup: dict, gender: int,
                                 medications: dict) -> dict:
    """
    대사증후군 5가지 인자 평가 (약물 복용 결합 연산)
    
    Returns:
        {
            "factors": {
                "복부비만": {"met": bool, "reason": str, ...},
                "고혈압": {...},
                "고혈당": {...},
                "낮은 HDL": {...},
                "고중성지방": {...},
            },
            "count": int,           # 충족된 인자 수
            "evaluable": int,       # 평가 가능한 인자 수
            "is_metabolic_syndrome": bool,  # 3개 이상 충족
        }
    """
    medications = medications or {}
    factors = {}
    
    # 1. 복부비만 (약물 없음)
    waist = checkup.get("허리둘레")
    if waist is not None:
        threshold = 90 if gender == 1 else 85
        met = waist >= threshold
        factors["복부비만"] = {
            "met": met,
            "value": waist,
            "threshold": threshold,
            "reason": f"허리둘레 {waist}cm (기준 ≥{threshold})" if met else "정상 범위",
            "by_medication": False,
        }
    
    # 2. 고혈압 (수치 OR 고혈압약 복용)
    sbp = checkup.get("수축기혈압")
    dbp = checkup.get("이완기혈압")
    htn_med = medications.get("hypertension", False)
    
    if sbp is not None and dbp is not None:
        by_value = (sbp >= 130) or (dbp >= 85)
        met = by_value or htn_med
        
        if met:
            if by_value and htn_med:
                reason = f"혈압 {sbp}/{dbp} + 고혈압약 복용"
            elif by_value:
                reason = f"혈압 {sbp}/{dbp} (기준 ≥130/85)"
            else:
                reason = "혈압 정상이나 고혈압약 복용 중"
        else:
            reason = "정상 범위"
        
        factors["고혈압"] = {
            "met": met,
            "value": f"{sbp}/{dbp}",
            "threshold": "130/85",
            "reason": reason,
            "by_medication": htn_med and not by_value,
        }
    elif htn_med:
        # 수치는 없는데 약 복용 중
        factors["고혈압"] = {
            "met": True,
            "value": None,
            "threshold": "130/85",
            "reason": "고혈압약 복용 중 (수치 없음)",
            "by_medication": True,
        }
    
    # 3. 고혈당 (수치 OR 당뇨약 복용)
    fbs = checkup.get("식전혈당(공복혈당)")
    dm_med = medications.get("diabetes", False)
    
    if fbs is not None:
        by_value = fbs >= 100
        met = by_value or dm_med
        
        if met:
            if by_value and dm_med:
                reason = f"공복혈당 {fbs} + 당뇨약 복용"
            elif by_value:
                reason = f"공복혈당 {fbs} (기준 ≥100)"
            else:
                reason = "공복혈당 정상이나 당뇨약 복용 중"
        else:
            reason = "정상 범위"
        
        factors["고혈당"] = {
            "met": met,
            "value": fbs,
            "threshold": 100,
            "reason": reason,
            "by_medication": dm_med and not by_value,
        }
    elif dm_med:
        factors["고혈당"] = {
            "met": True,
            "value": None,
            "threshold": 100,
            "reason": "당뇨약 복용 중 (수치 없음)",
            "by_medication": True,
        }
    
    # 4. 낮은 HDL (수치 OR 이상지질혈증약 복용)
    hdl = checkup.get("HDL콜레스테롤")
    dl_med = medications.get("dyslipidemia", False)
    
    if hdl is not None:
        threshold = 40 if gender == 1 else 50
        by_value = hdl < threshold
        met = by_value or dl_med
        
        if met:
            if by_value and dl_med:
                reason = f"HDL {hdl} + 이상지질혈증약 복용"
            elif by_value:
                reason = f"HDL {hdl} (기준 <{threshold})"
            else:
                reason = "HDL 정상이나 이상지질혈증약 복용 중"
        else:
            reason = "정상 범위"
        
        factors["낮은 HDL"] = {
            "met": met,
            "value": hdl,
            "threshold": f"<{threshold}",
            "reason": reason,
            "by_medication": dl_med and not by_value,
        }
    
    # 5. 고중성지방 (수치 OR 이상지질혈증약 복용)
    tg = checkup.get("트리글리세라이드")
    if tg is not None:
        by_value = tg >= 150
        met = by_value or dl_med
        
        if met:
            if by_value and dl_med:
                reason = f"TG {tg} + 이상지질혈증약 복용"
            elif by_value:
                reason = f"TG {tg} (기준 ≥150)"
            else:
                reason = "TG 정상이나 이상지질혈증약 복용 중"
        else:
            reason = "정상 범위"
        
        factors["고중성지방"] = {
            "met": met,
            "value": tg,
            "threshold": 150,
            "reason": reason,
            "by_medication": dl_med and not by_value,
        }
    
    # 집계
    count = sum(1 for f in factors.values() if f["met"])
    evaluable = len(factors)
    
    return {
        "factors": factors,
        "count": count,
        "evaluable": evaluable,
        "is_metabolic_syndrome": evaluable >= 3 and count >= 3,
    }


# ============================================================
# 그룹 분류 (약물 결합)
# ============================================================
def classify_user_groups(checkup: dict, gender: int,
                          medications: dict = None) -> dict:
    """
    사용자가 어느 그룹들에 속하는지 분류 (약물 복용 결합 연산)
    """
    medications = medications or {}
    groups = {}
    
    # 혈압 (고혈압은 약물도 포함)
    sbp = checkup.get("수축기혈압")
    dbp = checkup.get("이완기혈압")
    htn_med = medications.get("hypertension", False)
    
    if sbp is not None and dbp is not None:
        is_htn = (sbp >= 140) or (dbp >= 90) or htn_med
        groups["g_hypertension"] = is_htn
        groups["g_pre_hypertension"] = (
            not is_htn and (
                (130 <= sbp < 140) or (80 <= dbp < 90)
            )
        )
    elif htn_med:
        groups["g_hypertension"] = True
        groups["g_pre_hypertension"] = False
    
    # 당뇨 (당뇨약도 포함)
    fbs = checkup.get("식전혈당(공복혈당)")
    dm_med = medications.get("diabetes", False)
    
    if fbs is not None:
        is_dm = fbs >= 126 or dm_med
        groups["g_diabetes"] = is_dm
        groups["g_pre_diabetes"] = (not is_dm) and (100 <= fbs < 126)
    elif dm_med:
        groups["g_diabetes"] = True
        groups["g_pre_diabetes"] = False
    
    # 비만 (BMI - 약물 없음)
    bmi = checkup.get("BMI")
    if bmi is None:
        height = checkup.get("신장")
        weight = checkup.get("체중")
        if height and weight:
            h_m = height / 100
            bmi = weight / (h_m ** 2)
    if bmi is not None:
        groups["g_obesity"] = bmi >= 25
    
    # 이상지질혈증 (이상지질혈증약도 포함)
    ldl = checkup.get("LDL콜레스테롤")
    hdl = checkup.get("HDL콜레스테롤")
    tg = checkup.get("트리글리세라이드")
    dl_med = medications.get("dyslipidemia", False)
    
    dyslipidemia = dl_med  # 약물 복용 시 즉시 True
    if ldl is not None and ldl >= 160:
        dyslipidemia = True
    if hdl is not None:
        if gender == 1 and hdl < 40:
            dyslipidemia = True
        elif gender == 2 and hdl < 50:
            dyslipidemia = True
    if tg is not None and tg >= 200:
        dyslipidemia = True
    
    if any(v is not None for v in [ldl, hdl, tg]) or dl_med:
        groups["g_dyslipidemia"] = dyslipidemia
    
    # 지방간 의심 (GGT 기준 75로 상향 - 자문 반영)
    alt = checkup.get("혈청지피티(ALT)")
    ggt = checkup.get("감마지티피")
    if alt is not None or ggt is not None:
        fl = False
        if alt is not None and alt > 40:
            fl = True
        if ggt is not None and ggt > 75:
            fl = True
        groups["g_fatty_liver_suspect"] = fl
    
    # 대사증후군 (5가지 인자 - 약물 결합 연산 적용)
    ms_result = evaluate_metabolic_syndrome(checkup, gender, medications)
    if ms_result["evaluable"] >= 3:
        groups["g_metabolic_syndrome"] = ms_result["is_metabolic_syndrome"]
    
    # 흡연
    smoking = checkup.get("흡연상태")
    if smoking is not None:
        groups["g_smoker_current"] = (smoking == 3)
        groups["g_smoker_former"] = (smoking == 2)
        groups["g_non_smoker"] = (smoking == 1)
    
    # 음주
    drinking = checkup.get("음주여부")
    if drinking is not None:
        groups["g_drinker"] = (drinking == 1)
        groups["g_non_drinker"] = (drinking == 0)
    
    return groups


# ============================================================
# 그룹별 평균과 비교 (변경 없음)
# ============================================================
def compare_user_to_groups(checkup: dict, user_groups: dict,
                            gender: int, age: int, year: int = 2024) -> list:
    stats = load_group_stats()
    age_code = age_to_code(age, year)
    
    results = []
    
    for group_id, belongs in user_groups.items():
        if not belongs:
            continue
        
        comparisons = []
        
        for metric in COMPARE_METRICS:
            user_value = checkup.get(metric)
            if user_value is None:
                continue
            
            row = stats.filter(
                (pl.col("group") == group_id) &
                (pl.col("항목") == metric) &
                (pl.col("기준년도") == year) &
                (pl.col("성별코드") == gender) &
                (pl.col("연령대코드(5세단위)") == age_code)
            )
            
            if len(row) == 0:
                continue
            
            r = row.row(0, named=True)
            group_mean = r["mean"]
            diff = round(user_value - group_mean, 2)
            
            if abs(diff) < 2:
                interp = "그룹 평균과 거의 같음"
            elif diff > 0:
                interp = f"그룹 평균보다 {abs(diff):.1f} 높음"
            else:
                interp = f"그룹 평균보다 {abs(diff):.1f} 낮음"
            
            comparisons.append({
                "metric": metric,
                "user_value": user_value,
                "group_mean": group_mean,
                "group_p50": r["p50"],
                "diff": diff,
                "n_in_group": r["n"],
                "interpretation": interp,
            })
        
        if comparisons:
            results.append({
                "group_id": group_id,
                "group_name": GROUP_INFO[group_id]["name"],
                "category": GROUP_INFO[group_id]["category"],
                "comparisons": comparisons,
            })
    
    return results


# ============================================================
# 그룹 조합 희귀도
# ============================================================
def calculate_group_rarity(user_groups: dict, gender: int, age: int,
                           year: int = 2024) -> dict:
    clinical = [
        GROUP_INFO[g]["name"]
        for g, belongs in user_groups.items()
        if belongs and GROUP_INFO[g]["category"] == "임상"
    ]
    
    lifestyle = [
        GROUP_INFO[g]["name"]
        for g, belongs in user_groups.items()
        if belongs and GROUP_INFO[g]["category"] == "생활습관"
    ]
    
    n_clinical = len(clinical)
    
    if n_clinical == 0:
        interp = "임상 위험 요인 없음 (건강 상태)"
    elif n_clinical == 1:
        interp = "단일 위험 요인 (관리 필요)"
    elif n_clinical == 2:
        interp = "복합 위험 요인 (적극 관리 필요)"
    elif n_clinical == 3:
        interp = "다중 위험 요인 (의료 상담 권장)"
    else:
        interp = "고위험 패턴 (즉각 의료 진료 권장)"
    
    return {
        "clinical_groups": clinical,
        "lifestyle_groups": lifestyle,
        "clinical_count": n_clinical,
        "lifestyle_count": len(lifestyle),
        "interpretation": interp,
    }


# ============================================================
# 메인 분석 함수
# ============================================================
