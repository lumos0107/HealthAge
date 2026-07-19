"""
종합 건강 리포트 생성 함수
- OCR로 추출한 검진 결과 dict를 받아서 종합 분석 반환
"""
from .peer_compare import compare_to_peers, age_to_code
from .thresholds import evaluate_value


# OCR 결과 키 → 표준 컬럼명 매핑
KEY_NORMALIZATION = {
    # 콜레스테롤
    "LDL": "LDL콜레스테롤",
    "LDL-C": "LDL콜레스테롤",
    "LDL콜레스테롤": "LDL콜레스테롤",
    "HDL": "HDL콜레스테롤",
    "HDL-C": "HDL콜레스테롤",
    "HDL콜레스테롤": "HDL콜레스테롤",
    "총콜레스테롤": "총콜레스테롤",
    "TC": "총콜레스테롤",
    "TG": "트리글리세라이드",
    "중성지방": "트리글리세라이드",
    "트리글리세라이드": "트리글리세라이드",
    
    # 혈압
    "SBP": "수축기혈압",
    "수축기혈압": "수축기혈압",
    "최고혈압": "수축기혈압",
    "DBP": "이완기혈압",
    "이완기혈압": "이완기혈압",
    "최저혈압": "이완기혈압",
    
    # 혈당
    "공복혈당": "식전혈당(공복혈당)",
    "식전혈당": "식전혈당(공복혈당)",
    "FBS": "식전혈당(공복혈당)",
    "글루코스": "식전혈당(공복혈당)",
    
    # 간기능
    "AST": "혈청지오티(AST)",
    "SGOT": "혈청지오티(AST)",
    "ALT": "혈청지피티(ALT)",
    "SGPT": "혈청지피티(ALT)",
    "GGT": "감마지티피",
    "감마GTP": "감마지티피",
    "γ-GTP": "감마지티피",
    
    # 기타
    "BMI": "BMI",
    "신장": "신장",
    "체중": "체중",
    "허리둘레": "허리둘레",
    "혈색소": "혈색소",
    "Hb": "혈색소",
    "헤모글로빈": "혈색소",
    "크레아티닌": "혈청크레아티닌",
    "혈청크레아티닌": "혈청크레아티닌",
    "요단백": "요단백",
}


# thresholds.evaluate_value 의 status → 리포트 3단계 임상판정
STATUS_TO_CLINICAL = {
    "normal": "정상",
    "normal_good": "정상",
    "low": "주의",
    "caution": "주의",
    "high": "주의",
    "very_low": "위험",
    "very_high": "위험",
    "extremely_low": "위험",
    "extremely_high": "위험",
}


# 요단백 코드 → 텍스트
URINE_PROTEIN_TEXT = {
    1: "정상",
    2: "정상 (±)",
    3: "경계",
    4: "단백뇨 의심",
    5: "단백뇨 의심",
    6: "단백뇨 의심",
}


def interpret_urine_protein(code) -> dict:
    """
    요단백 코드 → 텍스트 + 임상 판정
    
    Returns:
        {"text": "정상", "clinical": "정상"}
    """
    if code is None:
        return {"text": None, "clinical": "참고"}
    
    try:
        code = int(code)
    except (ValueError, TypeError):
        return {"text": str(code), "clinical": "참고"}
    
    text = URINE_PROTEIN_TEXT.get(code, "참고")
    
    if code == 1:
        clinical = "정상"
    elif code == 2:
        clinical = "정상"
    elif code == 3:
        clinical = "주의"
    else:  # 4, 5, 6
        clinical = "위험"
    
    return {"text": text, "clinical": clinical}


def classify_clinical(
    metric: str,
    value: float,
    gender: int = 1,
    age: int = None,
    medications: dict = None,
) -> str:
    """임상 분류: 정상 / 주의 / 위험 / 참고

    약대 자문 v2 임계값(thresholds.evaluate_value)을 단일 근거로 삼는다.
    (구 CLINICAL_THRESHOLDS 삭제 — AST/ALT·GGT 기준이 자문 전 값이라 불일치했음)
    """
    # 요단백은 별도 처리
    if metric == "요단백":
        return interpret_urine_protein(value)["clinical"]

    result = evaluate_value(metric, value, gender, age, medications)
    status = result.get("status")
    return STATUS_TO_CLINICAL.get(status, "참고")


