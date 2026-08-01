"""dummy_by_year.json → frontend-mobile/src/dummyAnalysis.ts 의 «생성 구역»만 갈아 끼운다.

이 파일이 필요한 이유: dummyAnalysis.ts는 8천 줄이라 수치를 바꿀 때마다 손으로 옮겨
적을 수 없다. 그런데 파일 전체가 생성물인 것도 아니다 — 아래 세 부분은 사람이 쓴다.

  · 맨 위 머리말(회차별 흐름 표)
  · dummyHighlights / dummyInsight — 백엔드 산출 문구가 "…은(는) 14년간 변화 폭이
    같은 연령대 평균(+1.5)보다 큽니다"처럼 읽기 어려워, 사람이 다시 쓴 것이다
  · 맨 아래 simulateDemo() — 데모 계정용 What-if 재계산 로직

그래서 «앵커 사이»만 바꾼다. 앵커는 export 선언문 그대로다 — 주석이나 머리말을
고쳐도 안 깨지고, 손으로 쓴 구역은 건드리지 않는다.

사용:  uv run python ../tools/gen_dummy_analysis_ts.py     (backend 디렉터리에서)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "dummy_by_year.json"
DEST = ROOT / "frontend-mobile" / "src" / "dummyAnalysis.ts"

# (여는 앵커, 닫는 앵커, JSON에서 꺼낼 키, TS 타입)
# 닫는 앵커는 «다음 블록의 시작»이다 — 블록 끝을 '};'로 잡으면 JSON 안의 중괄호와 헷갈린다.
BLOCKS = [
    ("export const dummyEgfrByYear: Record<number, RealEgfr> = {",
     "/** 연도별 조합·집단군·계산기·모집단 통계.",
     "egfr", "RealEgfr"),
    ("export const dummyComboAnalysisByYear: Record<number, RealComboAnalysis> = {",
     "/** 연도별 권장사항.",
     "combo_analysis", "RealComboAnalysis"),
    ("export const dummyRecommendationsByYear: Record<number, RealRecommendations> = {",
     "// 백엔드 analyze_timeseries()",
     "recommendations", "RealRecommendations"),
]

PACE_OPEN = "export const dummyChangePace: NonNullable<RealTimeseries['change_pace']> = ["
PACE_CLOSE = "export const dummyHighlights:"


def year_entries(data: dict, key: str, ts_type: str) -> str:
    """연도별 JSON을 `  2010: ({ … }) as unknown as T,` 꼴로 늘어놓는다."""
    out = []
    for year in sorted(k for k in data if k.isdigit()):
        body = json.dumps(data[year][key], ensure_ascii=False, indent=1)
        out.append(f"  {year}: ({body}) as unknown as {ts_type},")
    return "\n".join(out)


def replace_between(text: str, open_anchor: str, close_anchor: str, body: str) -> str:
    i = text.index(open_anchor) + len(open_anchor)
    j = text.index(close_anchor, i)
    # 닫는 앵커 앞의 '};' 와 빈 줄은 그대로 둔다 — 그 사이만 새 본문으로 바꾼다.
    tail_start = text.rindex("};", i, j)
    return text[:i] + "\n" + body + "\n" + text[tail_start:]


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    text = DEST.read_text(encoding="utf-8")

    for open_anchor, close_anchor, key, ts_type in BLOCKS:
        text = replace_between(text, open_anchor, close_anchor, year_entries(data, key, ts_type))
        print(f"  갱신: {ts_type}")

    # change_pace 는 배열이라 따로 — 닫는 것이 '];' 다.
    pace = json.dumps(data["_timeseries"]["change_pace"], ensure_ascii=False, indent=1)
    i = text.index(PACE_OPEN) + len(PACE_OPEN)
    j = text.index(PACE_CLOSE, i)
    tail_start = text.rindex("];", i, j)
    text = text[:i] + "\n" + pace.strip()[1:-1].strip("\n") + "\n" + text[tail_start:]
    print("  갱신: dummyChangePace")

    DEST.write_text(text, encoding="utf-8")
    print("WROTE", DEST, f"{len(text):,} chars")
    print()
    print("⚠️ 손으로 고쳐야 하는 것 — 이 스크립트는 건드리지 않는다:")
    print("   · 맨 위 머리말의 회차별 흐름 표")
    print("   · dummyHighlights / dummyInsight (사람이 쓴 문장)")


if __name__ == "__main__":
    main()
