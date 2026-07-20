"""
검진 항목 양방향 임계값 정의 (v2 - 약대 교수님 자문 반영)
- 4단계 평가 + 약물 복용 결합 연산
- 노인층(65세+) 저혈압/저혈당 경고 강화
- 의학 가이드라인 기반 (2025-2026 진료 지침)

direction:
  "high_bad": 높을수록 위험 (LDL, TG, AST 등)
  "low_bad": 낮을수록 위험 (HDL 등)
  "both": 양방향 위험 (혈압, 혈색소 등)
  "u_shape": U자형 (총콜레스테롤 - 너무 낮아도 영양부족)
  "categorical": 카테고리형 (요단백)
  "info_only": 정보만
"""

# 노인 기준 연령
ELDERLY_AGE = 65


THRESHOLDS = {
    # ============================================================
    # 체위 (양방향)
    # ============================================================
    "BMI": {
        "direction": "both",
        "very_low": 18.5,
        "low": 20.0,
        "normal_low": 20.0,
        "normal_high": 25.0,
        "high": 25.0,
        "very_high": 30.0,
        "unit": "kg/m²",
        "meaning_low": "저체중 - 영양 부족, 근감소증 가능",
        "meaning_high": "비만 - 대사 질환, 심혈관 위험 증가",
        "ideal": (20, 25),
    },
    "체중": {
        "direction": "info_only",
        "unit": "kg",
    },
    "신장": {
        "direction": "info_only",
        "unit": "cm",
    },
    "허리둘레": {
        "direction": "high_bad",
        "high_male": 90,
        "high_female": 85,
        "unit": "cm",
        "meaning_high": "복부비만 - 대사증후군 위험",
    },
    
    # ============================================================
    # 혈압 (양방향) - 2026년 고혈압 진료지침
    # 저혈압(<90/<60), 정상(90-119/60-79), 주의(120-129),
    # 전단계(130-139 또는 80-89), 고혈압(>=140/>=90)
    # ============================================================
    "수축기혈압": {
        "direction": "both",
        "very_low": 90,
        "low": 90,
        "normal_low": 90,
        "normal_high": 120,
        "caution": 120,
        "high": 130,
        "very_high": 140,
        # 노인 위험(고혈압) 임계 상향 — 2026 고혈압 지침 + 약대 자문(p1):
        #   "65세 이상 SBP≥140, 80세 이상 SBP≥160". 65-79세는 일반과 동일(140),
        #   80세 이상만 160으로 올려 노인 과다경고를 방지한다.
        "very_high_elderly_80": 160,
        "unit": "mmHg",
        "meaning_low": "저혈압 - 어지러움, 실신, 낙상 위험",
        "meaning_caution": "주의 혈압 - 생활습관 교정 필요",
        "meaning_high": "고혈압 전단계 - 의학적/진료적 접근 필요",
        "meaning_very_high": "고혈압 - 심혈관 위험 증가",
        "ideal": (90, 120),
        "med_field": "hypertension",
    },
    "이완기혈압": {
        "direction": "both",
        "very_low": 60,
        "low": 60,
        "normal_low": 60,
        "normal_high": 80,
        "high": 80,
        "very_high": 90,
        "unit": "mmHg",
        "meaning_low": "저혈압 - 어지러움, 실신, 낙상 위험",
        "meaning_high": "고혈압 전단계",
        "meaning_very_high": "고혈압",
        "ideal": (60, 80),
        "med_field": "hypertension",
    },
    
    # ============================================================
    # 혈당 (양방향) - 2025년 당뇨병 진료지침
    # ============================================================
    "식전혈당(공복혈당)": {
        "direction": "both",
        "very_low": 70,
        "low": 70,
        "normal_low": 70,
        "normal_high": 100,
        "high": 100,
        "very_high": 126,
        "unit": "mg/dL",
        "meaning_low": "저혈당 - 어지러움, 의식 저하, 낙상 위험",
        "meaning_high": "공복혈당 장애에 준하는 당뇨병 전단계",
        "meaning_very_high": "당뇨 - 합병증 위험",
        "ideal": (70, 100),
        "med_field": "diabetes",
    },
    
    # ============================================================
    # 콜레스테롤
    # ============================================================
    "총콜레스테롤": {
        "direction": "u_shape",
        "very_low": 120,
        "low": 150,
        "normal_low": 150,
        "normal_high": 200,
        "high": 200,
        "very_high": 240,
        "unit": "mg/dL",
        "meaning_low": "낮음 - 영양 부족, 간 기능 저하 가능",
        "meaning_high": "이상지질혈증",
        "ideal": (150, 200),
        "med_field": "dyslipidemia",
    },
    "LDL콜레스테롤": {
        "direction": "high_bad",
        "normal_high": 130,
        "high": 130,
        "very_high": 160,
        "extremely_high": 190,
        "diabetes_high": 100,
        "unit": "mg/dL",
        "meaning_high": "동맥경화, 심혈관 위험 증가",
        "meaning_high_diabetes": "당뇨 환자 - LDL 100 이상은 위험 (목표치 미달)",
        "ideal": (0, 130),
        "med_field": "dyslipidemia",
        "disclaimer": "다른 죽상경화성 심혈관질환(ASCVD) 위험인자가 없다는 가정하의 기준",
    },
    "HDL콜레스테롤": {
        "direction": "low_bad",
        "extremely_low": 30,
        "very_low_male": 40,
        "very_low_female": 50,
        "normal_low_male": 40,
        "normal_low_female": 50,
        "normal_high": 60,
        "unit": "mg/dL",
        "meaning_low": "저HDL 콜레스테롤 혈증 - 심혈관 위험 인자",
        "ideal": (60, 999),
    },
    "트리글리세라이드": {
        "direction": "high_bad",
        "normal_high": 150,
        "high": 150,
        "very_high": 200,
        "extremely_high": 500,
        "unit": "mg/dL",
        "meaning_high": "이상지질혈증, 심혈관 위험",
        "ideal": (0, 150),
        "med_field": "dyslipidemia",
    },
    
    # ============================================================
    # 간 기능 (낮은 쪽 위험 없음, 정상 3배를 위험으로)
    # ============================================================
    "혈청지오티(AST)": {
        "direction": "high_bad",
        "normal_high": 40,
        "high": 40,
        "very_high": 120,
        "unit": "IU/L",
        "meaning_high": "간 손상, 알코올성/지방간 의심",
        "meaning_very_high": "간독성 의심 - 약물/외부물질 영향 가능",
        "ideal": (0, 40),
        "disclaimer": "검진 기관 및 측정 기기에 따라 정상 기준치에 차이가 있을 수 있음",
    },
    "혈청지피티(ALT)": {
        "direction": "high_bad",
        "normal_high": 40,
        "high": 40,
        "very_high": 120,
        "unit": "IU/L",
        "meaning_high": "간 손상, 지방간 의심",
        "meaning_very_high": "간독성 의심 - 약물/외부물질 영향 가능",
        "ideal": (0, 40),
        "disclaimer": "검진 기관 및 측정 기기에 따라 정상 기준치에 차이가 있을 수 있음",
    },
    "감마지티피": {
        "direction": "high_bad",
        "normal_high": 75,
        "high": 75,
        "very_high": 150,
        "unit": "IU/L",
        "meaning_high": "음주, 지방간, 담도 문제 의심",
        "ideal": (0, 75),
        "disclaimer": "성별/나이별 편차가 크며, 기관별 차이가 있을 수 있음",
    },
    
    # ============================================================
    # 혈색소 (양방향, 낮은 쪽 세분화)
    # <=8: 출혈 의심
    # 8-10: 빈혈 의심
    # ============================================================
    "혈색소": {
        "direction": "both",
        "extremely_low": 8,
        "very_low": 10,
        "low_male": 13,
        "low_female": 12,
        "normal_high_male": 17,
        "normal_high_female": 15.5,
        "high_male": 17,
        "high_female": 15.5,
        "very_high_male": 18,
        "very_high_female": 16.5,
        "unit": "g/dL",
        "meaning_extremely_low": "출혈 의심 (위출혈, 대장출혈 등) - 즉시 정밀 검사 필요",
        "meaning_very_low": "빈혈 의심 - 의학적 치료 및 추가 검사 필요",
        "meaning_low": "경도 빈혈 - 철분 결핍 등 가능",
        "meaning_high": "적혈구 증가증 - 흡연, 폐 질환 가능",
        "ideal_male": (13, 17),
        "ideal_female": (12, 15.5),
    },
    
    # ============================================================
    # 신장 기능
    # ============================================================
    "혈청크레아티닌": {
        "direction": "high_bad",
        "normal_high_male": 1.2,
        "normal_high_female": 1.0,
        "high_male": 1.2,
        "high_female": 1.0,
        "very_high": 1.5,
        "unit": "mg/dL",
        "meaning_high": "신장 기능 저하 의심",
        "ideal_male": (0.7, 1.2),
        "ideal_female": (0.5, 1.0),
    },
    
    # ============================================================
    # 요검사
    # ============================================================
    "요단백": {
        "direction": "categorical",
        "normal": 1,
        "borderline": 3,
        "abnormal_low": 4,
        "meaning_high": "단백뇨 - 신장 질환 가능",
    },
    
    # ============================================================
    # 흡연/음주 (정보만)
    # ============================================================
    "흡연상태": {"direction": "info_only"},
    "음주여부": {"direction": "info_only"},
}


