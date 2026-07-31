"""데모 페르소나(홍길동, 1968년생 남)의 8개 검진 회차를 실제 분석 파이프라인에 통과시켜
연도별 combo_analysis / recommendations 를 산출한다.

지어낸 값이 아니라 백엔드가 그 해 수치로 실제 계산한 결과를 그대로 뽑는 것이 목적이다.
결과는 JSON 한 벌로 떨어뜨리고, 프론트 더미 파일은 그걸 보고 만든다.
"""
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve()
# backend 루트를 sys.path에 넣는다 (app.* import 용)
BACKEND_ROOT = Path(
    r"C:\Users\seungjun\Documents\work\WITHUS\Health_Management_Service\worktrees\design-b\backend"
)
sys.path.insert(0, str(BACKEND_ROOT))

from app.analyzer._internal.pipeline import run_full_pipeline  # noqa: E402
from app.services.checkup_service import _inject_group_extras  # noqa: E402
from app.renal.gfr import Sex, analyze_renal  # noqa: E402
from app.analyzer._internal.timeseries_pipeline import run_timeseries_pipeline  # noqa: E402
from app.analyzer._internal.ocr_adapter import parse_ocr_json  # noqa: E402

# 프론트 RealEgfr는 백엔드 RenalStatus에 unit·method를 더한 모양이다(라우터가 붙여 내려준다).
EGFR_UNIT = "mL/min/1.73㎡"
EGFR_METHOD = "CKD-EPI 2021 (크레아티닌, 인종 항 제거)"
CRCL_METHOD = "Cockcroft-Gault"

BIRTH = "1968-01-01"
GENDER = "M"

# frontend-mobile/src/data.ts 의 reports 와 같은 값. 한 글자도 바꾸지 않는다.
YEARS = [
    dict(year=2010, date="2010-04-19", sbp=110, dbp=70, fbs=82, waist=76, ldl=101, hdl=58,
         tg=89, ast=21, alt=22, ggt=23, hb=14.7, creatinine=0.82, height=165.9, weight=59.5,
         total_cholesterol=175, urine_protein=1),
    dict(year=2012, date="2012-05-08", sbp=113, dbp=72, fbs=84, waist=78, ldl=106, hdl=56,
         tg=96, ast=22, alt=23, ggt=25, hb=14.8, creatinine=0.83, height=165.9, weight=60.6,
         total_cholesterol=180, urine_protein=1),
    dict(year=2014, date="2014-05-20", sbp=116, dbp=74, fbs=86, waist=80, ldl=112, hdl=54,
         tg=104, ast=23, alt=25, ggt=28, hb=14.9, creatinine=0.84, height=165.9, weight=61.9,
         total_cholesterol=187, urine_protein=1),
    dict(year=2016, date="2016-06-11", sbp=121, dbp=77, fbs=91, waist=82, ldl=120, hdl=51,
         tg=122, ast=24, alt=27, ggt=33, hb=15.0, creatinine=0.85, height=165.9, weight=64.1,
         total_cholesterol=195, urine_protein=1),
    dict(year=2018, date="2018-05-30", sbp=125, dbp=80, fbs=96, waist=85, ldl=129, hdl=48,
         tg=140, ast=26, alt=30, ggt=41, hb=15.1, creatinine=0.87, height=165.9, weight=65.8,
         total_cholesterol=205, urine_protein=1),
    dict(year=2020, date="2020-07-08", sbp=129, dbp=82, fbs=102, waist=87, ldl=134, hdl=45,
         tg=152, ast=29, alt=35, ggt=50, hb=15.2, creatinine=0.89, height=165.9, weight=67.2,
         total_cholesterol=209, urine_protein=1),
    dict(year=2022, date="2022-06-15", sbp=133, dbp=85, fbs=107, waist=90, ldl=140, hdl=42,
         tg=166, ast=31, alt=41, ggt=59, hb=15.3, creatinine=0.95, height=165.9, weight=69.4,
         total_cholesterol=215, urine_protein=1),
    dict(year=2024, date="2024-03-15", sbp=138, dbp=88, fbs=112, waist=93, ldl=145, hdl=39,
         tg=178, ast=34, alt=45, ggt=68, hb=15.4, creatinine=1.01, height=165.9, weight=72.4,
         total_cholesterol=220, urine_protein=1),
]

