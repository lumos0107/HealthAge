# 웹 프론트 실 API 연동 (A+안) — 설계

> 작성 2026-07-20. 헬스에이지 웹 프론트(React/Vite)를 목업에서 실 API 동작으로 전환.
> 목표: 8월 발표에서 **웹앱도 모바일과 동급**으로 시연. 22일 1차 제출 대비 저위험.

## 1. 배경 / 문제

현재 웹 프론트(`frontend/src/App.tsx`, 1822줄)는 **절반만 실연동** 상태다.

- ✅ 실연동: 로그인·회원가입·프로필(`login`/`signup`/`loadProfile`, Supabase Auth + `POST /users`), 복약 업로드(`POST /medication/upload`).
- ❌ 목업: 건강데이터 4개 탭(대시보드·검진결과·히스토리·건강분석)이 하드코딩된 홍길동 2021/2023/2024 상수(`reports`, `metricDefinitions`, `computeGroups`)를 읽음. 결과지 업로드의 OCR·분석·저장도 가짜(`runDummyCheckupOcr`는 사진을 안 읽고 예시값을 뿌리고, `saveReviewedOcr`는 로컬 state만 바꿈).

실 API 인프라(`api/healthApi.ts` 20개 엔드포인트, `api/reportMapper.ts`, `utils/clinical.ts`, `utils/healthScores.ts`)는 이미 존재하나 `App.tsx`가 사용하지 않는다. 모바일(`frontend-mobile`)은 동일 백엔드로 종단간 실동작 중이며 OCR 매핑 함수(`ocrResultToFields`/`fieldsToOcrResult`)를 갖고 있다.

## 2. 목표 / 범위 (A+안)

1. `frontend/.env` 생성 — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`. (모바일 `.env` 값 재사용) 없으면 `supabaseConfigured=false`라 인증·API가 전부 꺼진다.
2. **표시 탭 4개** 실 API 배선 — 로그인 사용자 기준으로 검진기록/종합분석/시계열을 불러와 대시보드·검진결과·히스토리·건강분석에 표시. 목업 상수 제거.
3. **업로드 탭** — 사진 파일 업로드 → 실제 OCR(`POST /uploads`) → 검수 → 실제 분석·저장(`POST /analyze`). 모바일 매핑 로직 포팅.
4. **예시값 폴백 유지** — "예시 결과 불러오기"로 OCR 없이도 저장→표시 시연 가능(데드라인 안전망, 모바일도 동일 폴백 보유).
5. **빈 상태 처리** — 로그인 안 됨 / 검진기록 없음 / OCR 실패 / 백엔드 다운 시 사용자 안내.

## 3. 비목표 (하지 않음)

- 웹 브라우저 카메라 직접 촬영(데스크톱에선 파일 선택으로 자연 폴백되므로 불필요).
- 웹 전용 OCR 정확도 튜닝, 새 UI 디자인 — 기존 정부포털풍 레이아웃 유지.
- Django 이전 — 별개 안건(대회 후 상용화 검토 항목).
- 자동 테스트 스위트 — 데드라인상 수동 e2e 검증으로 대체.

## 4. 접근 / 데이터 흐름

`App.tsx`의 데이터 소스를 목업 상수 → 실 API 결과로 교체한다. 뷰(레이아웃/컴포넌트)는 유지하고 **데이터 계층만** 바꾼다.

```
로그인/회원가입 (이미 실연동)
   ↓
GET /users → 사용자 선택(user_id)
   ↓
GET /reports/{id}, /reports/{id}/comprehensive/latest, /timeseries/{id}
   ↓  (reportMapper.normalizeReport 등으로 매핑)
App 상태 → 대시보드·검진결과·히스토리·건강분석 표시

[업로드 탭]
사진 파일 → POST /uploads (실 OCR)
   ↓  ocrResultToFields (모바일 포팅)
검수 화면 → (수정)
   ↓  fieldsToOcrResult (모바일 포팅)
POST /analyze (실 분석 + Supabase 저장)
   ↓
표시 탭 데이터 재로드

[폴백] "예시 결과 불러오기" → 예시 페이로드 → POST /analyze
```

## 5. 컴포넌트별 변경

- `frontend/.env` — 신규 생성.
- `App.tsx`
  - 상단 목업 상수(`reports`, `metricDefinitions`, `computeGroups`)를 실 API 로딩 상태로 대체. 로그인 사용자의 검진 데이터를 불러와 기존 뷰(`DashboardView`/`RecordsView`/`HistoryView`/`AnalysisView`)에 주입.
  - `UploadView`: `runDummyCheckupOcr` → 실제 파일 업로드+OCR 경로로 교체(예시 버튼은 폴백으로 잔존). `saveReviewedOcr` → `healthApi.analyzeOcr(buildReviewedOcr())` 실호출로 교체, 성공 시 표시 데이터 재로드.
- 재사용: `api/healthApi.ts`(그대로), `api/reportMapper.ts`(매핑), `utils/clinical.ts`·`utils/healthScores.ts`(상태/점수). 모바일 `health.ts`의 `ocrResultToFields`/`fieldsToOcrResult`를 웹으로 포팅.

## 6. 에러 처리

- 로그인 세션 없음 → 표시 탭에 "로그인 후 이용" 안내, 예시 화면 없음.
- 검진기록 0건 → "결과지를 업로드하면 여기에 표시됩니다" 빈 상태.
- OCR 실패/백엔드 다운 → 오류 메시지 + "예시 결과 불러오기" 유도.
- `combo_analysis` 없음(구버전 분석) → null 처리(이미 타입에 명시).

## 7. 전제 조건

- 데모 PC에서 **백엔드(FastAPI) + Ollama 비전 모델** 실행 중이어야 실 OCR 동작(`VISION_BACKEND=ollama`, Gemini 키 미설정). 없으면 예시값 폴백으로 시연.
- Supabase `sql/07` 적용 완료(조합결과 저장) — 2026-07-20 적용됨.

## 8. 검증 (성공 기준)

로컬에서 백엔드+Ollama 기동 후 수동 e2e:
1. 웹 회원가입/로그인 → 성공.
2. 업로드 탭에서 검진지 사진 업로드 → OCR 값 표시 → 저장 → "저장됨".
3. 대시보드/검진결과/히스토리/건강분석에 방금 저장한 **실 API 계산 결과**(공단 백분위·조합그룹·시계열) 표시.
4. 연도 다른 결과 1건 더 저장 → 히스토리 그래프에 2점 이상.
5. 예시값 폴백으로도 2~4 재현.

## 9. 리스크

| 리스크 | 완화 |
|---|---|
| OCR 백엔드(Ollama) 의존 | 예시값 폴백 유지 → 백엔드 없어도 데모 지속 |
| App.tsx 대형 파일 수정 | 뷰 유지, 데이터 계층만 국소 변경 |
| API 응답 형태 불일치 | 기존 `reportMapper`/모바일 매핑 재사용으로 검증된 경로 사용 |
