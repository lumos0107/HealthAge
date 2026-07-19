# step10 — Gemini 백엔드 호환 패치

## 배경

`.env`에서 `VISION_BACKEND=gemini`로 전환했더니 OCR 결과가 빈 dict로 나옴.
원인: 각 파이프라인 생성자에서 `self.model = model or config.OLLAMA_MODEL_VISION`로
**Ollama 모델명을 미리 박아서** GeminiBackend로 전달했음 → Gemini API에서 404.

```
POST .../models/qwen2.5vl:7b-q8_0:generateContent → 404 NOT_FOUND
```

VisionBackend Protocol의 원래 의도는 "호출자는 모델 신경 안 쓰고, backend가 자기
default_model 사용". 이 추상화가 절반만 적용됐던 부분을 제거.

## 변경 파일 (5개)

| 파일 | 변경 |
|---|---|
| `ocr/pipeline/pipelines/table_pipeline.py` | `self.model = model or config.OLLAMA_MODEL_VISION` → `self.model = model` |
| `ocr/pipeline/pipelines/meta_pipeline.py` | 동일 |
| `ocr/pipeline/pipelines/graphic_pipeline.py` | 동일 |
| `ocr/pipeline/splitter/components/llm_graphic_classifier.py` | 동일 |
| `ocr/pipeline/splitter/llm_splitter.py` | 동일 + docstring 수정 (Ollama 한정 표현 제거) |

각 변경 지점에 `# [step10]` 주석 마커 있음. `config` import는 다른 곳에서도 쓸 수 있어
유지 (회귀 위험 0).

## 동작 원리 (변경 후)

1. 파이프라인이 `backend.call(model=None, ...)` 호출
2. backend가 `model = model or self.default_model` → 자기 default 사용
   - GeminiBackend: `settings.gemini_model` (.env의 `GEMINI_MODEL`)
   - OllamaBackend: `config.OLLAMA_MODEL_VISION`
3. 환경변수만 바꾸면 양쪽 자동 호환

## 적용 방법

zip 풀어서 `backend/app/ocr/` 위에 덮어쓰기. 5개 파일만 교체됨.

```powershell
# 예시 (PowerShell)
cd C:\Users\dlsrn\health-service\backend
Expand-Archive -Path step10.zip -DestinationPath . -Force
```

또는 zip 안의 `ocr/` 폴더를 `app/ocr/`에 수동으로 덮어쓰기 (5개 파일만 변경됨).

## 검증

1. `.env`는 그대로 (`VISION_BACKEND=gemini`, `GEMINI_API_KEY=...`, `GEMINI_MODEL=gemini-2.5-flash`)
2. 백엔드 재시작
3. Swagger에서 검진지 이미지 1장 업로드
4. 응답 확인:
   - `measurements` 채워짐 (이전엔 빈 dict)
   - `lifestyle` 채워짐
   - `ocr_confidence` > 0
5. 서버 로그에서 확인:
   ```
   POST .../models/gemini-2.5-flash:generateContent  HTTP/1.1 200 OK
   ```
   (이전엔 `models/qwen2.5vl:7b-q8_0` 으로 가서 404)

## Ollama 회귀 테스트

`.env`를 `VISION_BACKEND=ollama`로 되돌리고 재시작했을 때 기존 Ollama 흐름이 그대로
작동해야 함. 변경된 코드는 model=None을 backend로 넘기고, OllamaBackend가 자기
default_model(`config.OLLAMA_MODEL_VISION`)을 사용하니까 동일한 모델이 호출됨.

## 짚어둘 점

- 합성 검진지 1장으로 동작 확인은 됐지만, **프롬프트가 Ollama qwen2.5vl 기준으로
  튜닝되어 있어 Gemini가 다른 결과를 줄 수 있음**. 검진지 1장 돌려보고 measurements
  값을 Ollama 결과와 비교하길 권장.
- 의료 데이터를 Gemini로 보낼 때 **무료 티어는 데이터가 모델 학습에 사용될 수 있음**
  (Google AI Studio 정책). 합성 데이터는 OK, 실제 환자 데이터는 유료 티어 권장.
