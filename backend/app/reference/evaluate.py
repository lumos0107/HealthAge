"""검진 항목 평가 로직 (순수 함수, I/O 없음).

한 항목에 대해 두 가지를 동시에 평가한다:
  1) 정상값 비교(신규): 임상 정상 범위 대비 정상/주의/이상 + 벗어난 방향
  2) 평균 비교(기존 보완): 인구 평균 대비 차이/백분율/위치

배치 위치: backend/app/reference/evaluate.py
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

from app.reference.ranges import Direction, RefRange, Sex, get_reference

_ORDER = {"normal": 0, "caution": 1, "warning": 2}
_NEAR_PCT = 5.0  # 평균과 ±5% 이내면 'near'


@dataclass(frozen=True)
class ItemEvaluation:
    item: str
    value: float
    unit: str
    # --- 정상값 비교 (신규) ---
    normal_low: float | None
    normal_high: float | None
    normal_status: str       # normal | low | high
    severity: str            # normal | caution | warning
    in_normal_range: bool
    # --- 평균 비교 (기존 보완) ---
    population_mean: float | None
    diff_from_mean: float | None     # value - mean
    pct_from_mean: float | None      # (value-mean)/mean*100
    mean_position: str | None        # above | below | near

    def to_dict(self) -> dict:
        return asdict(self)


def _side_severity(value: float, normal_bound, abnormal_bound, *, high: bool) -> str:
    """한쪽(상/하한) 기준 severity 계산."""
    if normal_bound is None:
        return "normal"
    out = value > normal_bound if high else value < normal_bound
    if not out:
        return "normal"
    if abnormal_bound is not None:
        inside_caution = value < abnormal_bound if high else value > abnormal_bound
        if inside_caution:
            return "caution"
    return "warning"


def evaluate_normal(value: float, ref: RefRange) -> tuple[str, str, bool]:
    """정상 범위 대비 (status, severity, in_range) 반환."""
    high_sev = _side_severity(value, ref.normal_high, ref.abnormal_high, high=True)
    low_sev = _side_severity(value, ref.normal_low, ref.abnormal_low, high=False)

    # 방향성에 따라 평가 대상 한정
    if ref.direction == Direction.HIGH_BAD:
        low_sev = "normal"
    elif ref.direction == Direction.LOW_BAD:
        high_sev = "normal"
    # BOTH / U_SHAPE: 양쪽 모두 평가

    if high_sev != "normal" and _ORDER[high_sev] >= _ORDER[low_sev]:
        return "high", high_sev, False
    if low_sev != "normal":
        return "low", low_sev, False
    return "normal", "normal", True


def evaluate_against_mean(value: float, mean: float | None):
    """인구 평균 대비 (diff, pct, position) 반환."""
    if mean is None:
        return None, None, None
    diff = round(value - mean, 2)
    if mean == 0:
        return diff, None, ("above" if diff > 0 else "below" if diff < 0 else "near")
    pct = round((value - mean) / mean * 100, 1)
    if abs(pct) < _NEAR_PCT:
        pos = "near"
    elif pct > 0:
        pos = "above"
    else:
        pos = "below"
    return diff, pct, pos


def evaluate_item(
    item: str,
    value: float,
    sex: Sex | None = None,
    population_mean: float | None = None,
) -> ItemEvaluation:
    """항목 하나에 대해 정상값·평균 비교를 한 번에 수행."""
    ref = get_reference(item, sex)
    status, severity, in_range = evaluate_normal(value, ref)
    diff, pct, pos = evaluate_against_mean(value, population_mean)
    return ItemEvaluation(
        item=item, value=value, unit=ref.unit,
        normal_low=ref.normal_low, normal_high=ref.normal_high,
        normal_status=status, severity=severity, in_normal_range=in_range,
        population_mean=population_mean, diff_from_mean=diff,
        pct_from_mean=pct, mean_position=pos,
    )
