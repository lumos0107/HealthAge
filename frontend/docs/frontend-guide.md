# 프론트엔드 설명서

이 문서는 `Health_Management_Service/frontend`의 구조·실행 방법·API 연결 방식·화면 구성을 팀원이 빠르게 이해하기 위한 설명서입니다.

2026-07-27 전면 재작성 기준으로 다시 썼습니다. 이전(5탭 구조) 버전 문서는 폐기합니다.

## 1. 개요 — 이 웹의 역할

이 웹은 모바일 앱과 같은 백엔드(FastAPI, 22개 엔드포인트)를 쓰는 **큰 화면용 상세 열람 도구**입니다.

```text
앱  : 알림 받고, 검진지 찍어 올리고, 요약을 빠르게 확인
웹  : 같은 데이터를 큰 화면에서 표·그래프로 자세히 보고, 계산기·What-if를 돌려보고, 인쇄한다
```

즉 앱은 요약, 웹은 상세입니다. 기능이 다른 게 아니라 **같은 데이터를 다른 화면 크기·다른 상황에 맞게** 보여줍니다. 판정(정상/주의/위험, risk_score, 대사증후군 여부 등)은 전부 백엔드가 계산하고, 프론트는 그 결과를 표시만 합니다.

로그인은 Supabase Auth를 쓰고, 데이터는 전부 백엔드 API를 통해서만 가져옵니다. 더미/오프라인 모드는 없습니다.

## 2. 사용 기술

- Vite 7
- React 19
- TypeScript 5.8
- Tailwind CSS 4
- Recharts 3 (히스토리 차트)
- lucide-react (아이콘)
- @supabase/supabase-js 2 (인증)
- vitest 3 (순수 함수 단위 테스트)
- Playwright (스크린샷 스크립트용)

## 3. 실행 방법

```powershell
cd frontend
npm install
npm run dev      # http://127.0.0.1:5173
```

백엔드도 함께 켜야 로그인 후 데이터가 뜹니다.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

빌드 확인:

```powershell
npm run build     # tsc && vite build
```

## 4. 환경변수

`frontend/.env`가 필요합니다 (`.env.example` 복사).

```powershell
Copy-Item .env.example .env
```

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_BACKEND_URL=http://localhost:8000
```

`.env`는 git에 올리지 않습니다. `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`가 비어 있으면 로그인 화면에 안내 문구가 뜨고 로그인 버튼이 비활성화됩니다.

## 5. 폴더 구조

```text
frontend/
├─ package.json
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ .env.example
├─ capture_sections.mjs      # 섹션별 스크린샷 스크립트 (본 문서 8장)
├─ docs/
│  └─ frontend-guide.md      # 이 문서
└─ src/
   ├─ App.tsx                # 셸 — 로그인 게이트 + 전역 데이터 1회 로드 + 섹션 전환
   ├─ main.tsx
   ├─ styles.css             # print CSS 포함
   ├─ vite-env.d.ts
   ├─ api/
   │  ├─ client.ts           # fetch 래퍼 1개 — 토큰 첨부, 204 처리, 에러 메시지 정규화
   │  ├─ types.ts             # 백엔드 응답 타입 전량 (모바일 health.ts에서 이식)
   │  ├─ endpoints.ts         # 22개 엔드포인트 함수. 이 파일 밖에서 fetch 직접 호출 금지
   │  ├─ adapt.ts             # 백엔드 → 화면 변환 (순수 함수)
   │  ├─ adapt.test.ts
   │  └─ supabaseClient.ts    # Supabase 클라이언트 + access token 조회
   ├─ lib/
   │  ├─ format.ts            # 표시 유틸: 확신도 문구, 음주량 g 환산, .ics 생성, 숫자 포맷
   │  └─ format.test.ts
   ├─ components/
   │  ├─ UI.tsx               # Card, SectionTitle, StatusBadge, LevelBadge, EmptyState, ErrorBox, KV, Stepper, Loading
   │  ├─ Sidebar.tsx          # 좌측 네비 7개 섹션 + 백엔드 연결 상태등
   │  ├─ WhatIfPanel.tsx      # What-if 시뮬레이터 (좌 스테퍼 / 우 재계산 결과)
   │  └─ LifestyleFields.tsx  # 흡연·음주 입력 (업로드·프로필에서 공용)
   └─ sections/               # 사이드바 7개 섹션, 각 1파일 = 1화면
      ├─ DashboardSection.tsx   # ① 대시보드
      ├─ AnalysisSection.tsx    # ② 종합 분석
      ├─ HistorySection.tsx     # ③ 히스토리
      ├─ RecordsSection.tsx     # ④ 검진 기록
      ├─ UploadSection.tsx      # ⑤ 업로드·입력
      ├─ ToolsSection.tsx       # ⑥ 도구·참고
      └─ ProfileSection.tsx     # ⑦ 내 정보
