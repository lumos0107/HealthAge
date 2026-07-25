"""저장된 리포트 재분석 → analysis_results in-place 갱신.

목적: A 또래비교(peer_label) 등 최신 analyzer 산출을 이미 저장된 리포트에 반영.
저장된 checkup_records(검진 수치)를 ocr_json으로 역변환 → analyze_and_save(save=False)로
재분석 → analysis_results의 basic_report/comprehensive/recommendations/combo_analysis를
서비스 클라이언트로 UPDATE(in-place, checkup_records·timeseries 불변).

실행:
  DRY(확인만):   .venv/Scripts/python.exe -m scripts.dev.reanalyze_reports
  실제 반영:      APPLY=1 .venv/Scripts/python.exe -m scripts.dev.reanalyze_reports
"""
import asyncio
import os

from app.db import get_service_client
from app.services.checkup_service import analyze_and_save

# checkup_records 컬럼 → ocr measurements 키 (역변환; _ocr_to_checkup_row의 반대)
REV = {
    "height_cm": "height", "weight_kg": "weight", "bmi": "bmi", "waist_cm": "waist",
    "sbp": "sbp", "dbp": "dbp", "fbs": "fbs",
    "total_cholesterol": "total_cholesterol", "ldl": "ldl", "hdl": "hdl", "tg": "tg",
    "ast": "ast", "alt": "alt", "ggt": "ggt", "hb": "hb", "creatinine": "creatinine",
}
SMOKE = {1: "non", 2: "former", 3: "current"}
DRINK = {0: "no", 1: "yes"}


def build_ocr(rec: dict) -> dict:
    meas: dict = {}
    for col, k in REV.items():
        v = rec.get(col)
        if v is not None:
            meas[k] = v
    if rec.get("urine_protein") is not None:
        meas["urine_protein"] = {"code": rec["urine_protein"]}
    life: dict = {}
    if rec.get("smoking") is not None and rec["smoking"] in SMOKE:
        life["smoking"] = SMOKE[rec["smoking"]]
    if rec.get("drinking") is not None and rec["drinking"] in DRINK:
        life["drinking"] = DRINK[rec["drinking"]]
    return {
        "measurements": meas,
        "lifestyle": life,
        "meta": {"exam_date": rec.get("exam_date"), "hospital": rec.get("hospital")},
    }


async def main() -> None:
    apply = os.environ.get("APPLY") == "1"
    c = get_service_client()
    ars = c.table("analysis_results").select(
        "analysis_id,record_id,user_id"
    ).execute().data

    print(f"{'APPLY' if apply else 'DRY-RUN'} — 대상 {len(ars)}건\n")
    for a in ars:
        rec = (
            c.table("checkup_records").select("*")
            .eq("record_id", a["record_id"]).single().execute().data
        )
        ocr = build_ocr(rec)
        res = await analyze_and_save(
            user_client=c, user_id=a["user_id"], ocr_json=ocr, save=False,
        )
        ca = res.get("combo_analysis") or {}
        items = (ca.get("calculators") or {}).get("items") or []
        peer = [it for it in items if it.get("peer_label")]
        yr = rec.get("exam_year")
        peer_str = ", ".join(f"{it['key']}={it['peer_label']}" for it in peer)
        print(f"[{yr}] rec={a['record_id'][:8]} calc={len(items)} peer={len(peer)}  {peer_str}")
        if res.get("warnings"):
            print(f"      warnings: {res['warnings']}")

        if apply:
            c.table("analysis_results").update({
                "basic_report": res.get("basic_report"),
                "comprehensive": res.get("comprehensive"),
                "recommendations": res.get("recommendations"),
                "combo_analysis": ca,
            }).eq("analysis_id", a["analysis_id"]).execute()
            print(f"      → UPDATED analysis_id={a['analysis_id'][:8]}")

    print("\n완료" + (" (반영됨)" if apply else " — APPLY=1 로 실제 반영"))


if __name__ == "__main__":
    asyncio.run(main())
