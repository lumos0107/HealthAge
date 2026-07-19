# WITHUS 모바일 앱 — 프론트엔드 기능·기술 정리

건강검진 결과지를 올리면 OCR로 수치를 추출하고 AI가 분석해, **건강 점수 · 연도별 추이 · 또래 비교 · 맞춤 안내**를 보여주는 React Native 모바일 앱입니다. 이 문서는 프론트엔드에서 구현한 기능과 사용한 기술을 정리한 것입니다.

---

## 1. 기술 스택

| 기술 | 용도 |
|------|------|
| **React Native + Expo (SDK 54)** | iOS/Android 동시 지원 크로스플랫폼 앱 |
| **TypeScript** | 정적 타입으로 안정성 확보 |
| **Supabase JS SDK** | 이메일/비밀번호 인증(로그인·회원가입), 세션 관리 |
| **expo-image-picker** | 카메라 촬영 / 갤러리에서 검진지 사진 선택 |
| **expo-document-picker** | HIRA 복약이력 엑셀(.xls/.xlsx) 파일 선택 |
| **react-native-svg** | 연도별 시계열 그래프 렌더링 |
| **@expo/vector-icons (Ionicons)** | 전체 아이콘 |
| **expo-linear-gradient / expo-blur** | 카드·헤더 등 UI 시각 효과 |
| **@expo-google-fonts/do-hyeon** | 브랜드·큰 제목용 디스플레이 폰트 |
| **AsyncStorage** | 세션 토큰 등 로컬 저장 |

**아키텍처 특징**
- `App.tsx`가 인증·라우팅·전역 상태(검진 데이터, 복약, 시계열, 권장사항, eGFR)를 관리
- `src/health.ts`가 백엔드 REST API 연동을 전담 (화면은 API를 직접 몰라도 됨)
- `src/data.ts`에 타입 정의와 미리보기용 목업 데이터 분리
- `src/components/UI.tsx`에 디자인 토큰(`T`)과 공통 컴포넌트(FadeIn 등) 집약

---

## 2. 화면 구성 (6개 탭)

| 탭 | 화면 | 핵심 역할 |
|----|------|-----------|
| 대시보드 | `DashboardScreen` | 건강 종합 점수 · 이상 항목 · 빠른 이동 |
| 기록 | `RecordsScreen` | 연도별 검진 상세 · 복약 정보 · 기록 삭제 |
| 히스토리 | `HistoryScreen` | 연도별 시계열 그래프 · 변화 하이라이트 |
| 분석 | `AnalysisScreen` | 맞춤 권고사항 · eGFR · 또래 비교 |
| 업로드 | `UploadScreen` | 검진지·처방전 업로드 → OCR → 분석 |
| 프로필 | `ProfileScreen` | 개인정보 수정 · 설정 · 로그아웃 |

---

## 3. 구현한 기능

### 3.1 인증
- Supabase 이메일/비밀번호 로그인·회원가입
- **로그인 실패 시 한국어 인라인 에러 메시지** — 영문 Supabase 에러를 상황별 한국어로 번역
  (비밀번호 오류 / 이메일 미인증 / 시도 초과)
- 로그인 전에는 잠금, 로그인 후 전체 기능 사용

### 3.2 검진 결과 업로드 & 분석 (핵심 플로우)
```
사진 촬영·선택 → OCR 수치 자동 추출 → 사용자 검수·수정 → 백엔드 분석·저장
```
- 카메라 촬영 / 갤러리 선택 모두 지원
- 추출된 수치를 사용자가 직접 확인·수정 후 저장
- 예시(더미) 미리보기 제공 — "예시 데이터"임을 명확히 표시해 실제 저장과 구분

### 3.3 대시보드
- 건강 종합 점수(0~100) 대형 표시 + 점수 바
- 정상 / 주의 / 위험 항목 집계
- "지금 확인할 항목" — 이상 항목 강조
- **빠른 이동** — 검진기관·병원·약국 찾기(정부 사이트 연동), 결과지 업로드

### 3.4 기록 화면
- 연도별 검진 기록 목록 + 연도 선택 시 상세 항목
- 항목별 **내 수치 / 정상 기준 / 연령대 평균** 3열 비교
- 정상/주의/위험 색상 뱃지
- **연도별 기록 삭제** — 휴지통 아이콘 → 확인 다이얼로그 → 서버 삭제 → 자동 새로고침
- **복약 정보** — 효능군별로 묶어 표시 (실제 저장된 복약 데이터 연동)

### 3.5 히스토리 화면
- 연도별 **시계열 그래프**(SVG) — 그룹별(혈압/지질/간기능/신장 등) 차트
- 시계열 하이라이트 — 주목할 변화 구간 강조 (2년 이상 기록 시)
- 그 해 실제 측정된 항목만 표시 (검사 안 한 항목을 가짜로 그리지 않음)

### 3.6 분석 화면
- AI 기반 **맞춤 권고사항**
- **eGFR(신장 기능)** — 혈청 크레아티닌이 실제 측정된 경우에만 계산 결과 표시
- 또래 대비 백분위 · 복약 반영 뱃지 · 노인 경고

