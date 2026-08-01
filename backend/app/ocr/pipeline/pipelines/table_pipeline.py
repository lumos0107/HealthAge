"""
표 파이프라인 (호출 분리 버전).

크롭된 표 영역 이미지를 받아 2회 LLM 호출로 정보 추출:
  - 1차 호출: 그룹 A (신체/혈압/혈당/일반혈액/신장/소변) → 9개 항목
  - 2차 호출: 그룹 B (지질/간기능/생활습관) → 9개 항목

각 호출은 독립적. 한쪽이 실패해도 다른 쪽 결과는 보존.
양식 독립적 — 항목이 수치/체크박스/그래픽 중 어떻게 표현되든 LLM이 인식.
"""

from __future__ import annotations
import copy

from PIL import Image

from app.ocr.pipeline import config
from app.ocr.pipeline.pipelines.base import BasePipeline
from app.ocr.pipeline.utils import image_utils, ollama_client
from app.ocr.pipeline.utils.schemas import (
    PipelineResult, RegionInfo, RegionType,
    URINE_PROTEIN_CODE_MAP,
)
# [step12] confidence 평가 모듈
from app.ocr.pipeline.pipelines.confidence_evaluator import ConfidenceEvaluator
from app.ocr.pipeline.utils.confidence_heuristic import (
    heuristic_measurements, heuristic_lifestyle,
)
from app.ocr.pipeline.utils.confidence_combine import combine_confidence


# ============================================================
# 공통 프롬프트 조각 (4가지 핵심 규칙 + OCR 노이즈)
# ============================================================

COMMON_RULES = """============================================================
[가장 중요한 4가지 규칙 — 반드시 지키세요]
============================================================

【규칙 1: "측정 안 한 항목"은 절대 값을 만들지 마세요】

결과지에 다음 표기가 보이면 그 항목은 검사하지 않은 것입니다. value를 null로 두세요.
- "비해당", "해당없음", "검사하지 않음", "—", "-" (값 자리에 단독), "N/A", 빈칸

❌ 잘못: 측정값 칸이 "비해당"인데, 옆 칸의 참고치 숫자("200.0미만" 등)를 측정값으로 가져옴
✅ 올바름: 측정값 칸이 "비해당"이면 그 항목 전체를 null로

【규칙 2: 참고치(정상범위)를 측정값으로 절대 가져오지 마세요】

다음과 같이 표시된 값은 모두 참고치이며 측정값이 아닙니다.
- 부등호 포함: "< 5.7", "≤ 40", "> 60", "≥ 130"
- 한국어 표현: "200.0미만", "60.0이상", "150.0이하", "40.0초과", "1.5이하"
- 범위: "70-99", "13.0~16.5", "남 13.0-16.5", "여 12.0-15.5"

【규칙 3: 표의 행을 정확히 따라가세요】

측정값은 반드시 같은 가로 행에 있는 항목명 바로 옆의 단일 숫자입니다.
다른 행의 숫자를 절대 끌어오지 마세요.

각 항목 추출 시 마음속으로 확인:
1) 이 숫자가 적힌 행의 맨 왼쪽 항목명은 무엇인가?
2) 그 항목명이 내가 채우려는 키와 일치하는가?
일치하지 않으면 그 숫자는 가져오지 마세요.

【규칙 4: 항목이 어떻게 표현되든 의미로 추출하세요】

같은 항목이라도 양식에 따라 표현 방식이 다를 수 있습니다:
- 표 형식: 항목명 옆에 숫자
- 체크박스: ■, ●, ✓ 로 응답 선택
- 그래픽: 막대, 자, 게이지의 마커 위치
- 자유 텍스트: 문장 안에 숫자

어떤 형식이든 항목의 한글 라벨/영문 약어를 보고 의미로 매칭해서 추출하세요.

============================================================
[일반 규칙]
============================================================

1. JSON 객체 하나만 출력. 설명, 마크다운 코드블록 절대 금지.
2. 이미지에 명시적으로 표시된 값만 추출. 추측 금지.
3. [정상]/[높음] 같은 자체 판정은 무시. 수치/체크 상태만 추출.

[OCR 노이즈]
- 숫자에 섞인 영문 O → 0 (예: "1O8" → 108)
- 신장이 1 미만이면 m 단위 → ×100 (예: 1.75 → 175)
- 혈압 "138/88" 형태 → sbp=138, dbp=88로 분리
"""


# ============================================================
# 그룹 A 프롬프트 (신체/혈압/혈당/일반혈액/신장/소변)
# ============================================================