MEASURE_KEYS = [
    "height", "weight", "waist", "sbp", "dbp", "fbs", "total_cholesterol",
    "ldl", "hdl", "tg", "hb", "creatinine", "ast", "alt", "ggt", "urine_protein",
]


def build_ocr(row: dict) -> dict:
    return {
        "meta": {
            "exam_date": row["date"],
            "patient_birth": BIRTH,
            "patient_gender": GENDER,
        },
        "measurements": {k: {"value": row[k]} for k in MEASURE_KEYS},
        # 생활습관 — 8회차 전부 동일. data.ts initialProfile과 같은 값이어야
        # 분석(음주자·현재 흡연자)과 ④층 행동 제안(절주·금연)이 어긋나지 않는다.
        # 주당 280g은 MetALD 구간(남 210~420) 안이라 지방간 유형 판정과 앞뒤가 맞는다.
        "lifestyle": {"smoking": "current", "drinking": "yes", "alcohol_weekly_g": 280},
    }


def main() -> None:
    out = {}
    for row in YEARS:
        year = row["year"]
        age = year - 1968
        user_info = {
            "name": "홍길동",
            "gender": 1,
            "birth_year": 1968,
            "age": age,
            "medications": {},
        }
        result = run_full_pipeline(build_ocr(row), user_info)
        group_analysis = result.get("group_analysis") or {}
        combo = (group_analysis.get("combo_analysis") or {})
        if combo:
            _inject_group_extras(combo, group_analysis, user_info)
        # eGFR — 그 해 크레아티닌과 그 해 나이로 따로 계산한다(무상태 계산기).
        renal = analyze_renal(
            serum_cr=row["creatinine"], age=age, sex=Sex.MALE, weight_kg=row["weight"],
        ).to_dict()
        renal["unit"] = EGFR_UNIT
        renal["method"] = EGFR_METHOD
        if renal.get("crcl") is not None:
            renal["crcl_method"] = CRCL_METHOD

        out[str(year)] = {
            "age": age,
            "combo_analysis": combo,
            "recommendations": result.get("recommendations") or {},
            "egfr": renal,
            "warnings": (result.get("basic_report", {}).get("_meta", {}) or {}).get("warnings", []),
        }
        ms = (combo.get("metabolic_syndrome_detail") or {})
        print(f"{year} (age {age}): combo_keys={len(combo)} "
              f"matched={((combo.get('combo_groups') or {}).get('matched_count'))} "
              f"ms={ms.get('count')}/{ms.get('evaluable')} "
              f"calc={len(((combo.get('calculators') or {}).get('items')) or [])} "
              f"warn={len(out[str(year)]['warnings'])}")

    # ── 시계열 — 8개 회차를 통째로 넣어 히스토리 더미(highlights·change_pace·insight)를 산출.
    # 회차가 6개→8개, 기간이 10년→14년으로 늘었으므로 손으로 고치지 않고 다시 뽑는다.
    history = []
    last_basic = None
    for row in YEARS:
        parsed = parse_ocr_json(build_ocr(row))
        history.append({"year": row["year"], "checkup": parsed["checkup"]})
    ts_user_info = {"name": "홍길동", "gender": 1, "birth_year": 1968, "age": 2024 - 1968}
    last_basic = run_full_pipeline(build_ocr(YEARS[-1]), ts_user_info).get("basic_report")
    ts = run_timeseries_pipeline(ts_user_info, history, last_basic)
    out["_timeseries"] = {
        "year_range": ts.get("year_range"),
        "highlights": ts.get("highlights"),
        "change_pace": ts.get("change_pace"),
        "insight": ts.get("insight"),
    }
    print("timeseries:", ts.get("year_range"),
          "| highlights", len(ts.get("highlights") or []),
          "| change_pace", len(ts.get("change_pace") or []),
          "| insight", bool(ts.get("insight")))

    dest = Path(__file__).with_name("dummy_by_year.json")
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("WROTE", dest, dest.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