```

`api/`가 실질적으로 4파일(client·types·endpoints·adapt) + 테스트로 구성되어 있고, `App.tsx`는 라우팅 없이 `SectionKey` 상태값으로 7개 섹션 컴포넌트를 전환합니다(React Router 미사용).

## 6. 7개 섹션 ↔ 22개 엔드포인트 매핑표

| # | 엔드포인트 | 주 사용 섹션 | 비고 |
|---|---|---|---|
| 1 | `GET /` | — | 헬스체크용, 현재 화면에서는 호출 안 함 |
| 2 | `GET /health` | 셸 | 사이드바 하단 "백엔드 연결됨" 상태등 |
| 3 | `GET /auth/me` | 내 정보 | 인증 정보 카드 |
| 4 | `GET /users` | — | 목록 조회 — 프로필은 `/users/{id}`로 대체 |
| 5 | `GET /users/{id}` | 셸 | 전역 데이터 로드 시 프로필 조회 |
| 6 | `POST /users` | — | 가입 시에만(현재 화면 흐름엔 없음, Supabase Auth가 가입 처리) |
| 7 | `PATCH /users/{id}` | 내 정보, 업로드 | 프로필 저장, 업로드 시 생활습관 patch |
| 8 | `DELETE /users/{id}` | 내 정보 | 회원 탈퇴("계정 삭제") |
| 9 | `POST /uploads` | 업로드·입력 | 검진지 이미지 → OCR |
| 10 | `POST /analyze` | 업로드·입력 | `save: true`로 저장 |
| 11 | `POST /analyze/simulate` | 종합 분석 | What-if — 저장하지 않음 |
| 12 | `GET /reports/{id}` | 셸 | 저장된 연도 목록 |
| 13 | `GET /reports/{id}/{year}` | 셸 | 연도별 상세 (연도마다 호출) |
| 14 | `GET /reports/{id}/comprehensive/latest` | 셸 | 최신 종합 분석 |
| 15 | `DELETE /reports/{id}/{year}` | 검진 기록 | 회차 삭제 |
| 16 | `POST /timeseries/refresh` | 저장·삭제 후 | `reload()`가 항상 먼저 호출 |
| 17 | `GET /timeseries/{id}` | 셸, 히스토리 | 회차 2개 미만이면 404 → null |
| 18 | `POST /medication/upload` | 도구·참고 | HIRA 엑셀 업로드 |
| 19 | `GET /medication/{id}` | 도구·참고 | 저장된 투약이력 조회 |
| 20 | `GET /reference/items` | 도구·참고 | 참고치 평가 가능 항목 목록 |
| 21 | `POST /reference/evaluate` | 도구·참고 | 검사항목 참고치 평가 |
| 22 | `POST /renal/egfr` | 도구·참고 | eGFR·CrCl 계산 |

## 7. 데이터 흐름

전역 데이터는 `App.tsx`가 **로그인 시 한 번만** 불러와 모든 섹션에 props로 내려줍니다. 섹션을 전환할 때마다 다시 불러오지 않습니다.

```text
로그인 성공 (Supabase session)
  ↓