# 상태 라벨
STATUS_LABELS = {
    "extremely_low": ("극도 위험 (낮음)", "🆘", "#8e44ad"),
    "very_low": ("위험 (낮음)", "🚨", "#c0392b"),
    "low": ("주의 (낮음)", "⬇️", "#e67e22"),
    "caution": ("주의", "⚠️", "#f39c12"),
    "normal": ("정상", "✅", "#27ae60"),
    "normal_good": ("정상 (좋음)", "🌟", "#16a085"),
    "high": ("주의 (높음)", "⬆️", "#e67e22"),
    "very_high": ("위험 (높음)", "🚨", "#c0392b"),
    "extremely_high": ("극도 위험 (높음)", "🆘", "#8e44ad"),
    "info": ("정보", "ℹ️", "#3498db"),
}


def evaluate_value(
    metric: str,
    value,
    gender: int = 1,
    age: int = None,
    medications: dict = None,
) -> dict:
    """
    검진 값을 평가하여 상태 + 의학적 의미 반환
    
    Args:
        metric: 항목명
        value: 값
        gender: 1=남, 2=여
        age: 나이 (노인 저혈압/저혈당 경고 강화용)
        medications: 약물 복용 정보
            {
                "hypertension": bool,
                "diabetes": bool,
                "dyslipidemia": bool
            }
    
    Returns:
        평가 결과 dict
    """
    if metric not in THRESHOLDS:
        return _info_result(metric, value, "참고용 항목")
    
    config = THRESHOLDS[metric]
    direction = config["direction"]
    medications = medications or {}
    
    # 약물 복용 여부 확인
    med_field = config.get("med_field")
    on_medication = bool(medications.get(med_field, False)) if med_field else False
    
    if direction == "info_only":
        return _info_result(metric, value, "참고 정보")
    
    if direction == "categorical":
        return _evaluate_categorical(metric, value, config)
    
    if direction == "high_bad":
        result = _evaluate_high_bad(metric, value, config, gender, medications)
    elif direction == "low_bad":
        result = _evaluate_low_bad(metric, value, config, gender)
    elif direction == "both":
        result = _evaluate_both(metric, value, config, gender, age)
    elif direction == "u_shape":
        result = _evaluate_u_shape(metric, value, config)
    else:
        result = _make_result(metric, value, "info", "참고", config, direction)
    
    # 약물 복용 정보 추가
    result["on_medication"] = on_medication
    
    # 노인층 저혈압/저혈당 경고 강화
    result["is_elderly_warning"] = False
    if age is not None and age >= ELDERLY_AGE:
        if metric in ["수축기혈압", "이완기혈압", "식전혈당(공복혈당)"]:
            if result["status"] in ["very_low", "extremely_low", "low"]:
                result["is_elderly_warning"] = True
                result["meaning"] += " ※ 65세 이상 - 낙상 사고 위험 매우 높음"
    
    # 약물 복용자 메시지 보정
    if on_medication and result["status"] == "normal":
        result["meaning"] = "정상 범위 (약물 치료 중 - 잘 관리되고 있음)"
    
    # 단서 문구
    if "disclaimer" in config:
        result["disclaimer"] = config["disclaimer"]
    
    return result