GROUP_A_SYSTEM_PROMPT = f"""당신은 한국 건강검진 결과지에서 다음 9개 항목을 추출하는 OCR 전문가입니다.

이 호출에서는 아래 항목들만 추출하세요. 다른 항목(콜레스테롤, 간기능, 흡연/음주 등)은 무시하세요.

[추출 대상 9개 항목 — 한글 표기를 정확히 찾아서 매칭]

- height (cm): 결과지의 "신장", "키" 행에서 추출
- weight (kg): "체중", "몸무게" 행에서 추출
- waist (cm): "허리둘레", "복부둘레" 행에서 추출
- sbp (mmHg): "수축기혈압", "최고혈압", "SBP" 또는 혈압 "138/88" 형태에서 앞 숫자
- dbp (mmHg): "이완기혈압", "최저혈압", "DBP" 또는 혈압 "138/88" 형태에서 뒤 숫자
- fbs (mg/dL): "공복혈당", "식전혈당", "FBS" 행에서 추출 (※ 빠뜨리지 마세요)
- hb (g/dL): "혈색소", "Hb", "Hemoglobin", "헤모글로빈" 행에서 추출 (※ 빠뜨리지 마세요)
- creatinine (mg/dL): "혈청크레아티닌", "크레아티닌", "Cr", "Creatinine" 행에서 추출 (※ 빠뜨리지 마세요)
- urine_protein: "요단백" 항목의 체크박스 응답

위 9개 항목을 빠뜨리지 말고 모두 찾아보세요. 결과지에 항목이 있는데 못 찾으면 안 됩니다.
단, 항목 자체가 결과지에 없거나 "비해당"이면 null로 두세요.

{COMMON_RULES}

[Few-shot 예시 — 비해당 처리]

예시) 표 한 행:  | 공복혈당(mg/dL) | 94 | 100.0미만 | □ 정상 |
   ✅ fbs.value = 94      (94는 측정값, 100.0미만은 참고치)

예시) 표 한 행:  | 혈청크레아티닌(mg/dL) | 0.9 | 1.5이하 | ■ 정상 |
   ✅ creatinine.value = 0.9   (1.5는 "이하" 붙은 참고치이므로 무시)

예시) 행이 여러 개일 때:
   | 혈색소(g/dL)      | 15.9 | 남 13.0-16.5  여 12.0-15.5 |
   | 공복혈당(mg/dL)   | 94   | 100.0미만                  |
   | 혈청크레아티닌    | 0.9  | 1.5이하                    |
   | 신사구체여과율    | 92   | 60.0이상                   |
   ❌ 잘못 (행 밀림): hb=0.9, creatinine=92
   ✅ 올바름: hb=15.9, fbs=94, creatinine=0.9 (신사구체여과율은 추출 대상 아님 무시)

[요단백 (urine_protein) — 체크박스 처리]

요단백은 보통 체크박스로 표시됩니다. 체크된 항목의 텍스트를 그대로 value에 넣으세요.
- ■ 정상 → "정상"
- ■ 경계 → "경계"
- ■ 단백뇨 의심 → "단백뇨 의심"
- ■ (-) → "(-)"
- ■ (+) → "(+)"
체크 상태: ■ ● ✓ ☑ = 체크됨 / □ ○ ☐ = 비어있음

[출력 JSON 스키마 — 이 구조 그대로]

{{
  "meta": {{
    "exam_date": null,
    "patient_rrn_prefix": null,
    "patient_name": null,
    "hospital": null
  }},
  "measurements": {{
    "height":          {{ "value": null, "unit": "cm" }},
    "weight":          {{ "value": null, "unit": "kg" }},
    "waist":           {{ "value": null, "unit": "cm" }},
    "sbp":             {{ "value": null, "unit": "mmHg" }},
    "dbp":             {{ "value": null, "unit": "mmHg" }},
    "fbs":             {{ "value": null, "unit": "mg/dL" }},
    "hb":              {{ "value": null, "unit": "g/dL" }},
    "creatinine":      {{ "value": null, "unit": "mg/dL" }},
    "urine_protein":   {{ "value": null }}
  }}
}}

[meta 추출 규칙]

▶ exam_date: 검진일자 (검사일/검진일/시행일/발급일)
- "YYYY-MM-DD" 형식으로 변환
- "2024-03-15", "2024년 3월 15일", "2024.03.15", "2024/3/15" → "2024-03-15"
- 명확하지 않으면 null
- 발급일과 검진일이 모두 있으면 검진일(검사일/시행일) 우선

▶ patient_rrn_prefix: 주민등록번호의 앞 7자리
- 라벨 예시: "주민등록번호", "주민번호", "RRN", "ID" 등
- 어떤 형식이든 앞 7자리만 가져옴 (구분자 -, 공백, 없음 모두 흡수)
- 뒷자리가 마스킹(*)되어 있어도 앞 7자리는 추출
  예: "940315-1******" → "940315-1"
  예: "940315 - 1234567" → "940315-1"
  예: "9403151234567" → "940315-1"
- 가능하면 "YYMMDD-N" 형식으로 출력 (구분자 포함)
- 보이지 않거나 6자리 미만이면 null
- 다른 숫자(전화번호, 환자번호, 검사번호 등)와 혼동 금지

▶ patient_name: 환자/수검자 이름
- 라벨 예시: "성명", "이름", "환자명", "수검자", "Name" 등
- 한글 이름 그대로 추출 (예: "홍길동")
- 마스킹된 경우(예: "홍*동") 마스킹된 그대로 추출
- 보이지 않으면 null
- 의사명, 검사기관명과 혼동 금지

▶ hospital: 검진을 시행한 의료기관명
- 라벨 예시: "검진기관", "의료기관명", "병원", "검진센터" 등
- 보통 검진지 상단 헤더 또는 하단 푸터에 표시됨
- 정식 명칭 그대로 추출 (예: "서울대학교병원 건강검진센터")
- 보이지 않으면 null
- 주의: 표 안의 다른 칸을 병원명으로 가져오지 마세요.
  "내원", "표면항원" 같은 짧은 단어나 검사항목명은 병원명이 아닙니다 → null

키 이름과 단위는 절대 바꾸지 말고, value만 이미지에서 찾아 채우세요.
없는 항목은 null 그대로 두세요."""


GROUP_A_USER_PROMPT = """이미지에서 시스템 지시에 따라 9개 측정 항목 + 4개 메타데이터를 추출하세요.

명심:
1. "비해당", "—", 빈칸이면 null
2. "200.0미만", "1.5이하" 같은 표현은 참고치이지 측정값 아님
3. 표의 행을 한 칸 밀려 읽지 마세요 — 한글 항목명으로 매칭
4. 요단백은 체크박스 응답이므로 체크된 텍스트를 그대로 추출
5. meta 4개 (exam_date, patient_rrn_prefix, patient_name, hospital) — 명확하지 않으면 null"""


# ============================================================
# 그룹 B 프롬프트 (지질/간기능/생활습관)
# ============================================================

