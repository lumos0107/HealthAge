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
    # 만 40세부터 국가 일반검진 대상이라 2008년(40세)이 첫 회차다.
    # 2008~2012는 «건강한 편이지만 100점은 아닌» 구간 — 40세에 감점이 하나도 없는
    # 검진표는 드물다. 총콜레스테롤 201처럼 하나씩 걸치는 쪽이 실제에 가깝다.
    # 점수는 주의 −6 · 위험 −12 단위로만 움직이므로 «아주 조금씩»의 최소 단위가 6점이다.
    dict(year=2008, date="2008-05-14", sbp=117, dbp=74, fbs=90, waist=80, ldl=123, hdl=54,
         tg=126, ast=22, alt=24, ggt=30, hb=14.6, creatinine=0.80, height=165.9, weight=61.1,
         total_cholesterol=201, urine_protein=1),
    dict(year=2010, date="2010-04-19", sbp=120, dbp=76, fbs=93, waist=82, ldl=127, hdl=52,
         tg=132, ast=23, alt=25, ggt=34, hb=14.7, creatinine=0.82, height=165.9, weight=62.2,
         total_cholesterol=202, urine_protein=1),
    dict(year=2012, date="2012-05-08", sbp=122, dbp=78, fbs=96, waist=83, ldl=131, hdl=50,
         tg=138, ast=24, alt=26, ggt=38, hb=14.8, creatinine=0.83, height=165.9, weight=63.0,
         total_cholesterol=204, urine_protein=1),
    dict(year=2014, date="2014-05-20", sbp=126, dbp=81, fbs=101, waist=85, ldl=134, hdl=46,
         tg=144, ast=25, alt=28, ggt=44, hb=14.9, creatinine=0.85, height=165.9, weight=65.0,
         total_cholesterol=206, urine_protein=1),
    dict(year=2016, date="2016-06-11", sbp=130, dbp=83, fbs=104, waist=88, ldl=140, hdl=42,
         tg=156, ast=27, alt=32, ggt=66, hb=15.0, creatinine=0.88, height=165.9, weight=67.2,
         total_cholesterol=210, urine_protein=1),
    dict(year=2018, date="2018-05-30", sbp=133, dbp=84, fbs=108, waist=92, ldl=144, hdl=41,
         tg=165, ast=30, alt=37, ggt=72, hb=15.1, creatinine=0.93, height=165.9, weight=69.9,
         total_cholesterol=214, urine_protein=1),
    # ⚠️ 바닥. AST보다 ALT를 확실히 높게 둔다 — HSI = 8×(ALT/AST) + BMI 라서 둘이 비슷하면
    #    HSI가 36을 못 넘고, 그러면 「지방간 유형(MASLD/MetALD/ALD)」 판정이 **어느 연도에도
    #    안 뜬다**. 앱 기능 하나가 데모에서 통째로 사라진다. 지방간에서 ALT 우세는 전형이다.
    dict(year=2020, date="2020-07-08", sbp=139, dbp=89, fbs=120, waist=96, ldl=153, hdl=36,
         tg=196, ast=34, alt=47, ggt=82, hb=15.2, creatinine=1.05, height=165.9, weight=74.3,
         total_cholesterol=228, urine_protein=1),
    # 여기서부터 회복. 근거문서(2026-07-30-생활습관-효과크기-근거.md)에 맞춰 항목마다
    # 반응 속도를 달리했다:
    #   · 감마-GTP는 절주에 가장 빨리 반응한다(반감기 26일) → 82 → 68 → 64
    #   · ALT는 식이+운동 병행에서 크게 떨어진다(−13.27, 등급 A) → 47 → 38 → 33
    #   · **LDL은 체중 감량으로 움직이지 않는다(§6-9)** → 153 → 147 → 145 로 거의 그대로.
    #     함께 떨어뜨리면 「다음 검진 목표」가 "체중을 줄여도 LDL은 안 움직입니다"라고
    #     말하는 바로 그 화면과 데모가 모순된다.
    #   · 신장은 회복이 느리다 → 크레아티닌 1.05 → 1.02 → 0.99 로 조금씩만
    dict(year=2022, date="2022-06-15", sbp=136, dbp=84, fbs=113, waist=91, ldl=147, hdl=38,
         tg=174, ast=30, alt=38, ggt=68, hb=15.1, creatinine=1.02, height=165.9, weight=71.3,
         total_cholesterol=219, urine_protein=1),
    # ⚠️ 2024를 더 좋게 만들면 안 된다. 이탈도(대사증후군 5기준에서 벗어난 정도)가
    #    0.05까지 내려가면 「다음 검진 목표」에서 체중·유산소·절주 세 행동이 **완전 동점**이
    #    되고 금연은 0%가 되어 사라진다 — 어떤 행동이든 한 번에 전부 기준 아래로
    #    내려버리기 때문이다. 효과크기로 우선순위를 매기는 기능(A-2)이 데모에서 안 보인다.
    dict(year=2024, date="2024-03-15", sbp=134, dbp=85, fbs=110, waist=88, ldl=145, hdl=39,
         tg=168, ast=27, alt=33, ggt=64, hb=15.1, creatinine=0.99, height=165.9, weight=69.4,
         total_cholesterol=216, urine_protein=1),
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