def _info_result(metric, value, meaning):
    """정보 결과"""
    return {
        "metric": metric, "value": value, "status": "info",
        "label": "참고", "icon": "ℹ️", "color": "#3498db",
        "meaning": meaning, "direction": "info_only", "unit": "",
        "is_elderly_warning": False, "on_medication": False,
    }


def _evaluate_categorical(metric, value, config):
    """카테고리형 (요단백 등)"""
    if value <= config.get("normal", 1):
        status, label = "normal", "정상"
    elif value <= config.get("borderline", 3):
        status, label = "high", "경계"
    else:
        status, label = "very_high", "이상"
    return _make_result(metric, value, status, label, config, "categorical")


def _evaluate_high_bad(metric, value, config, gender, medications):
    """높을수록 위험 (LDL은 당뇨 환자 특별 처리)"""
    if "high_male" in config and "high_female" in config:
        high = config["high_male"] if gender == 1 else config["high_female"]
    else:
        high = config.get("high")
    
    very_high = config.get("very_high")
    extremely_high = config.get("extremely_high")
    
    # LDL: 당뇨 환자는 100 이상이면 위험
    diabetes_med = medications.get("diabetes", False) if medications else False
    if metric == "LDL콜레스테롤" and diabetes_med:
        diabetes_high = config.get("diabetes_high", 100)
        if extremely_high and value >= extremely_high:
            status = "extremely_high"
        elif very_high and value >= very_high:
            status = "very_high"
        elif value >= diabetes_high:
            status = "high"
            result = _make_result(metric, value, status, None, config, "high_bad")
            result["meaning"] = config.get("meaning_high_diabetes", result["meaning"])
            return result
        else:
            status = "normal"
        return _make_result(metric, value, status, None, config, "high_bad")
    
    # 일반 high_bad 로직
    if extremely_high and value >= extremely_high:
        status = "extremely_high"
    elif very_high and value >= very_high:
        status = "very_high"
    elif high and value >= high:
        status = "high"
    else:
        status = "normal"
    
    result = _make_result(metric, value, status, None, config, "high_bad")
    
    if status == "very_high" and "meaning_very_high" in config:
        result["meaning"] = config["meaning_very_high"]
    
    return result


