"""
OCR JSON → health_report 입력 형식 변환 어댑터
- 표준 OCR JSON 스키마 처리
- OCR 노이즈 자동 정리 (O→0, 부등호, 쉼표, 단위 변환 등)
- 사용자 정보(성별/나이) 자동 추출
"""
import json
from typing import Optional


# ============================================================
# 매핑 테이블
# ============================================================

# OCR 표준 키 → 분석 함수 내부 키
KEY_MAP = {
    "height": "신장",
    "weight": "체중",
    "waist": "허리둘레",
    "sbp": "수축기혈압",
    "dbp": "이완기혈압",
    "fbs": "식전혈당(공복혈당)",
    "total_cholesterol": "총콜레스테롤",
    "ldl": "LDL콜레스테롤",
    "hdl": "HDL콜레스테롤",
    "tg": "트리글리세라이드",
    "hb": "혈색소",
    "creatinine": "혈청크레아티닌",
    "ast": "혈청지오티(AST)",
    "alt": "혈청지피티(ALT)",
    "ggt": "감마지티피",
    "urine_protein": "요단백",
}

# 요단백 텍스트 → 코드
URINE_PROTEIN_MAP = {
    # 결과지 3단계 한글 표기 (현재 검진 결과지 표준)
    "정상": 1,
    "경계": 3,
    "단백뇨 의심": 4,
    "단백뇨의심": 4,
    "의심": 4,
    
    # 의학 기호 표기 (전통적/일부 결과지)
    "(-)": 1, "음성": 1, "-": 1, "negative": 1,
    "(±)": 2, "약양성": 2, "±": 2, "trace": 2,
    "(+)": 3, "양성": 3, "1+": 3, "+": 3, "positive": 3,
    "(++)": 4, "2+": 4, "++": 4,
    "(+++)": 5, "3+": 5, "+++": 5,
    "(++++)": 6, "4+": 6, "++++": 6,
}

SMOKING_MAP = {"never": 1, "former": 2, "current": 3}
DRINKING_MAP = {"no": 0, "yes": 1}
GENDER_MAP = {
    "M": 1, "m": 1, "남": 1, "male": 1,
    "F": 2, "f": 2, "여": 2, "female": 2,
}


# ============================================================
# 값 정리 함수 (OCR 노이즈 처리)
# ============================================================

def clean_number(value) -> Optional[float]:
    """문자열/숫자 → float. OCR 노이즈 처리 (쉼표, 부등호, O→0)."""
    if value is None or value == "":
        return None
    
    if isinstance(value, (int, float)):
        return float(value)
    
    s = str(value).strip()
    if not s:
        return None
    
    s = s.replace(",", "").replace(" ", "")
    s = s.lstrip("<>≤≥")
    
    if any(c.isdigit() for c in s):
        s = s.replace("O", "0").replace("o", "0")
    
    try:
        return float(s)
    except ValueError:
        return None


def parse_height(value) -> Optional[float]:
    """신장 처리: m → cm 자동 변환"""
    num = clean_number(value)
    if num is None:
        return None
    if 1.0 <= num < 3.0:
        return num * 100
    return num


def parse_urine_protein(value) -> Optional[int]:
    """요단백 → 코드 (1~6)"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        v = int(value)
        return v if 1 <= v <= 6 else None
    s = str(value).strip().lower()
    return URINE_PROTEIN_MAP.get(s) or URINE_PROTEIN_MAP.get(str(value).strip())


def parse_date_year(date_str: Optional[str]) -> Optional[int]:
    """날짜 문자열 → 연도 추출"""
    if not date_str:
        return None
    s = str(date_str).strip()
    for sep in ["-", "/", "."]:
        if sep in s:
            parts = s.split(sep)
            if parts[0].isdigit() and len(parts[0]) == 4:
                return int(parts[0])
    if s.isdigit() and len(s) == 4:
        return int(s)
    return None


def calculate_age(birth_date: Optional[str], exam_year: Optional[int]) -> Optional[int]:
    """생년월일 + 검진연도 → 만 나이"""
    if not birth_date or not exam_year:
        return None
    birth_year = parse_date_year(birth_date)
    if not birth_year:
        return None
    return exam_year - birth_year


# ============================================================
# 메인 파싱 함수
# ============================================================

def parse_ocr_json(ocr_data: dict) -> dict:
    """
    표준 OCR JSON → 분석 함수 입력 형식
    
    Returns:
        {
            "checkup": {...},      # generate_report에 넘길 검진 수치
            "gender": int or None,  # 1 or 2
            "age": int or None,
            "exam_year": int or None,
            "lifestyle": {...},
            "metadata": {...},
            "warnings": [...],
        }
    """
    warnings = []
    
    # 1. 메타데이터
    meta = ocr_data.get("meta", {})
    exam_year = parse_date_year(meta.get("exam_date"))
    
    age = None
    if meta.get("patient_birth"):
        age = calculate_age(meta["patient_birth"], exam_year)
    
    gender = None
    if meta.get("patient_gender"):
        gender = GENDER_MAP.get(meta["patient_gender"])
    
    if not exam_year:
        warnings.append("검진일(exam_date) 누락 또는 인식 불가")
    if gender is None and meta.get("patient_gender"):
        warnings.append(f"성별 코드 인식 불가: {meta.get('patient_gender')}")
    
    # 2. 검진 수치
    measurements = ocr_data.get("measurements", {})
    checkup = {}
    
    for ocr_key, item in measurements.items():
        std_key = KEY_MAP.get(ocr_key)
        if std_key is None:
            warnings.append(f"알 수 없는 항목 키: {ocr_key}")
            continue
        
        if isinstance(item, dict):
            if ocr_key == "urine_protein":
                if "code" in item:
                    value = item["code"]
                else:
                    value = parse_urine_protein(item.get("value"))
                    if value is None:
                        warnings.append(f"요단백 인식 실패: {item.get('value')}")
                        continue
            else:
                value = item.get("value")
        else:
            value = item
        
        if ocr_key == "height":
            v = parse_height(value)
        elif ocr_key == "urine_protein":
            v = int(value) if value else None
        else:
            v = clean_number(value)
        
        if v is None:
            warnings.append(f"{ocr_key} 값 변환 실패: {item}")
            continue
        
        checkup[std_key] = v
    
    # 3. 생활습관
    lifestyle_raw = ocr_data.get("lifestyle", {})
    lifestyle = {}
    
    if "smoking" in lifestyle_raw:
        code = SMOKING_MAP.get(lifestyle_raw["smoking"])
        if code:
            lifestyle["흡연상태"] = code
            checkup["흡연상태"] = code
    
    if "drinking" in lifestyle_raw:
        code = DRINKING_MAP.get(lifestyle_raw["drinking"])
        if code is not None:
            lifestyle["음주여부"] = code
            checkup["음주여부"] = code

    # 음주량(주당 순알코올 g) — 있으면 MASLD/ALD 정식 판정에 사용 (없으면 잠정)
    if "alcohol_weekly_g" in lifestyle_raw:
        g = clean_number(lifestyle_raw["alcohol_weekly_g"])
        if g is not None:
            lifestyle["주당순알코올(g)"] = g
            checkup["주당순알코올(g)"] = g

    return {
        "checkup": checkup,
        "gender": gender,
        "age": age,
        "exam_year": exam_year,
        "lifestyle": lifestyle,
        "metadata": meta,
        "warnings": warnings,
    }