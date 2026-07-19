"""HIRA '내가 먹는 약! 한눈에' 개인투약이력 엑셀 파서.

사용자가 직접 내려받은 생일-암호 엑셀(.xls, 내부는 xlsx/CDFV2 암호화)을
복호화하여 정규화된 투약이력으로 반환한다.

보안 원칙
- 비밀번호(생일)와 원본 암호 파일은 저장하지 않는다. 메모리에서만 복호화.
- 저장은 파싱된 결과(MedicationRecord)만, 보관 범위는 호출 측에서 결정.
"""
from __future__ import annotations

import io

import msoffcrypto
import pandas as pd

from .models import MedicationRecord

# 엑셀 헤더(파일 첫 유효행) → 내부 표준 필드명
_COLUMN_MAP = {
    "조제일자": "dispensed_date",
    "처방기관": "prescriber",
    "조제기관": "dispenser",
    "제품명": "product_name",
    "약효분류": "efficacy_class",
    "성분명": "ingredient_en",
    "약품코드": "drug_code",
    "단위": "unit",
    "1회 투약량": "dose_per_time",
    "1일 투여횟수": "times_per_day",
    "총 투약일수": "total_days",
    "안전성 서한(속보)": "safety_alert",
    "항혈전제 여부": "antithrombotic",
}
_HEADER_ANCHOR = "번호"  # 안내문 행을 건너뛰기 위한 헤더 탐지 기준


class PasswordError(ValueError):
    """생일 암호가 파일과 일치하지 않음."""


class ParseError(ValueError):
    """파일 구조가 예상과 다름 (HIRA 포맷 변경 등)."""


def normalize_birthday(b: str) -> str:
    """'2003-03-05' / '2003.03.05' → '20030305' 형태로 정규화."""
    return b.replace("-", "").replace(".", "").replace("/", "").strip()


def _decrypt(file_bytes: bytes, birthday: str) -> io.BytesIO:
    dec = io.BytesIO()
    of = msoffcrypto.OfficeFile(io.BytesIO(file_bytes))
    try:
        of.load_key(password=birthday)
        of.decrypt(dec)
    except msoffcrypto.exceptions.InvalidKeyError as e:
        raise PasswordError("생일 암호가 일치하지 않습니다.") from e
    dec.seek(0)
    return dec


def parse_medication_history(file_bytes: bytes, birthday: str) -> list[MedicationRecord]:
    """복호화 + 안내문 스킵 + 헤더 정규화 후 MedicationRecord 리스트 반환."""
    dec = _decrypt(file_bytes, normalize_birthday(birthday))
    try:
        raw = pd.read_excel(dec, sheet_name=0, header=None)
    except Exception as e:  # noqa: BLE001
        raise ParseError(f"엑셀을 읽지 못했습니다: {e}") from e

    anchor = raw.index[raw[0].astype(str).str.strip() == _HEADER_ANCHOR]
    if len(anchor) == 0:
        raise ParseError(f"헤더 행('{_HEADER_ANCHOR}')을 찾지 못했습니다. HIRA 포맷 확인 필요.")
    h = anchor[0]

    df = raw.iloc[h + 1:].copy()
    df.columns = [str(c).strip() for c in raw.iloc[h].tolist()]
    df = df.dropna(how="all").reset_index(drop=True)
    df = df.rename(columns={k: v for k, v in _COLUMN_MAP.items() if k in df.columns})

    return [_row_to_record(r) for _, r in df.iterrows()]


def open_history(
    file_bytes: bytes,
    stored_birthday: str | None = None,
    manual_birthday: str | None = None,
) -> list[MedicationRecord]:
    """저장된 생일을 우선 시도, 실패 시 수동 입력으로 폴백.

    가족/대리인 파일처럼 로그인 사용자와 생일이 다를 때를 위해 둘 다 받는다.
    """
    candidates = [b for b in (stored_birthday, manual_birthday) if b]
    if not candidates:
        raise PasswordError("생일 정보가 없습니다.")
    last: Exception | None = None
    for pw in candidates:
        try:
            return parse_medication_history(file_bytes, pw)
        except PasswordError as e:
            last = e
    raise PasswordError("생일 암호 불일치 — 수동 입력이 필요합니다.") from last


def _row_to_record(r) -> MedicationRecord:
    return MedicationRecord(
        dispensed_date=_s(r.get("dispensed_date")),
        product_name=_s(r.get("product_name")),
        efficacy_class=_s(r.get("efficacy_class")),
        ingredient_en=_s(r.get("ingredient_en")),
        total_days=_i(r.get("total_days")),
        times_per_day=_i(r.get("times_per_day")),
        dose_per_time=_s_or_none(r.get("dose_per_time")),
        unit=_s_or_none(r.get("unit")),
        drug_code=_s_or_none(r.get("drug_code")),
        prescriber=_s_or_none(r.get("prescriber")),
        dispenser=_s_or_none(r.get("dispenser")),
        safety_alert=_s_or_none(r.get("safety_alert")),
        antithrombotic=_s_or_none(r.get("antithrombotic")),
    )


def _s(v) -> str:
    return "" if _na(v) else str(v).strip()


def _s_or_none(v) -> str | None:
    return None if _na(v) else str(v).strip()


def _i(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _na(v) -> bool:
    return v is None or (isinstance(v, float) and pd.isna(v))