### 3.7 데이터 진실성 (의료 서비스 신뢰도)
가짜 데이터로 사용자를 오해시키지 않도록 상태별로 화면을 분리했습니다.

| 상태 | 화면 |
|------|------|
| 미로그인 | 가짜 점수 대신 **로그인 유도 CTA** (검진기관·병원·약국 찾기는 로그인 없이 사용 가능) |
| 로그인 + 기록 없음 | **"검진 기록이 없어요" 빈 상태** + 업로드 유도 |
| 로그인 + 기록 있음 | **실제 데이터만** 표시 |
| 데모 계정(root) | 시연용 더미 데이터 (발표용) |

### 3.8 외부 링크 안정화
- 정부 사이트(검진기관·약국·복약자료 발급) 링크를 **작동하는 최신 URL로 교체**
- `openExternalUrl()` 헬퍼로 링크 열기 실패 시 조용히 죽지 않고 안내창 표시

---

## 4. 백엔드 연동 (API)

`src/health.ts`가 호출하는 주요 엔드포인트:

| 기능 | 메서드 · 경로 |
|------|----------------|
| 검진지 OCR 업로드 | `POST /uploads` |
| 분석 + 저장 | `POST /analyze` |
| 연도 목록 | `GET /reports/{userId}` |
| 연도별 보고서 | `GET /reports/{userId}/{year}` |
| 기록 삭제 | `DELETE /reports/{userId}/{year}` |
| 시계열 분석 | `GET /timeseries/{userId}` |
| 복약자료 업로드 | `POST /medication/upload` |
| **복약 조회** | `GET /medication/{userId}` |
| eGFR 계산 | `POST /renal/egfr` |
| 프로필 | `GET·PATCH /users` |

> `usingRealData` 플래그로 실제 데이터가 있을 때만 백분위·권고사항·eGFR·복약 등 고급 기능을 노출합니다.

---

## 5. 실행 방법 (처음 셋업하는 사람용)

> ⚠️ **`git clone`만으로는 실행되지 않습니다.** 아래는 보안상 깃에 올리지 않으므로 각자 준비해야 합니다.
> - `node_modules/` (의존성) → `npm install` / `uv sync`로 설치
> - `.venv/` (파이썬 가상환경) → `uv sync`로 생성
> - **`.env` (API 키·비밀번호)** → 아래 예시대로 직접 생성 (값은 팀에서 별도 전달, 절대 깃에 올리지 말 것)

### 5.1 프론트엔드 (frontend-mobile 폴더)

```bash
cd frontend-mobile

# ① 의존성 설치
npm install

# ② .env 파일 생성 (.env.example 참고) — 아래 3개 값 필요
#    EXPO_PUBLIC_SUPABASE_URL=https://<프로젝트>.supabase.co
#    EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
#    EXPO_PUBLIC_BACKEND_URL=http://<백엔드-PC-IP>:8000
#    ※ .env 없으면 데모 모드(root/1234 로그인)로만 동작합니다.

# ③ 실행 — 같은 와이파이의 폰에서 Expo Go 앱으로 QR 스캔
npx expo start --lan
#    방화벽 등으로 폰 연결이 안 되면 --tunnel 사용:
#    npx expo start --tunnel
```

### 5.2 백엔드 (backend 폴더, 별도 터미널)

```bash
cd backend

# ① 파이썬 의존성 설치 (.venv 자동 생성)
uv sync

# ② .env 파일 생성 (.env.example 참고) — Supabase / Gemini 키 등
#    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#    SUPABASE_JWT_SECRET, GEMINI_API_KEY 등

# ③ 실행
uvicorn app.main:app --reload --port 8000
```

### 5.3 주의사항
- **프론트·백엔드 두 터미널을 동시에** 켜야 실제 데이터 기능이 동작합니다.
- `EXPO_PUBLIC_BACKEND_URL`의 IP는 **백엔드를 돌리는 PC의 실제 IP**여야 합니다(폰에서 `localhost`는 안 됨). 예: `http://192.168.0.10:8000`
- `frontend-mobile/index.js`는 Metro 진입점이라 삭제하면 앱이 안 열립니다.
- `.env` 파일들은 깃에 포함되지 않습니다 — 키 값은 카톡/디스코드 등으로 직접 전달하세요.

---

## 6. 폴더 구조 (프론트)

```
frontend-mobile/
├── index.js                  # Metro 진입점 (삭제 금지)
├── App.tsx                   # 인증·라우팅·전역 상태
└── src/
    ├── health.ts             # 백엔드 API 연동 전담
    ├── api.ts                # apiFetch / Supabase 클라이언트
    ├── data.ts               # 타입 정의 + 목업 데이터
    ├── components/
    │   └── UI.tsx            # 디자인 토큰(T) + 공통 컴포넌트
    └── screens/
        ├── DashboardScreen.tsx
        ├── RecordsScreen.tsx
        ├── HistoryScreen.tsx
        ├── AnalysisScreen.tsx
        ├── UploadScreen.tsx
        └── ProfileScreen.tsx
```