def _evaluate_low_bad(metric, value, config, gender):
    """낮을수록 위험 (HDL)"""
    extremely_low = config.get("extremely_low")
    
    very_low = config.get(
        "very_low_male" if gender == 1 else "very_low_female",
        config.get("very_low")
    )
    normal_high = config.get("normal_high")
    
    if extremely_low and value < extremely_low:
        status = "extremely_high"
        label = "극도 위험 (매우 낮음)"
    elif very_low and value < very_low:
        status = "very_high"
        label = "저HDL 콜레스테롤 혈증"
    elif normal_high and value >= normal_high:
        status = "normal_good"
        label = "정상 (좋음/적정)"
    else:
        status = "normal"
        label = "정상"
    
    result = _make_result(metric, value, status, label, config, "low_bad")
    
    if status in ["very_high", "extremely_high"]:
        result["meaning"] = config.get("meaning_low", "정상보다 낮음")
    
    return result


def _evaluate_both(metric, value, config, gender, age=None):
    """양방향 위험"""
    if metric == "혈색소":
        return _evaluate_hemoglobin(value, config, gender)

    if metric == "수축기혈압":
        return _evaluate_sbp(value, config, age)
    
    # 일반 both
    very_low = _get_gender_val(config, "very_low", gender)
    low = _get_gender_val(config, "low", gender)
    high = _get_gender_val(config, "high", gender)
    very_high = _get_gender_val(config, "very_high", gender)
    
    if very_low and value < very_low:
        status = "very_low"
    elif low and value < low:
        status = "low"
    elif very_high and value >= very_high:
        status = "very_high"
    elif high and value >= high:
        status = "high"
    else:
        status = "normal"
    
    return _make_result(metric, value, status, None, config, "both")