App.tsx의 load()
  1. GET /users/{id}            → profile
  2. GET /reports/{id}          → years
  3. GET /reports/{id}/{year}   → 연도마다 (연도 오름차순 정렬)
  4. GET /reports/{id}/comprehensive/latest → latest (저장된 회차 있을 때만)
  5. GET /timeseries/{id}       → timeseries (2개 미만이면 null)
  ↓
AppData = { userId, profile, reports, raw, latest, timeseries, reload }
  ↓
7개 섹션 컴포넌트에 props로 전달
```

저장(검진 저장·프로필 저장) 또는 삭제가 일어나면 각 섹션은 `data.reload()`를 호출합니다.

```text
reload()
  1. POST /timeseries/refresh  (먼저 — 캐시를 최신 회차 기준으로 재계산)
  2. load() 재실행             (전체 데이터 다시 로드)
```

`GET /auth/me`, `GET /reference/items`처럼 특정 섹션에서만 쓰는 데이터는 전역 로드에 포함하지 않고 해당 섹션이 마운트될 때 자체적으로 불러옵니다(내 정보 → `getMe()`, 도구·참고 → `getReferenceItems()`).

## 8. 설계 원칙

- **판정은 백엔드, 표시는 프론트**: 정상/주의/위험, risk_score, 대사증후군 충족 여부, 계산기 값 — 전부 백엔드 응답을 그대로 표시합니다. 프론트가 재계산·재분류하지 않습니다.
- **없는 값은 "미측정"**: API 응답에 없는 값을 프론트가 임의로 채우지 않습니다. `0`으로 채우지 않고, 해당 카드/행을 숨기거나 "미측정"으로 표시합니다. `combo_analysis`, `single_groups`, `calculators`, `ldl_target`, `rarity`, `metabolic_syndrome_detail`은 구버전 저장 행에는 없을 수 있어 모든 소비 지점에 `null` 분기가 있습니다.
- **더미 금지**: 오프라인/더미 모드가 없습니다. 신규 사용자는 빈 상태(EmptyState)를 보고, 검증은 항상 실계정 + 로컬 백엔드로 합니다.
- **의료 표현 금지어**: "진단" · "확진" · "질병 판정"을 쓰지 않습니다. 대신 "참고 정보" · "관리 필요" · "위험 경향" · "추적 관리 권장" · "미측정"을 씁니다.

## 9. 앱과 다른 점

| 항목 | 앱 | 웹 |
|---|---|---|
| 검진 알림 | OS 푸시 알림 예약 | `.ics` 캘린더 파일 다운로드 (내 정보 → "캘린더에 추가") |
| 검진 기록 인쇄/공유 | 스크린샷 공유 | `window.print()` + print CSS (`print-hide`로 조작 버튼 숨김, `print-page`만 인쇄) |

`.ics` 파일은 `lib/format.ts`의 `buildCheckupIcs()`가 서버 호출 없이 브라우저에서 직접 생성합니다(RFC 5545, CRLF 개행). 인쇄는 검진 기록 상세("자세히 보기") 화면에서 `window.print()`를 호출하고, `styles.css`의 `@media print` 규칙이 사이드바·버튼을 가립니다.

## 10. 테스트와 스크린샷

단위 테스트(순수 함수만 — `api/adapt.ts`, `lib/format.ts`):

```powershell
npm test
```

섹션별 스크린샷(dev 서버 + 백엔드가 켜져 있어야 함, `DEMO_EMAIL`/`DEMO_PASSWORD` 환경변수 필수 — 기본값 없음):

```powershell
$env:DEMO_EMAIL = "..."; $env:DEMO_PASSWORD = "..."; node capture_sections.mjs
```

`screenshots/01-대시보드.png` ~ `07-내정보.png` 7장이 생성됩니다.