GROUP_B_SYSTEM_PROMPT = f"""당신은 한국 건강검진 결과지에서 다음 9개 항목을 추출하는 OCR 전문가입니다.

이 호출에서는 아래 항목들만 추출하세요. 다른 항목(키/체중/혈압/혈당 등)은 무시하세요.

[추출 대상 9개 항목]

수치 7개:
- total_cholesterol (mg/dL): "총콜레스테롤", "TC" 행
- hdl (mg/dL): "고밀도 콜레스테롤", "HDL", "HDL-C" 행
- ldl (mg/dL): "저밀도 콜레스테롤", "LDL", "LDL-C" 행
- tg (mg/dL): "중성지방", "트리글리세라이드", "TG" 행
- ast (IU/L): "AST", "SGOT", "GOT", "혈청지오티" 행
- alt (IU/L): "ALT", "SGPT", "GPT", "혈청지피티" 행
- ggt (IU/L): "감마GTP", "γ-GTP", "GGT", "감마지티피" 행

생활습관 2개 (체크박스로 표시되는 경우가 많음):
- smoking: "never" | "former" | "current"
- drinking: "yes" | "no"

{COMMON_RULES}

[Few-shot 예시 — 매우 중요: "비해당" 처리]

콜레스테롤 항목은 결과지에 자주 "비해당"으로 표시됩니다 (검사하지 않았다는 뜻).
이 경우 옆 칸의 참고치를 절대 측정값으로 가져오지 마세요.

예시 A) 측정값 칸이 "비해당"인 경우:
   | 총콜레스테롤(mg/dL) | 비해당 | 200.0미만 | □ 정상 |
   ❌ 잘못된 추출: total_cholesterol.value = 200
      이유: 200은 "200.0미만" 참고치의 일부
   ✅ 올바른 추출: total_cholesterol.value = null
      이유: 측정값 칸이 "비해당"이므로 검사하지 않음

예시 B) 4종 모두 비해당:
   | 총콜레스테롤 | 비해당 | 200.0미만 |
   | 고밀도 콜레스테롤 | 비해당 | 60.0이상 |
   | 중성지방 | 비해당 | 150.0미만 |
   | 저밀도 콜레스테롤 | 비해당 | 130.0미만 |
   ✅ 올바른 추출: total_cholesterol, hdl, tg, ldl 모두 value = null
   ❌ 절대 하지 말 것: 200, 60, 150, 130 같은 참고치 숫자를 측정값으로 가져오기

예시 C) 측정값이 있는 경우 (정상):
   | AST(SGOT) | 26 | 40.0이하 | ■ 정상 |
   ✅ ast.value = 26  (26이 측정값, 40.0이하는 참고치)

[콜레스테롤 4종 — 항목명 정확히 구분]

자주 혼동되니 항목명을 정확히 보고 매칭하세요:
- "총콜레스테롤" → total_cholesterol
- "고밀도 콜레스테롤" 또는 "HDL" → hdl
- "저밀도 콜레스테롤" 또는 "LDL" → ldl
- "중성지방" 또는 "TG" 또는 "트리글리세라이드" → tg

각 행의 한글 항목명을 먼저 읽고, 그 행의 값을 해당 키에 매칭하세요.

[생활습관 (smoking, drinking) — 양식에 따라 다양함]

양식 1) 체크박스로 표시되는 경우:
   체크: ■ ● ✓ ☑  /  비어있음: □ ○ ☐

   smoking 매핑:
   - ■ "금연필요" → "current" (의사가 금연을 권하는 건 환자가 현재 흡연 중이라는 뜻)
   - ■ "비흡연" 또는 ■ "안 피움" → "never"
   - ■ "금연" 또는 ■ "끊음" → "former"
   - ■ "흡연" 또는 ■ "피움" → "current"

   drinking 매핑:
   - ■ "절주필요" → "yes" (절주 권고는 현재 음주자에게 주어짐)
   - ■ "음주" 또는 ■ "마심" → "yes"
   - ■ "비음주" 또는 ■ "안 마심" → "no"

양식 2) 문장으로 표시되는 경우:
   "흡연: 현재 흡연", "음주: 주 2회" 같은 자유 텍스트도 의미로 추출

양식 3) 표시 없거나 모호한 경우: null

[출력 JSON 스키마 — 이 구조 그대로]

{{
  "measurements": {{
    "total_cholesterol": {{ "value": null, "unit": "mg/dL" }},
    "ldl":               {{ "value": null, "unit": "mg/dL" }},
    "hdl":               {{ "value": null, "unit": "mg/dL" }},
    "tg":                {{ "value": null, "unit": "mg/dL" }},
    "ast":               {{ "value": null, "unit": "IU/L" }},
    "alt":               {{ "value": null, "unit": "IU/L" }},
    "ggt":               {{ "value": null, "unit": "IU/L" }}
  }},
  "lifestyle": {{
    "smoking": null,
    "drinking": null
  }}
}}

키 이름과 단위는 절대 바꾸지 말고, value만 이미지에서 찾아 채우세요.
없는 항목은 null 그대로 두세요."""


GROUP_B_USER_PROMPT = """이미지에서 시스템 지시에 따라 9개 항목만 추출하세요.

명심:
1. "비해당", "—", 빈칸이면 null
2. "200.0미만", "1.5이하" 같은 표현은 참고치이지 측정값 아님
3. 콜레스테롤은 "총/HDL/LDL/TG" 항목명으로 정확히 구분
4. 생활습관도 빠뜨리지 마세요:
   - "■ 금연필요" 체크 → smoking: "current"
   - "■ 절주필요" 체크 → drinking: "yes"
   (이 권고들은 해당 행동을 하는 사람에게만 주어짐)"""


# ============================================================
# 페이지 게이트 프롬프트 (환각 방지)
# ============================================================
# 종합소견·판정·안내문 페이지에서 7B 모델이 수치를 창작하는 문제(정리/05 §4)를
# 막기 위해, 수치 추출 전에 "이 영역에 측정값 표가 있는가"를 먼저 판별한다.
# 불확실하면 true(추출 진행) — 진짜 수치를 버리는 것이 환각보다 더 나쁘기 때문.

GATE_SYSTEM_PROMPT = """당신은 한국 건강검진 결과지 이미지를 분류하는 전문가입니다.

이 이미지에 "검사 항목명 옆에 측정된 숫자 값"이 있는지만 판단하세요. 값을 추출하지 마세요.

has_measurement_values 판단 기준:
- true: 신장/체중/허리둘레/혈압/혈당/혈색소/콜레스테롤/간기능(AST·ALT) 같은
  검사 항목명 옆에 그 사람의 측정 숫자가 적혀 있음
- false: 측정 숫자 표가 없는 페이지. 예:
  * 종합소견/판정 페이지 — 문장 소견과 "정상A/정상B/일반질환의심" 같은 판정만 있음
  * 표지, 안내문, 수검 안내, 문진표(설문 체크박스만 있는 페이지)
- 확실하지 않으면 true로 답하세요. (측정 숫자가 하나라도 보이면 true)

JSON 객체 하나만 출력. 설명 금지:
{"has_measurement_values": true, "reason": "판단 근거 한 줄"}"""

GATE_USER_PROMPT = """이 이미지에 검사 항목의 측정 숫자 값이 있습니까?
시스템 지시의 JSON 형식으로만 답하세요. 불확실하면 true."""