def _evaluate_hemoglobin(value, config, gender):
    """혈색소 평가 - 출혈/빈혈 세분화"""
    extremely_low = config.get("extremely_low", 8)
    very_low = config.get("very_low", 10)
    
    low = config["low_male"] if gender == 1 else config["low_female"]
    high = config["high_male"] if gender == 1 else config["high_female"]
    very_high = config["very_high_male"] if gender == 1 else config["very_high_female"]
    
    if value <= extremely_low:
        status = "extremely_low"
        result = _make_result("혈색소", value, status, None, config, "both")
        result["meaning"] = config.get("meaning_extremely_low",
                                       "출혈 의심 - 즉시 정밀 검사 필요")
        return result
    elif value < very_low:
        status = "very_low"
        result = _make_result("혈색소", value, status, None, config, "both")
        result["meaning"] = config.get("meaning_very_low",
                                       "빈혈 의심 - 의학적 치료 필요")
        return result
    elif value < low:
        status = "low"
        result = _make_result("혈색소", value, status, None, config, "both")
        result["meaning"] = config.get("meaning_low", "경도 빈혈")
        return result
    elif value >= very_high:
        status = "very_high"
    elif value > high:
        status = "high"
    else:
        status = "normal"
    
    return _make_result("혈색소", value, status, None, config, "both")


def _evaluate_sbp(value, config, age=None):
    """수축기혈압 평가 - 주의 구간(120-129) 처리 + 노인(80+) 위험 임계 상향."""
    very_low = config.get("very_low", 90)
    caution = config.get("caution", 120)
    high = config.get("high", 130)
    very_high = config.get("very_high", 140)

    # 80세 이상은 위험(고혈압) 임계를 160으로 상향 (2026 지침 + 약대 자문).
    # 130-139 전단계·120-129 주의 구간은 그대로 두고, 140-159는 노인에서
    # '위험'이 아니라 '전단계(high)'로 완화해 과다경고를 막는다.
    elderly_applied = False
    if age is not None and age >= 80:
        very_high = config.get("very_high_elderly_80", 160)
        elderly_applied = True

    if value < very_low:
        status = "very_low"
    elif value >= very_high:
        status = "very_high"
    elif value >= high:
        status = "high"  # 고혈압 전단계 (130-139), 노인은 140-159도 여기
    elif value >= caution:
        status = "caution"  # 주의 혈압 (120-129)
    else:
        status = "normal"

    result = _make_result("수축기혈압", value, status, None, config, "both")

    meaning_map = {
        "very_low": config.get("meaning_low"),
        "caution": config.get("meaning_caution"),
        "high": config.get("meaning_high"),
        "very_high": config.get("meaning_very_high"),
    }
    if status in meaning_map and meaning_map[status]:
        result["meaning"] = meaning_map[status]

    if elderly_applied and status in ("high", "caution"):
        result["meaning"] += " ※ 80세 이상 - 위험 기준을 160으로 상향 적용"

    return result


def _evaluate_u_shape(metric, value, config):
    """U자형 (총콜레스테롤)"""
    very_low = config.get("very_low")
    low = config.get("low")
    high = config.get("high")
    very_high = config.get("very_high")
    
    if very_low and value < very_low:
        status = "very_low"
    elif low and value < low:
        status = "low"
    elif very_high and value >= very_high:
        status = "very_high"
    elif high and value >= high:
        status = "high"
    else:
        status = "normal"
    
    return _make_result(metric, value, status, None, config, "u_shape")


def _get_gender_val(config, key, gender):
    """성별별 임계값 가져오기 (없으면 공통값)"""
    gender_key = f"{key}_male" if gender == 1 else f"{key}_female"
    return config.get(gender_key, config.get(key))


