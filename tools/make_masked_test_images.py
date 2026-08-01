"""검진 결과지의 개인정보를 가짜 값으로 바꾼 OCR 테스트용 이미지를 만든다.

가리지 않고 치환하는 이유: OCR meta 파이프라인이 주민번호 앞 7자리에서
생년월일·성별을 뽑고 그것이 분석의 나이·성별 입력이 된다. 통째로 가리면
파이프라인의 핵심 경로가 테스트되지 않는다.

PDF가 아니라 이미지로 렌더링하므로 텍스트 레이어가 남지 않는다.
원본은 읽기만 한다.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import fitz

SRC = Path(r"C:\Users\seungjun\Desktop\윗어스\건강검진표본데이터")
DST = Path(r"C:\Users\seungjun\Documents\work\WITHUS\테스트검진지_마스킹")
DPI = 200
FONT = r"C:\Windows\Fonts\malgun.ttf"

# 파일별 가짜 인적사항. 성별·연령대를 일부러 다양하게 섞어 분석 분기를 두루 태운다.
# rrn = 생년월일 6자리 + 성별코드(1=남,2=여) → OCR이 여기서 나이·성별을 뽑는다.
TARGETS = {
    "2-20260501210656463.pdf": ("general_01", "홍길동", "700101-1"),  # 남, 1970년생
    "2-20260501210729800.pdf": ("general_02", "김영희", "651115-2"),  # 여, 1965년생
    "3-20260501210620530.pdf": ("general_03", "박철수", "580320-1"),  # 남, 1958년생(노인 분기)
    "3-20260501210709722.pdf": ("general_04", "이민정", "820707-2"),  # 여, 1982년생
    "1-20260501210640074.pdf": ("general_05", "최상현", "751225-1"),  # 남, 1975년생
    "2-20260501210142154.pdf": ("summary_01", "정수민", "900510-2"),  # 여, 1990년생
}

RRN_PATTERNS = [
    re.compile(r"\d{6}\s*[-–]\s*\d[\*\d]{5,7}"),
    re.compile(r"\d{6}\s*[-–]\s*\d{7}"),
]
CONTACT_PATTERNS = [
    re.compile(r"0\d{1,2}[-–)]\s*\d{3,4}[-–]\d{4}"),  # 전화번호
    re.compile(r"\d{4}[-–]\d{4}[-–]\d{4}"),           # 식별번호
]
NAME_LABEL = re.compile(r"성\s*명|이\s*름|수검자|대상자")
ADDRESS_LABEL = re.compile(r"주\s*소|전\s*화|연락처|휴대")

# ── 검진의사 인적사항 ────────────────────────────────────────────────────────
# ⚠️ 수검자만 가리면 부족하다. 결과통보서 마지막 장에는 **실존 검진의사의 이름과
#    면허(자격)번호**, 요양기관기호가 그대로 있다. 이 이미지는 시연 부스·발표에서
#    화면에 띄우는 자료라, 남겨두면 실존 의료인의 면허번호를 공개 전시하게 된다.
#    (실제로 1차 산출물 general_01_p3에 "(검진의사 이름) / (면허번호) / (요양기관기호)"가 남아 있었다)
#
#    수검자 이름 치환 로직(real_names)이 이걸 못 잡은 이유: 표 셀이라 '성명' 라벨과
#    값이 PDF 텍스트 스트림에서 떨어져 있어 `성명\s*(이름)` 정규식이 안 걸린다.
#    그래서 라벨이 아니라 **라인 단위**로 잡는다.
DOCTOR_LINE = re.compile(r"검진의사|판정의사|면허\s*\(?\s*자격\s*\)?\s*번호|요양기관기호")
FAKE_DOCTOR = "김의사"
NUM_TOKEN = re.compile(r"^\d{4,12}$")
# 이 라인 안에서 «값»이 아니라 «라벨»인 한글 토막들 — 치환 대상에서 뺀다.
DOCTOR_LABELS = {
    "성명", "이름", "번호", "면허", "자격", "검진의사", "판정의사",
    "요양기관기호", "판정일", "귀하", "직인",
}


def _is_date_like(token: str) -> bool:
    """20200101처럼 날짜로 읽히는 8자리는 남긴다 — 판정일이 000000으로 바뀌면
    화면이 고장 난 것처럼 보인다. 면허번호·요양기관기호만 지우는 게 목적이다."""
    if len(token) != 8 or not token.isdigit():
        return False
    year, month, day = int(token[:4]), int(token[4:6]), int(token[6:])
    return 1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31


def real_names(doc) -> set[str]:
    """원본에 등장하는 사람 이름(소견 본문의 '○○○님' 포함)."""
    text = "".join(p.get_text() for p in doc)
    found = set(re.findall(r"([가-힣]{2,4})\s*님", text))
    found |= set(re.findall(r"(?:성\s*명|이\s*름|수검자|대상자)\s*[:：]?\s*([가-힣]{2,4})", text))
    return {n for n in found if n not in {"환자", "고객", "귀하", "본인", "선생"}}


def replace(page, rect: fitz.Rect, text: str, size: float) -> None:
    """해당 영역을 흰색으로 덮고 그 자리에 대체 텍스트를 쓴다."""
    pad = fitz.Rect(rect.x0 - 1, rect.y0 - 1, rect.x1 + 1, rect.y1 + 1)
    page.draw_rect(pad, color=(1, 1, 1), fill=(1, 1, 1))
    page.insert_text(
        (rect.x0, rect.y1 - size * 0.18),
        text,
        fontsize=size,
        fontfile=FONT,
        fontname="malgun",
        color=(0, 0, 0),
    )


def mask_issuer_block(page) -> None:
    """발급 정보의 «검진의사 실명 · 면허번호 · 요양기관기호»를 지운다.

    ⚠️ 라벨로는 못 잡는다. 이 양식은 «검진의사» «면허(자격)번호» «성명» «요양기관기호»가
       전부 **텍스트가 아니라 양식 그림**이라 page.search_for()가 0 hit이다.
       (라인 매칭·라벨 오른쪽 마스킹을 두 번 시도해 둘 다 실패한 뒤 PDF span을 열어 확인)
       텍스트로 존재하는 건 **값뿐**이다: '(판정일)' '(면허번호)' '(검진의사 이름)' '(요양기관기호)'.

    그래서 값을 직접 잡는다:
      ① 5자리 이상 순수 숫자 중 날짜로 안 읽히는 것 → 면허번호·요양기관기호 → 0으로
      ② 그 숫자와 **같은 y 띠**에 있는 한글 2~4자 → 검진의사 이름 → 가짜 이름

    ②를 y 띠로 좁히는 이유: 페이지 전체에서 «한글 2~4자»를 지우면 '기타질환'·'내원' 같은
    양식 값까지 날아간다. 병원명(13자)은 길이에서 걸러진다.
    """
    spans = [
        (s["text"].strip(), fitz.Rect(s["bbox"]), s["size"])
        for b in page.get_text("dict")["blocks"]
        for ln in b.get("lines", [])
        for s in ln["spans"]
        if s["text"].strip()
    ]

    id_bands: list[float] = []
    for text, rect, size in spans:
        if text.isdigit() and len(text) >= 5 and not _is_date_like(text):
            replace(page, rect, "0" * len(text), size)
            id_bands.append((rect.y0 + rect.y1) / 2)

    for text, rect, size in spans:
        if not re.fullmatch(r"[가-힣]{2,4}", text):
            continue
        mid = (rect.y0 + rect.y1) / 2
        if any(abs(mid - band) <= 4 for band in id_bands):
            replace(page, rect, FAKE_DOCTOR, size)


def process_page(page, fake_name: str, fake_rrn: str, names: set[str]) -> None:
    # 1) 인적사항 라인: 성명 값과 주민번호를 가짜 값으로 치환
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = line["spans"]
            joined = "".join(s["text"] for s in spans)

            # 주소·전화는 분석에 불필요 → 라인 통째로 가림
            if ADDRESS_LABEL.search(joined) or any(p.search(joined) for p in CONTACT_PATTERNS):
                x0, y0, x1, y1 = line["bbox"]
                page.draw_rect(fitz.Rect(0, y0 - 2, page.rect.width, y1 + 2),
                               color=(0, 0, 0), fill=(0, 0, 0))
                continue

            for idx, span in enumerate(spans):
                text, rect = span["text"], fitz.Rect(span["bbox"])
                size = span["size"]

                # 주민번호 → 가짜 번호
                if any(p.search(text) for p in RRN_PATTERNS):
                    replace(page, rect, fake_rrn, size)
                    continue

                # '성명' 라벨 바로 다음 span = 이름 값 → 가짜 이름
                if idx > 0 and NAME_LABEL.search(spans[idx - 1]["text"]):
                    if text.strip() and len(text.strip()) <= 5:
                        replace(page, rect, fake_name, size)

    # 1-b) 검진의사 인적사항 — 라벨의 «오른쪽 띠»를 통째로 가린다.
    #      ⚠️ 라인 단위로는 못 잡는다. 표 셀이라 PDF 텍스트 스트림에서 '검진의사'와
    #         '(검진의사 이름)'이 서로 다른 line으로 떨어져 나온다(1차 시도 실패 원인).
    #         그래서 라벨 rect를 찾아 그 y 띠의 오른쪽을 지우는 방식으로 간다.
    mask_issuer_block(page)

    # 2) 소견 본문에 섞인 실명 → 가짜 이름
    for name in names:
        for rect in page.search_for(name):
            replace(page, rect, fake_name, max(rect.height * 0.78, 7))

    # 3) 하단 발급자·직인 영역
    h, w = page.rect.height, page.rect.width
    page.draw_rect(fitz.Rect(0, h * 0.93, w, h), color=(0, 0, 0), fill=(0, 0, 0))


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    made = 0
    for src_name, (stem, fake_name, fake_rrn) in TARGETS.items():
        src = SRC / src_name
        if not src.exists():
            print(f"없음: {src_name}")
            continue
        doc = fitz.open(src)
        pages = len(doc)
        names = real_names(doc)
        for i, page in enumerate(doc, 1):
            process_page(page, fake_name, fake_rrn, names)
            suffix = f"_p{i}" if pages > 1 else ""
            page.get_pixmap(dpi=DPI).save(DST / f"{stem}{suffix}.png")
            made += 1
        doc.close()
        print(f"{stem}: {pages}p  (가짜 인적사항 {fake_name} / {fake_rrn}******)")
    print(f"\n이미지 {made}장 생성: {DST}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
