"""신장 기능(eGFR) 계산 — CKD-EPI 2021 (크레아티닌, 인종 항 제거).

순수 로직만 포함한다. 파일/DB/프레임워크 의존성 없음.
배치 위치: backend/app/renal/gfr.py
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from enum import Enum


class Sex(str, Enum):
    MALE = "M"
    FEMALE = "F"


# 성별별 CKD-EPI 2021 계수: (kappa(=임계값), alpha)
_COEF: dict[Sex, tuple[float, float]] = {
    Sex.FEMALE: (0.7, -0.241),
    Sex.MALE: (0.9, -0.302),
}


@dataclass(frozen=True)
class RenalStatus:
    egfr: float        # mL/min/1.73㎡
    stage: str         # G1, G2, G3a, G3b, G4, G5
    label: str         # 프론트 표시용 한글 라벨
    description: str   # 한 줄 설명
    severity: str      # normal | caution | warning | danger (UI 색상 매핑용)

    def to_dict(self) -> dict:
        return asdict(self)


def calculate_egfr(serum_cr: float, age: int, sex: Sex) -> float:
    """CKD-EPI 2021 크레아티닌 식으로 eGFR 계산.

    eGFR = 142 × (Scr/κ)^B × 0.9938^age × (1.012 if female)
        - B = alpha            (Scr ≤ κ)
        - B = -1.200           (Scr > κ)

    Args:
        serum_cr: 혈청 크레아티닌 (mg/dL)
        age: 만 나이
        sex: Sex.MALE / Sex.FEMALE

    Returns:
        eGFR (mL/min/1.73㎡), 소수점 1자리 반올림
    """
    if serum_cr <= 0:
        raise ValueError("serum_cr(크레아티닌)은 0보다 커야 합니다.")
    if age <= 0:
        raise ValueError("age(나이)는 0보다 커야 합니다.")

    kappa, alpha = _COEF[sex]
    exponent = alpha if serum_cr <= kappa else -1.200
    egfr = 142.0 * (serum_cr / kappa) ** exponent * 0.9938 ** age
    if sex == Sex.FEMALE:
        egfr *= 1.012
    return round(egfr, 1)


def classify_stage(egfr: float) -> tuple[str, str, str, str]:
    """eGFR -> (stage, label, description, severity).

    주의: G1/G2(>=60)는 신손상 표지자(단백뇨 등)가 없으면 CKD로 단정할 수
    없으므로 라벨을 '정상 범주' 수준으로만 표기한다.
    """
    if egfr >= 90:
        return ("G1", "정상 또는 높음", "사구체여과율 정상 범위", "normal")
    if egfr >= 60:
        return ("G2", "경도 감소", "경미한 신기능 저하 (단독으로는 정상 범주)", "caution")
    if egfr >= 45:
        return ("G3a", "경도~중등도 감소", "신기능이 다소 저하됨", "warning")
    if egfr >= 30:
        return ("G3b", "중등도~중증 감소", "신기능 저하가 진행됨", "warning")
    if egfr >= 15:
        return ("G4", "중증 감소", "신기능이 크게 저하됨", "danger")
    return ("G5", "신부전", "말기 신부전 수준", "danger")


def analyze_renal(serum_cr: float, age: int, sex: Sex) -> RenalStatus:
    """크레아티닌/나이/성별 -> 신장 상태(eGFR + 병기) 한 번에 반환."""
    egfr = calculate_egfr(serum_cr, age, sex)
    stage, label, desc, severity = classify_stage(egfr)
    return RenalStatus(
        egfr=egfr, stage=stage, label=label,
        description=desc, severity=severity,
    )


if __name__ == "__main__":
    # 간단 동작 확인
    print(analyze_renal(serum_cr=0.6, age=50, sex=Sex.FEMALE).to_dict())
    print(analyze_renal(serum_cr=1.0, age=55, sex=Sex.MALE).to_dict())
    print(analyze_renal(serum_cr=2.5, age=60, sex=Sex.FEMALE).to_dict())