def _make_result(metric, value, status, label_override, config, direction):
    """결과 dict 생성"""
    label, icon, color = STATUS_LABELS.get(status, ("?", "?", "#000"))
    if label_override:
        label = label_override
    
    meaning = ""
    if status == "extremely_low":
        meaning = config.get("meaning_extremely_low",
                             config.get("meaning_low", "정상보다 매우 낮음"))
    elif status in ["very_low", "low"]:
        meaning = config.get("meaning_low", "정상보다 낮음")
    elif status == "caution":
        meaning = config.get("meaning_caution", "주의 필요")
    elif status == "high":
        meaning = config.get("meaning_high", "정상보다 높음")
    elif status in ["very_high", "extremely_high"]:
        meaning = config.get("meaning_very_high",
                             config.get("meaning_high", "정상보다 매우 높음"))
    elif status == "normal_good":
        meaning = "좋은 수준"
    elif status == "normal":
        meaning = "정상 범위"
    
    return {
        "metric": metric,
        "value": value,
        "status": status,
        "label": label,
        "icon": icon,
        "color": color,
        "meaning": meaning,
        "direction": direction,
        "unit": config.get("unit", ""),
    }


def get_status_priority(status: str) -> int:
    """상태별 정렬 우선순위 (위험한 것 먼저)"""
    priority = {
        "extremely_high": 0,
        "extremely_low": 0,
        "very_high": 1,
        "very_low": 2,
        "high": 3,
        "low": 4,
        "caution": 5,
        "normal_good": 6,
        "normal": 7,
        "info": 8,
    }
    return priority.get(status, 99)


# ============================================================
# 테스트
# ============================================================
if __name__ == "__main__":
    print("=" * 70)
    print("thresholds.py v2 테스트")
    print("=" * 70)
    
    test_cases = [
        ("수축기혈압", 85, 1, 70, None, "노인 저혈압 - 경고 강화"),
        ("수축기혈압", 125, 1, 40, None, "주의 혈압 (120-129)"),
        ("수축기혈압", 135, 1, 40, None, "고혈압 전단계 (130-139)"),
        ("수축기혈압", 145, 1, 40, None, "고혈압 (>=140)"),
        ("수축기혈압", 118, 1, 40, {"hypertension": True}, "약물 복용 중 정상"),
        ("식전혈당(공복혈당)", 60, 2, 70, None, "노인 저혈당"),
        ("식전혈당(공복혈당)", 110, 1, 50, None, "공복혈당 장애"),
        ("LDL콜레스테롤", 95, 1, 50, {"diabetes": True}, "당뇨 환자 LDL 95 - 정상"),
        ("LDL콜레스테롤", 105, 1, 50, {"diabetes": True}, "당뇨 환자 LDL 105 - 위험"),
        ("LDL콜레스테롤", 105, 1, 50, {"diabetes": False}, "비당뇨 LDL 105 - 정상"),
        ("HDL콜레스테롤", 35, 1, 50, None, "남 HDL 35 - 저HDL"),
        ("HDL콜레스테롤", 65, 1, 50, None, "남 HDL 65 - 좋음"),
        ("혈청지피티(ALT)", 50, 1, 50, None, "ALT 50 - 주의"),
        ("혈청지피티(ALT)", 130, 1, 50, None, "ALT 130 - 위험 (3배)"),
        ("감마지티피", 80, 1, 50, None, "GGT 80 - 주의"),
        ("혈색소", 7, 1, 50, None, "남 Hb 7 - 출혈 의심"),
        ("혈색소", 9, 1, 50, None, "남 Hb 9 - 빈혈"),
        ("혈색소", 14, 1, 50, None, "남 Hb 14 - 정상"),
    ]
    
    for metric, value, gender, age, meds, desc in test_cases:
        result = evaluate_value(metric, value, gender, age, meds)
        elderly = " [노인경고]" if result.get("is_elderly_warning") else ""
        med = " [약물복용]" if result.get("on_medication") else ""
        print(f"\n[{desc}]")
        print(f"  {metric} = {value} ({result['label']}){elderly}{med}")
        print(f"  의미: {result['meaning']}")
        if "disclaimer" in result:
            print(f"  주의: {result['disclaimer']}")