def check_metabolic_syndrome(checkup: dict, gender: int) -> dict:
    """대사증후군 5가지 기준 평가 (한국 진단 기준)"""
    criteria = {}
    
    # 1. 복부비만
    waist = checkup.get("허리둘레")
    if waist is not None:
        threshold = 90 if gender == 1 else 85
        criteria["복부비만"] = {
            "value": waist,
            "threshold": f"{'남' if gender==1 else '여'} ≥{threshold}cm",
            "met": waist >= threshold,
        }
    
    # 2. 고혈압
    sbp = checkup.get("수축기혈압")
    dbp = checkup.get("이완기혈압")
    if sbp is not None and dbp is not None:
        criteria["고혈압"] = {
            "value": f"{sbp}/{dbp}",
            "threshold": "수축기 ≥130 또는 이완기 ≥85",
            "met": sbp >= 130 or dbp >= 85,
        }
    
    # 3. 고혈당
    glu = checkup.get("식전혈당(공복혈당)")
    if glu is not None:
        criteria["고혈당"] = {
            "value": glu,
            "threshold": "공복혈당 ≥100",
            "met": glu >= 100,
        }
    
    # 4. 낮은 HDL
    hdl = checkup.get("HDL콜레스테롤")
    if hdl is not None:
        threshold = 40 if gender == 1 else 50
        criteria["낮은HDL"] = {
            "value": hdl,
            "threshold": f"{'남' if gender==1 else '여'} <{threshold}mg/dL",
            "met": hdl < threshold,
        }
    
    # 5. 고중성지방
    tg = checkup.get("트리글리세라이드")
    if tg is not None:
        criteria["고중성지방"] = {
            "value": tg,
            "threshold": "중성지방 ≥150",
            "met": tg >= 150,
        }
    
    score = sum(1 for c in criteria.values() if c["met"])
    diagnosis = score >= 3
    
    return {
        "criteria": criteria,
        "score": score,
        "evaluable_count": len(criteria),
        "diagnosis": diagnosis,
        "message": (
            f"대사증후군 ({score}/{len(criteria)} 충족)" if diagnosis
            else f"비해당 ({score}/{len(criteria)} 충족)" if len(criteria) >= 3
            else "판정 불가 (검사 항목 부족)"
        ),
    }


def normalize_checkup_keys(checkup_raw: dict) -> dict:
    """OCR 키 다양성을 표준 키로 통일"""
    normalized = {}
    for k, v in checkup_raw.items():
        std_key = KEY_NORMALIZATION.get(k, k)
        if v is not None:
            normalized[std_key] = v
    return normalized


def generate_report(
    checkup_raw: dict,
    gender: int,
    age: int,
    year: int = 2024,
) -> dict:
    """
    종합 건강 리포트 생성
    
    Args:
        checkup_raw: OCR로 추출한 검진 결과 dict
        gender: 1(남) / 2(여)
        age: 만 나이
        year: 비교 기준 연도
    
    Returns:
        구조화된 리포트 dict
    """
    checkup = normalize_checkup_keys(checkup_raw)
    
    items = []
    warning_items = []
    
    for metric, value in checkup.items():
        if value is None:
            continue
        
        peer_result = compare_to_peers(metric, value, gender, age, year)
        clinical = classify_clinical(metric, value, gender, age)
        
        item = {
            "항목": metric,
            "값": value,
            "임상판정": clinical,
        }
        
        # 요단백은 텍스트 표시값 추가
        if metric == "요단백":
            urine_info = interpret_urine_protein(value)
            item["표시값"] = urine_info["text"]
        
        if "error" not in peer_result:
            item["백분위"] = peer_result["percentile"]
            item["해석"] = peer_result["interpretation"]
            item["동연령평균"] = peer_result["group_mean"]
            item["평균과차이"] = peer_result["diff_from_mean"]
        else:
            item["참고"] = peer_result.get("error")
        
        items.append(item)
        
        if clinical in ("주의", "위험"):
            # 요단백은 표시값으로 알림
            display_value = item.get("표시값", value)
            warning_items.append({
                "항목": metric,
                "값": display_value,
                "수준": clinical,
                "동연령평균": peer_result.get("group_mean"),
            })
    
    ms = check_metabolic_syndrome(checkup, gender)
    
    warning_items.sort(key=lambda x: 0 if x["수준"] == "위험" else 1)
    
    if ms["diagnosis"]:
        summary = f"⚠️ 대사증후군에 해당합니다 ({ms['score']}개 기준 충족)"
    elif len([w for w in warning_items if w["수준"] == "위험"]) > 0:
        summary = f"🔴 {len([w for w in warning_items if w['수준'] == '위험'])}개 항목이 위험 수준입니다"
    elif len(warning_items) > 0:
        summary = f"🟡 {len(warning_items)}개 항목에 주의가 필요합니다"
    else:
        summary = "🟢 모든 항목이 정상 범위입니다"
    
    return {
        "summary": summary,
        "기본정보": {
            "성별": "남" if gender == 1 else "여",
            "나이": age,
            "비교연도": year,
        },
        "주의항목": warning_items,
        "대사증후군": ms,
        "전체결과": items,
    }