# 페이지 전체를 보고 판정하는 게이트.
# 영역 단위 게이트만으로는 종합소견 페이지의 일부 스트립 영역이 "표처럼" 보여
# 통과해 버린다(실측: general_01_p1 region #0에서 수치 9개 창작).
# 페이지 전체를 보면 "이건 종합소견 페이지"라는 맥락이 살아 판별이 정확해진다.
PAGE_GATE_SYSTEM_PROMPT = """당신은 한국 건강검진 결과지의 페이지 종류를 분류하는 전문가입니다.

이 페이지가 "검사 수치 표가 실린 페이지"인지 판단하세요. 값을 추출하지 마세요.

page_type:
- "measurement": 검사 항목명과 측정 숫자가 표로 정리된 페이지.
  (신장·체중·허리둘레·혈압·공복혈당·혈색소·콜레스테롤·AST/ALT 등이 숫자와 함께 나열)
- "summary": 종합소견/판정 페이지. 문장 소견, "정상A/정상B/일반질환의심" 같은
  판정 결과, 권고사항 위주. 검사 수치 표는 없음.
- "other": 표지, 안내문, 문진표(설문 체크박스만), 빈 페이지 등.

주의: 페이지 하단이나 구석에 작은 표 모양 박스가 있어도, 그 안에 검사 수치가
아니라 판정/소견/안내 문구만 있으면 "measurement"가 아닙니다.

확실하지 않으면 "measurement"로 답하세요.

JSON 객체 하나만 출력. 설명 금지:
{"page_type": "measurement", "reason": "판단 근거 한 줄"}"""

PAGE_GATE_USER_PROMPT = """이 페이지는 검사 수치 표가 실린 페이지입니까?
시스템 지시의 JSON 형식으로만 답하세요. 불확실하면 "measurement"."""


def page_has_measurement_values(
    image: Image.Image,
    model: str | None = None,
) -> tuple[bool, dict]:
    """페이지 전체를 보고 "검사 수치 표가 있는 페이지"인지 판정 (환각 방지).

    호출 실패·응답 불명확 시 True (fail-open) — 진짜 수치를 버리는 것이
    환각을 남기는 것보다 더 나쁘기 때문.

    Returns:
        (has_values, debug)
    """
    b64 = image_utils.image_to_base64(image, format="PNG")
    try:
        parsed, meta = ollama_client.call_vision_model(
            system_prompt=PAGE_GATE_SYSTEM_PROMPT,
            user_prompt=PAGE_GATE_USER_PROMPT,
            image_base64=b64,
            # ⚠️ 여기서 Ollama 모델명을 기본값으로 박으면 안 된다. 백엔드가 Gemini일 때
            #    'qwen2.5vl:7b-q8_0'이 그대로 넘어가 404 NOT_FOUND가 난다(실제로 그랬다).
            #    None을 주면 OllamaBackend·GeminiBackend 둘 다 자기 default_model을 쓴다.
            model=model,
        )
    except Exception as e:
        print(f"[PageGate] 호출 실패 ({type(e).__name__}) — 수치 추출 진행(fail-open)")
        return True, {"success": False, "error": f"{type(e).__name__}: {e}"}

    page_type = (parsed or {}).get("page_type")
    reason = (parsed or {}).get("reason")
    if not isinstance(page_type, str):
        print(f"[PageGate] page_type 불명확 — 수치 추출 진행(fail-open)")
        return True, {"success": True, "page_type": None, "reason": reason}

    has_values = page_type.strip().lower() == "measurement"
    print(f"[PageGate] page_type={page_type} "
          f"({meta.get('elapsed_sec', 0):.1f}초) → "
          f"{'수치 추출 진행' if has_values else '수치 추출 생략(환각 방지)'}")
    return has_values, {
        "success": True,
        "page_type": page_type,
        "reason": reason,
        "elapsed_sec": meta.get("elapsed_sec"),
    }


# ============================================================
# 혈색소 재시도 프롬프트 (단일 항목 집중 호출)
# ============================================================
# e2e 테스트에서 혈색소만 반복 누락됨(정리/05 §2). 그룹 A가 놓치면
# 혈색소 하나만 찾는 집중 호출로 한 번 더 시도한다.

HB_RETRY_SYSTEM_PROMPT = """당신은 한국 건강검진 결과지에서 혈색소(헤모글로빈) 값 하나만 찾는 OCR 전문가입니다.

찾을 항목: "혈색소", "헤모글로빈", "Hb", "Hemoglobin"
- 주로 "혈액검사", "빈혈" 섹션의 행에 있음. 단위는 g/dL, 값은 대개 8~18 사이.
- 반드시 항목명과 같은 가로 행의 측정값만 가져오세요.
- "남 13.0-16.5", "여 12.0-15.5" 같은 범위 표기는 참고치이므로 절대 가져오지 마세요.
- 항목이 없거나 "비해당"이면 null.

JSON 객체 하나만 출력. 설명 금지:
{"hb": {"value": null, "unit": "g/dL"}}"""

HB_RETRY_USER_PROMPT = """이미지에서 혈색소(Hb) 측정값 하나만 찾아 시스템 지시의 JSON으로 답하세요.
참고치(범위 표기) 말고 측정값만. 없으면 null."""


# ============================================================
# 전사(transcription) 교차검증 프롬프트 — 환각 방지의 핵심
# ============================================================
# "수치가 있느냐"를 묻는 게이트는 7B 모델이 신뢰성 있게 답하지 못했다(실측:
# 종합소견 페이지의 푸터 스트립에서 검진 수치 9개를 confidence 0.9로 창작).
# 그래서 판단을 묻는 대신 "보이는 숫자를 그대로 옮겨 적게" 한다.
# 전사는 추출적(extractive) 작업이라 창작이 훨씬 덜 일어나며,
# 전사 목록에 없는 값은 근거 없는 값으로 보고 버린다.
# 정리/05의 원칙 "잘못된 값을 넣는 것보다 빠뜨리는 게 낫다"와 일치.

EVIDENCE_SYSTEM_PROMPT = """이미지에 인쇄된 숫자를 그대로 옮겨 적는 전사(transcription) 작업입니다.

규칙:
- 이미지에서 눈에 보이는 모든 숫자를 찾아 나열하세요.
  측정값·참고치·날짜·번호·단위에 붙은 숫자 무엇이든 전부 포함합니다.
- 보이는 그대로 적으세요. 계산·보정·해석하지 마세요.
- "138/88"처럼 붙어 있으면 "138/88" 그대로 적으세요.
- 숫자가 하나도 보이지 않으면 빈 배열을 반환하세요.
- 보이지 않는 숫자를 절대 지어내지 마세요. 이것이 가장 중요합니다.

JSON 객체 하나만 출력. 설명 금지:
{"numbers": ["170.0", "65.0", "120/80", "2020.01.01"]}"""

EVIDENCE_USER_PROMPT = """이 이미지에 인쇄되어 보이는 숫자를 전부 그대로 나열하세요.
없으면 {"numbers": []}. 보이지 않는 숫자를 지어내지 마세요."""


