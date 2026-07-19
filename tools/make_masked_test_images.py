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