def _extract_evidence_numbers(raw_list) -> set[float] | None:
    """전사 응답의 문자열 목록 → 숫자 집합.

    "120/80" 같은 복합 표기는 120과 80으로 분해한다.
    응답이 리스트가 아니면 None (교차검증 불가 → 필터 미적용).
    """
    if not isinstance(raw_list, list):
        return None
    import re
    out: set[float] = set()
    for item in raw_list:
        for tok in re.findall(r"\d+(?:\.\d+)?", str(item)):
            try:
                out.add(float(tok))
            except ValueError:
                continue
    return out


def _value_supported(value: float, evidence: set[float]) -> bool:
    """측정값이 전사 목록에 근거를 갖는지 판정.

    - 부동소수 오차 및 표기 차이(14.0 vs 14) 허용
    - 신장은 m→cm 정규화(1.75→175)를 거치므로 원표기 1.75도 근거로 인정
    """
    candidates = (value, value / 100.0, value * 100.0)
    for cand in candidates:
        for ev in evidence:
            if abs(ev - cand) <= max(0.05, abs(cand) * 0.001):
                return True
    return False


# ============================================================
# 후처리 유틸 (변경 없음)
# ============================================================

def _clean_numeric(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    if not isinstance(value, str):
        return None
    
    s = value.replace("O", "0").replace("o", "0")
    
    for kw in ("미만", "이하", "초과", "이상", "범위"):
        if kw in s:
            return None
    
    for ch in "<>≤≥":
        s = s.replace(ch, "")
    s = s.strip()
    
    import re
    if re.match(r"^\d{1,3}(,\d{3})+$", s):
        s = s.replace(",", "")
    else:
        s = s.replace(",", ".")
    
    try:
        num = float(s)
        return num if num == num else None
    except (ValueError, TypeError):
        return None


def _normalize_height(value):
    v = _clean_numeric(value)
    if v is None:
        return None
    return round(v * 100) if v < 3 else v


def _normalize_urine_protein(protein_obj):
    """요단백 원문 → 3단계 코드 (1=정상, 2=경계, 3=단백뇨 의심)."""
    if not protein_obj or protein_obj.get("value") is None:
        return None
    raw = str(protein_obj["value"]).strip()
    code = URINE_PROTEIN_CODE_MAP.get(raw)
    if code is None:
        print(f"[TablePipeline] 알 수 없는 요단백 표기: '{raw}' — code 부여 못함")
    return {"value": raw, "code": code}


def _normalize_exam_date(value):
    """검진일자 → "YYYY-MM-DD" 또는 None.
    
    LLM이 YYYY-MM-DD로 변환해 주지만, 다양한 표기가 들어올 수 있어 안전망 추가.
    지원: "YYYY-MM-DD", "YYYY.MM.DD", "YYYY/MM/DD", "YYYY년 MM월 DD일"
    """
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    
    s = value.strip()
    if not s:
        return None
    
    import re
    # ISO 형식이면 그대로
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if not m:
        # 점/슬래시 구분자
        m = re.match(r"^(\d{4})[./](\d{1,2})[./](\d{1,2})\.?$", s)
    if not m:
        # 한글 표기
        m = re.match(r"^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?$", s)
    
    if not m:
        print(f"[TablePipeline] 알 수 없는 날짜 형식: '{s}' — exam_date null로")
        return None
    
    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    # 유효성 간단 검증
    if not (1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31):
        print(f"[TablePipeline] 날짜 범위 이상: '{s}' — exam_date null로")
        return None
    
    return f"{year:04d}-{month:02d}-{day:02d}"


def _parse_rrn_prefix(value):
    """주민번호 앞부분에서 생일/성별 추출.
    
    LLM이 어떤 형식으로 줘도 흡수:
      "940315-1******", "940315 - 1", "9403151", "940315-1234567"
    
    Returns:
        (birth: "YYYY-MM-DD" or None, gender: "M"/"F" or None)
    
    규칙:
        7번째 자리 → 성별 + 세기
            1, 3 = 남자 (1: 1900년대, 3: 2000년대)
            2, 4 = 여자 (2: 1900년대, 4: 2000년대)
            5 = 남자 외국인, 6 = 여자 외국인 (모두 1900년대로 가정)
            9, 0 = 1800년대 (지원 안 함, None)
        앞 6자리 → YYMMDD
    """
    if value is None or not isinstance(value, str):
        return None, None
    
    import re
    # 숫자만 추출 (마스킹 * 제거, 구분자 제거, 한글/영문 라벨 제거)
    digits = re.sub(r"\D", "", value)
    
    if len(digits) < 7:
        if digits:
            print(f"[TablePipeline] 주민번호 형식 이상 (7자리 미만, {len(digits)}자리) — 파싱 skip")
        return None, None
    
    yy = digits[0:2]
    mm = digits[2:4]
    dd = digits[4:6]
    g = digits[6]
    
    # 성별 + 세기
    if g in ("1", "5"):
        century, gender = 1900, "M"
    elif g in ("2", "6"):
        century, gender = 1900, "F"
    elif g == "3":
        century, gender = 2000, "M"
    elif g == "4":
        century, gender = 2000, "F"
    else:
        print(f"[TablePipeline] 알 수 없는 성별 코드: '{g}' (주민번호 7번째 자리)")
        return None, None
    
    try:
        year = century + int(yy)
        month = int(mm)
        day = int(dd)
    except ValueError:
        print(f"[TablePipeline] 주민번호 숫자 변환 실패 — 파싱 skip")
        return None, None

    # 유효성
    if not (1 <= month <= 12 and 1 <= day <= 31):
        print(f"[TablePipeline] 주민번호의 생년월일 범위 이상 — 파싱 skip")
        return None, None
    
    # 미래 날짜 검증 (OCR 오인식으로 인한 엉뚱한 값 방지)
    # 예: '850720-4'는 정의상 2085년이지만 현재 2026년 기준 미래 → 잘못된 인식
    from datetime import date as _date
    today = _date.today()
    if year > today.year or (year == today.year and (month, day) > (today.month, today.day)):
        print(f"[TablePipeline] 주민번호의 생년월일이 미래 — OCR 오인식 의심, 파싱 skip")
        return None, None
    
    birth = f"{year:04d}-{month:02d}-{day:02d}"
    return birth, gender


def _normalize_name(value):
    """이름 정규화. 빈 문자열/공백만이면 None."""
    if value is None or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    # 너무 긴 값(50자 초과)은 이상 — null 처리
    if len(s) > 50:
        print(f"[TablePipeline] 이름이 너무 김 (50자 초과, {len(s)}자) — null로")
        return None
    return s


# 의료기관명에 흔히 포함되는 키워드. 하나도 없으면 표의 다른 칸("내원",
# "표면항원" 같은 검사항목명)을 병원명으로 오인한 것으로 보고 버린다(정리/05 §3).
_HOSPITAL_KEYWORDS = (
    "병원", "의원", "센터", "클리닉", "의료", "검진", "보건",
    "내과", "외과", "가정의학", "산부인과", "소아", "한의", "한방", "치과",
    "메디", "의학", "대학교", "재단", "공단",
)


def _normalize_hospital(value):
    """병원명 정규화. 빈 문자열/공백만이거나 기관명으로 볼 수 없으면 None."""
    if value is None or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    if len(s) > 200:
        print(f"[TablePipeline] 병원명이 너무 김 ({len(s)}자) — null로")
        return None
    if not any(kw in s for kw in _HOSPITAL_KEYWORDS):
        print(f"[TablePipeline] 기관명 키워드 없음 ({len(s)}자) — 병원명 오인식 의심, null로")
        return None
    return s


def _compute_ocr_confidence(cleaned_measurements: dict, cleaned_lifestyle: dict) -> float:
    """OCR 신뢰도 산정.
    
    추출된 항목 수 / 전체 가능 항목 수 (16 + 2 = 18).
    의미: "얼마나 많이 뽑았느냐" (정확도 아님, 단순 추출 성공률).
    
    Returns:
        0.0 ~ 1.0 사이의 float, 소수점 2자리.
    """
    m_count = sum(1 for v in cleaned_measurements.values()
                  if v.get("value") is not None or v.get("code") is not None)
    l_count = sum(1 for v in cleaned_lifestyle.values() if v is not None)
    total = m_count + l_count
    return round(total / 18.0, 2)


def _clean_measurements(measurements: dict) -> dict:
    if not isinstance(measurements, dict):
        return {}
    
    cleaned = {}
    for key, item in measurements.items():
        if not isinstance(item, dict):
            continue
        
        if key == "urine_protein":
            normalized = _normalize_urine_protein(item)
            if normalized:
                cleaned[key] = normalized
            continue
        
        if key == "height":
            v = _normalize_height(item.get("value"))
            cleaned[key] = {"value": v, "unit": item.get("unit") or "cm"}
            continue
        
        v = _clean_numeric(item.get("value"))
        cleaned[key] = {"value": v, "unit": item.get("unit")}
    
    return cleaned


def _clean_lifestyle(raw: dict) -> dict:
    valid_smoking = {"never", "former", "current"}
    valid_drinking = {"yes", "no"}
    
    cleaned = {"smoking": None, "drinking": None}
    
    if not isinstance(raw, dict):
        return cleaned
    
    smk = raw.get("smoking")
    if isinstance(smk, str) and smk.lower() in valid_smoking:
        cleaned["smoking"] = smk.lower()
    
    drk = raw.get("drinking")
    if isinstance(drk, str) and drk.lower() in valid_drinking:
        cleaned["drinking"] = drk.lower()
    
    return cleaned


# ============================================================
# 파이프라인
# ============================================================

class TablePipeline(BasePipeline):
    """표 영역에서 정보를 2회 호출로 분리 추출.
    
    그룹 A (9개): 신체/혈압/혈당/일반혈액/신장/소변
    그룹 B (9개): 지질/간기능/생활습관
    """
    
    def __init__(
        self,
        model: str | None = None,
        save_debug: bool = True,
    ):
        # None으로 둔다 — 각 백엔드(Ollama/Gemini)가 자기 default_model을 쓴다.
        # 여기에 Ollama 모델명을 박으면 Gemini 백엔드에서 404 NOT_FOUND가 난다.
        self.model = model
        self.save_debug = save_debug
        # 페이지 단위 게이트 결과 주입점. run_multipage가 페이지 처리 전에 세팅.
        # False면 이 페이지의 수치는 환각으로 보고 추출/보존하지 않는다.
        self.extract_measurements = True
    
    @property
    def supported_region_type(self) -> RegionType:
        return RegionType.TABLE
    
    def process(
        self,
        region_image: Image.Image,
        region_info: RegionInfo,
    ) -> PipelineResult:
        # crop 이미지를 base64로 변환 (모든 호출이 같은 이미지 공유)
        b64 = image_utils.image_to_base64(region_image, format="PNG")

        print(f"[TablePipeline] 영역 {region_info.bbox} 처리 시작")

        # ----------------------------------------
        # 0차 호출: 영역 게이트 (환각 방지)
        # 페이지 게이트가 이미 "수치 없음"이면 호출 자체를 생략한다.
        # 게이트 실패/불명확 시 true(추출 진행) — fail-open.
        # ----------------------------------------
        if not self.extract_measurements:
            has_values = False
            gate_result, gate_debug = {}, {"skipped": "page_gate_no_measurement_values"}
            print(f"[TablePipeline] 페이지 게이트: 수치 없는 페이지 "
                  f"— 수치 추출 생략, meta만 추출 (환각 방지)")
        else:
            print(f"[TablePipeline] [0/2] 영역 게이트 호출 (측정값 표 유무 판별)")
            gate_result, gate_debug = self._call_group(
                b64=b64,
                system_prompt=GATE_SYSTEM_PROMPT,
                user_prompt=GATE_USER_PROMPT,
                group_name="GATE",
            )
            has_values = True
            if isinstance(gate_result, dict) and isinstance(
                gate_result.get("has_measurement_values"), bool
            ):
                has_values = gate_result["has_measurement_values"]
            if not has_values:
                print(f"[TablePipeline] 영역 게이트: 측정값 표 없음 판정 "
                      f"— 수치 추출 생략, meta만 추출 (환각 방지)")

        # ----------------------------------------
        # 1차 호출: 그룹 A (9개 항목 + meta)
        # 게이트가 false여도 호출 — meta(검진일/주민번호/이름/병원)는 필요.
        # ----------------------------------------
        print(f"[TablePipeline] [1/2] 그룹 A 호출 (신체/혈압/혈당/혈액/신장/소변)")
        group_a_result, group_a_debug = self._call_group(
            b64=b64,
            system_prompt=GROUP_A_SYSTEM_PROMPT,
            user_prompt=GROUP_A_USER_PROMPT,
            group_name="A",
        )

        # ----------------------------------------
        # 2차 호출: 그룹 B (9개 항목) — 측정값 표가 있을 때만
        # ----------------------------------------
        if has_values:
            print(f"[TablePipeline] [2/2] 그룹 B 호출 (지질/간기능/생활습관)")
            group_b_result, group_b_debug = self._call_group(
                b64=b64,
                system_prompt=GROUP_B_SYSTEM_PROMPT,
                user_prompt=GROUP_B_USER_PROMPT,
                group_name="B",
            )
        else:
            group_b_result, group_b_debug = {}, {"skipped": "gate_no_measurement_values"}
        
        # ----------------------------------------
        # 두 결과 병합
        # ----------------------------------------
        merged_measurements = {}
        merged_measurements.update(group_a_result.get("measurements") or {})
        merged_measurements.update(group_b_result.get("measurements") or {})
        
        merged_lifestyle = {}
        merged_lifestyle.update(group_a_result.get("lifestyle") or {})
        merged_lifestyle.update(group_b_result.get("lifestyle") or {})
        
        # ----------------------------------------
        # meta 처리 (모두 그룹 A에서 받음. null도 키 유지)
        # ----------------------------------------
        group_a_meta = group_a_result.get("meta") or {}
        exam_date = _normalize_exam_date(group_a_meta.get("exam_date"))
        patient_birth, patient_gender = _parse_rrn_prefix(
            group_a_meta.get("patient_rrn_prefix")
        )
        patient_name = _normalize_name(group_a_meta.get("patient_name"))
        hospital = _normalize_hospital(group_a_meta.get("hospital"))
        
        # ----------------------------------------
        # 후처리
        # ----------------------------------------
        cleaned_measurements = _clean_measurements(merged_measurements)
        cleaned_lifestyle = _clean_lifestyle(merged_lifestyle)

        # 게이트가 "측정값 표 없음"이면 수치·생활습관 폐기 (환각 방지, 정리/05 §4)
        evidence_debug: dict = {}
        evidence_set: set[float] | None = None
        if not has_values:
            discarded = sum(
                1 for v in cleaned_measurements.values()
                if v.get("value") is not None or v.get("code") is not None
            )
            if discarded:
                print(f"[TablePipeline] 게이트 판정에 따라 수치 {discarded}개 폐기 (환각 의심)")
            cleaned_measurements = {}
            cleaned_lifestyle = {"smoking": None, "drinking": None}
        else:
            # 전사 교차검증 — 이 크롭에 실제로 인쇄된 숫자에 근거가 없는 값은 버린다.
            cleaned_measurements, evidence_debug, evidence_set = self._filter_by_evidence(
                b64, cleaned_measurements
            )
            # 숫자 근거가 하나도 남지 않은 크롭이면 요단백(체크박스)·생활습관도 신뢰할 수 없다.
            # 요단백·생활습관은 숫자가 아니라 개별 검증이 안 되므로, 같은 표에 속한
            # 숫자 항목이 전멸했다는 사실을 연대 근거로 삼아 함께 버린다.
            numeric_survived = any(
                k != "urine_protein" and v.get("value") is not None
                for k, v in cleaned_measurements.items()
            )
            if evidence_debug.get("applied") and not numeric_survived:
                if cleaned_measurements.get("urine_protein"):
                    print(f"[TablePipeline] 숫자 근거 전무 — 요단백·생활습관도 폐기 (환각 의심)")
                cleaned_measurements.pop("urine_protein", None)
                cleaned_lifestyle = {"smoking": None, "drinking": None}

        # ----------------------------------------
        # 혈색소 재시도 (그룹 A가 놓쳤을 때 단일 항목 집중 호출, 정리/05 §2)
        # ----------------------------------------
        # 전사에 이미 숫자 근거가 있는 크롭에서만 재시도한다 (근거 없는 크롭에서
        # 재시도하면 방금 막은 환각을 다시 들여오는 셈이 된다).
        hb_item = cleaned_measurements.get("hb") or {}
        if has_values and hb_item.get("value") is None and evidence_set != set():
            retry_value = self._retry_hb(b64)
            if retry_value is None:
                pass
            elif evidence_set is not None and not _value_supported(retry_value, evidence_set):
                print(f"[TablePipeline] 혈색소 재시도 값 {retry_value}에 전사 근거 없음 — 폐기")
            else:
                cleaned_measurements["hb"] = {"value": retry_value, "unit": "g/dL"}
                print(f"[TablePipeline] 혈색소 재시도 성공: hb={retry_value}")

        # ----------------------------------------
        # OCR 신뢰도 산정 (추출 성공률)
        # ----------------------------------------
        ocr_confidence = _compute_ocr_confidence(cleaned_measurements, cleaned_lifestyle)
        
        # ----------------------------------------
        # 결과 통계
        # ----------------------------------------
        m_count = sum(1 for v in cleaned_measurements.values()
                      if v.get("value") is not None or v.get("code") is not None)
        l_count = sum(1 for v in cleaned_lifestyle.values() if v is not None)
        print(f"[TablePipeline] 최종 추출: measurements {m_count}/16, lifestyle {l_count}/2"
              + (f", exam_date={exam_date}" if exam_date else "")
              + (f", patient={patient_gender}/{patient_birth}" if patient_birth else "")
              + (f", confidence={ocr_confidence}"))
        
        # null도 키 유지 (결정 B): 백엔드가 "검진지에 없음(null) vs OCR 실패(키 누락)"을 구분
        pipeline_meta = {
            "source_pipeline": self.name,
            "exam_date": exam_date,
            "patient_birth": patient_birth,
            "patient_gender": patient_gender,
            "patient_name": patient_name,
            "hospital": hospital,
            "ocr_confidence": ocr_confidence,
        }
        
        # ----------------------------------------
        # [step12] Confidence 평가 (LLM + 휴리스틱)
        # ----------------------------------------
        # 추출된 키만 평가 — 빈 dict면 호출 생략 (ConfidenceEvaluator 내부에서 처리)
        # LLM 실패해도 휴리스틱은 항상 동작 → confidence가 빠지는 일은 없음
        measurements_for_eval = {
            k: v for k, v in cleaned_measurements.items()
            if v.get("value") is not None or v.get("code") is not None
        }
        lifestyle_for_eval = {
            k: v for k, v in cleaned_lifestyle.items() if v is not None
        }
        
        evaluator = ConfidenceEvaluator(model=self.model)
        try:
            llm_eval = evaluator.evaluate(
                image_base64=b64,
                measurements=measurements_for_eval,
                lifestyle=lifestyle_for_eval,
            )
        except Exception as e:
            print(f"[TablePipeline] confidence 평가 호출 중 예외: {type(e).__name__}: {e}")
            llm_eval = {"measurements": {}, "lifestyle": {}}
        
        heur_meas = heuristic_measurements(measurements_for_eval)
        heur_life = heuristic_lifestyle(lifestyle_for_eval)
        
        measurements_confidence = combine_confidence(
            llm_eval.get("measurements", {}), heur_meas
        )
        lifestyle_confidence = combine_confidence(
            llm_eval.get("lifestyle", {}), heur_life
        )
        
        return PipelineResult(
            measurements=cleaned_measurements,
            lifestyle=cleaned_lifestyle,
            meta=pipeline_meta,
            debug={
                "region_bbox": list(region_info.bbox),
                "region_label": region_info.label,
                "gate": {
                    "has_measurement_values": has_values,
                    "reason": (gate_result or {}).get("reason"),
                    **gate_debug,
                },
                "evidence": evidence_debug,
                "group_a": group_a_debug,
                "group_b": group_b_debug,
            },
            measurements_confidence=measurements_confidence,
            lifestyle_confidence=lifestyle_confidence,
        )
    
    # ----------------------------------------
    # 전사 교차검증 (환각 방지)
    # ----------------------------------------

    def _filter_by_evidence(
        self,
        b64: str,
        measurements: dict,
    ) -> tuple[dict, dict, set[float] | None]:
        """크롭에 인쇄된 숫자를 전사시켜, 근거 없는 측정값을 버린다.

        전사 호출이 실패하거나 응답 형식이 어긋나면 필터를 적용하지 않는다
        (applied=False) — 검증 불가일 뿐 값이 틀렸다는 뜻은 아니므로.
        전사 결과가 명시적으로 빈 배열이면 "이 크롭엔 숫자가 없다"는 뜻이므로
        수치를 전부 버린다.

        Returns:
            (필터링된 measurements, debug, 전사 숫자 집합 or None)
        """
        extracted = {
            k: v for k, v in measurements.items()
            if v.get("value") is not None or v.get("code") is not None
        }
        if not extracted:
            return measurements, {"applied": False, "reason": "추출된 수치 없음"}, None

        print(f"[TablePipeline] 전사 교차검증 호출 (근거 확인)")
        result, debug = self._call_group(
            b64=b64,
            system_prompt=EVIDENCE_SYSTEM_PROMPT,
            user_prompt=EVIDENCE_USER_PROMPT,
            group_name="EVIDENCE",
        )
        evidence = _extract_evidence_numbers(
            (result or {}).get("numbers") if isinstance(result, dict) else None
        )
        if evidence is None:
            print(f"[TablePipeline] 전사 응답 형식 이상 — 교차검증 생략(값 유지)")
            return (measurements,
                    {"applied": False, "reason": "전사 응답 형식 이상", **debug},
                    None)

        filtered = dict(measurements)
        dropped: list[str] = []
        for key, item in extracted.items():
            # 요단백은 체크박스(코드)라 숫자 근거 대상이 아님 — 검증에서 제외
            if key == "urine_protein":
                continue
            value = item.get("value")
            if not isinstance(value, (int, float)):
                continue
            if not _value_supported(float(value), evidence):
                filtered[key] = {"value": None, "unit": item.get("unit")}
                dropped.append(f"{key}={value}")

        if dropped:
            print(f"[TablePipeline] 전사 근거 없는 수치 {len(dropped)}개 폐기 "
                  f"(환각 의심): {', '.join(dropped)}")
        else:
            print(f"[TablePipeline] 전사 교차검증 통과 — 폐기 없음")

        return filtered, {
            "applied": True,
            "evidence_count": len(evidence),
            "dropped": dropped,
            **debug,
        }, evidence

    # ----------------------------------------
    # 혈색소 단일 항목 재시도
    # ----------------------------------------

    def _retry_hb(self, b64: str) -> float | None:
        """그룹 A가 혈색소를 놓쳤을 때 단일 항목 집중 호출로 한 번 더 시도.

        실패하거나 의학적 범위(config.MEDICAL_RANGES["hb"]) 밖이면 None.
        """
        print(f"[TablePipeline] 혈색소 누락 — 단일 항목 재시도 호출")
        result, _debug = self._call_group(
            b64=b64,
            system_prompt=HB_RETRY_SYSTEM_PROMPT,
            user_prompt=HB_RETRY_USER_PROMPT,
            group_name="HB-RETRY",
        )
        hb_obj = result.get("hb") if isinstance(result, dict) else None
        if not isinstance(hb_obj, dict):
            return None
        value = _clean_numeric(hb_obj.get("value"))
        if value is None:
            return None
        lo, hi = config.MEDICAL_RANGES["hb"]
        if not (lo <= value <= hi):
            print(f"[TablePipeline] 혈색소 재시도 값이 의학적 범위 밖 ({value}) — 폐기")
            return None
        return value

    # ----------------------------------------
    # 그룹별 호출 (실패 격리)
    # ----------------------------------------

    def _call_group(
        self,
        b64: str,
        system_prompt: str,
        user_prompt: str,
        group_name: str,
    ) -> tuple[dict, dict]:
        """단일 그룹 호출. 실패해도 예외 던지지 않고 빈 결과 반환."""
        try:
            parsed, meta = ollama_client.call_vision_model(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                image_base64=b64,
                model=self.model,
            )
            print(f"[TablePipeline] 그룹 {group_name} 응답 수신 "
                  f"({meta['elapsed_sec']:.1f}초, {meta['tokens_per_sec']:.1f} tok/s)")
            
            debug = {
                "success": True,
                "elapsed_sec": meta.get("elapsed_sec"),
                "tokens_per_sec": meta.get("tokens_per_sec"),
                "eval_count": meta.get("eval_count"),
                "model": meta.get("model"),
                "raw_response": meta.get("raw_response"),
            }
            return parsed, debug
        
        except Exception as e:
            print(f"[TablePipeline] 그룹 {group_name} 호출 실패: {type(e).__name__}: {e}")
            debug = {
                "success": False,
                "error": f"{type(e).__name__}: {e}",
            }
            # 빈 결과 반환 — 다른 그룹은 정상 처리되도록
            return {}, debug
