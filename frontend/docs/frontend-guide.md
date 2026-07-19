# 프론트엔드 설명서

이 문서는 `health-service-back/frontend` 폴더에 들어있는 프론트엔드의 구조, 실행 방법, API 연결 방식, 화면별 기능을 팀원이 빠르게 이해하기 위한 설명서입니다.

## 1. 프로젝트 개요

프론트엔드는 건강검진 관리 웹서비스의 사용자 화면을 담당합니다. 사용자는 로그인 후 건강검진 결과지 이미지를 업로드하고, 백엔드 OCR 및 분석 API를 통해 추출된 건강 수치를 확인한 뒤 저장할 수 있습니다.

저장된 검진 리포트는 다음 화면에서 다시 사용됩니다.

- 대시보드
- 건강 히스토리
- 검진 기록
- 위험도 분석
- 데이터 업로드

현재 프론트엔드는 단순 더미 화면이 아니라 Supabase 인증과 백엔드 API를 연결한 서비스형 프로토타입입니다.

## 2. 사용 기술

- React
- Vite
- TypeScript
- Tailwind CSS
- Recharts
- lucide-react
- Supabase JS Client
- Fetch API

## 3. 실행 방법

```bash
cd frontend
npm install
npm run dev
```

빌드 확인:

```bash
npm run build
```

## 4. 환경변수 설정

실제 실행을 위해서는 `frontend/.env` 파일이 필요합니다.

`.env`는 GitHub에 올리지 않고, `.env.example`만 공유합니다.

팀원들은 아래처럼 복사해서 사용하면 됩니다.

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

필요한 환경변수:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_BACKEND_URL=
```

로컬 백엔드를 사용하는 경우 예시는 다음과 같습니다.

```env
VITE_BACKEND_URL=http://localhost:8000
```

## 5. 폴더 구조

```text
frontend/
├─ package.json
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ .env.example
└─ src/
   ├─ App.tsx
   ├─ main.tsx
   ├─ styles.css
   ├─ api/
   │  ├─ healthApi.ts
   │  ├─ reportMapper.ts
   │  └─ supabaseClient.ts
   ├─ app/components/
   │  ├─ Header.tsx
   │  ├─ Dashboard.tsx
   │  ├─ HealthHistory.tsx
   │  ├─ Records.tsx
   │  ├─ RiskAnalysis.tsx
   │  ├─ DataUpload.tsx
   │  └─ Common.tsx
   ├─ data/
   │  └─ mockData.ts
   └─ utils/
      └─ healthScores.ts
```

## 6. 핵심 파일 역할

### `src/App.tsx`

전체 앱의 중심 파일입니다.

주요 역할:

- Supabase 로그인 세션 확인
- 로그인 및 회원가입 처리
- 현재 사용자 `user_id` 관리
- 탭 전환 관리
- 사용자 정보와 리포트 데이터 로딩
- 각 화면 컴포넌트에 필요한 데이터 전달

로그인에 성공하면 자동으로 대시보드 화면으로 이동합니다.

### `src/api/supabaseClient.ts`

Supabase 클라이언트를 생성하고 현재 로그인 사용자의 access token을 가져옵니다.

이 access token은 백엔드 API 요청 시 Authorization 헤더에 들어갑니다.

```http
Authorization: Bearer {access_token}
```

### `src/api/healthApi.ts`

백엔드 API 요청 함수를 모아둔 파일입니다.

프론트에서 직접 `fetch`를 여러 곳에 흩뿌리지 않고, 이 파일을 통해 API를 호출합니다.

사용 중인 API:

- `GET /users`
- `POST /users`
- `PATCH /users/{user_id}`
- `POST /uploads`
- `POST /analyze`
- `GET /reports/{user_id}`
- `GET /reports/{user_id}/{year}`
- `GET /reports/{user_id}/comprehensive/latest`
- `DELETE /reports/{user_id}/{year}`

### `src/api/reportMapper.ts`

백엔드에서 받은 리포트 JSON을 프론트에서 사용하기 쉬운 형태로 변환합니다.

예시:

```text
height_cm          -> height
weight_kg          -> weight
waist_cm           -> waist
total_cholesterol  -> totalCholesterol
urine_protein      -> urineProtein
```

중요한 점은 API에 없는 값은 임의로 채우지 않는다는 것입니다. 값이 없으면 `0` 또는 `미측정`으로 처리하고, 화면에서는 미측정으로 표시합니다.

### `src/utils/healthScores.ts`

관리점수, 위험도, 주요 지표 점수를 계산하는 유틸 함수가 들어 있습니다.

계산 항목:

- 혈압
- 혈당
- 콜레스테롤
- 체중
- 간 기능
- 신장 기능

측정하지 않은 항목은 점수 평균 계산에서 제외합니다.

## 7. 화면 구성

프론트는 상단 탭 메뉴 기반으로 구성되어 있습니다.

```text
1. 대시보드
2. 건강 히스토리
3. 검진 기록
4. 위험도 분석
5. 데이터 업로드
```

React Router는 사용하지 않고, `App.tsx`의 `activeTab` 상태로 화면을 전환합니다.

## 8. 로그인 및 회원가입

로그인과 회원가입은 Supabase Auth를 사용합니다.

회원가입 시 입력 항목:

- 이메일
- 비밀번호
- 이름
- 성별
- 출생연도

회원가입 후 사용자 프로필은 백엔드의 `POST /users`로 저장합니다.

로그인 후에는 Supabase 작업의 `session.user.id`를 실제 `user_id`로 사용합니다.

프론트에서 임의로 `user_id`를 만들지 않습니다.

## 9. 프로필 수정

우측 상단 프로필 메뉴에서 다음 정보를 수정할 수 있습니다.

- 이름
- 성별
- 출생연도

프로필 수정은 다음 API를 사용합니다.

```http
PATCH /users/{user_id}
```

이름을 수정하면 대시보드에서는 저장된 리포트 안의 예전 이름보다 현재 프로필 이름을 우선 표시합니다.

## 10. 데이터 로딩 흐름

로그인 후 프론트는 다음 순서로 데이터를 가져옵니다.

```text
1. Supabase 작업 확인
2. session.user.id를 user_id로 사용
3. GET /users로 사용자 목록 조회
4. GET /reports/{user_id}로 저장된 연도 목록 조회
5. 각 연도별 GET /reports/{user_id}/{year} 조회
6. reportMapper에서 화면용 데이터로 변환
7. GET /reports/{user_id}/comprehensive/latest 조회
8. 각 화면 컴포넌트에 데이터 전달
```

## 11. 데이터 업로드 및 OCR 저장 흐름

데이터 업로드 화면의 흐름은 다음과 같습니다.

```text
1. 사용자가 건강검진 결과지 이미지 업로드
2. POST /uploads 요청
3. 백엔드 OCR 결과 JSON 반환
4. 프론트에서 추출값을 입력 폼에 표시
5. 사용자가 값 확인 및 수정
6. POST /analyze 요청
7. save: true로 분석 결과 저장
8. 저장 후 reports 데이터를 다시 불러와 화면 갱신
```

`POST /analyze` 요청에는 `user_id`를 직접 보내지 않습니다. 백엔드가 Supabase JWT를 보고 사용자를 식별합니다.

## 12. 대시보드

대시보드는 가장 최근 검진 리포트를 기준으로 정보를 요약합니다.

표시 항목:

- 검진 리포트 개수
- 관리점수
- 관리 필요 항목 수
- 최근 검진일
- 병원명
- 주요 지표 점수
- 최근 인사이트

관리점수 계산 방식:

```text
1. comprehensive.summary.risk_score가 있으면 우선 사용
2. 없으면 프론트에서 측정된 항목만 기준으로 계산
```

기본 해석:

```text
관리점수 = 100 - 위험도 점수
```

점수가 높을수록 현재 검진 수치 기준 관리 상태가 양호하다는 참고 지표입니다.

## 13. 건강 히스토리

히스토리는 저장된 검진 기록 개수에 따라 다르게 보여줍니다.

```text
0개: 빈 상태 안내
1개: 현재 수치와 동연령대 평균 비교 카드
2개 이상: 연도별 선그래프
```

기록이 1개뿐일 때 선그래프를 쓰면 점 하나만 보여 의미가 약하기 때문에, 현재 수치 비교 카드로 처리했습니다.

그래프 항목:

- 혈압 추이
- 콜레스테롤 추이
- BMI 추이
- 혈당 및 중성지방 추이
- 간 및 신장 기능 추이

차트는 Recharts를 사용합니다.

## 14. 검진 기록

검진 기록 화면은 저장된 리포트 목록을 표로 보여줍니다.

컬럼:

- 검진연도
- 검진일
- 의료기관
- 상태
- 요약
- 작업

작업 버튼:

- 자세히 보기
- JSON 다운로드
- 삭제

자세히 보기에서는 사용자에게 필요한 검사 항목만 보여줍니다.

표시 항목:

- 신장
- 체중
- BMI
- 허리둘레
- 수축기혈압
- 이완기혈압
- 공복혈당
- 총콜레스테롤
- LDL
- HDL
- 중성지방
- AST
- ALT
- 감마GTP
- 크레아티닌
- 요단백

숨긴 내부 필드 예시:

- `icon`
- `color`
- `auto_calculated`
- 내부 status 코드

## 15. 위험도 분석

위험도 분석은 가장 최근 검진 리포트를 기준으로 계산합니다.

구성:

- 현재 그룹 배너
- 대사증후군 위험도 평가
- 질병별 참고 위험도
- 현재 연령대 위험도 비교
- 종합 건강 점수

대사증후군 기준:

```text
복부비만
혈압 상승
공복혈당 상승
낮은 HDL
중성지방 상승
```

성별 기준:

```text
남성 허리둘레: 90cm 이상
여성 허리둘레: 85cm 이상
남성 HDL: 40mg/dL 미만
여성 HDL: 50mg/dL 미만
```

질병별 참고 위험도:

```text
당뇨병: 공복혈당 + BMI
고혈압: 수축기혈압 + 이완기혈압
고지혈증: LDL + HDL + 중성지방
심혈관 질환: 혈압 + 혈당 + BMI + 허리둘레 + 지질 항목
```

필수 항목이 부족하면 해당 위험도는 `미측정`으로 표시하고 계산하지 않습니다.

## 16. 삭제 기능

검진 기록 화면에는 삭제 버튼이 있습니다.

요청 방식:

```http
DELETE /reports/{user_id}/{year}
```

프론트는 DB 삭제 요청을 백엔드에 보냅니다. 실제로 DB에서 삭제되는지는 백엔드가 해당 DELETE API를 어떻게 구현했는지에 따라 달라집니다.

## 17. 중요한 설계 원칙

가장 중요한 원칙은 다음입니다.

```text
API나 DB에 없는 값은 프론트에서 임의로 만들지 않는다.
```

따라서:

- 신규 사용자는 더미 데이터가 보이지 않습니다.
- 측정하지 않은 항목은 `미측정`으로 표시합니다.
- 그래프에서 제외합니다.
- 위험도 계산에서 제외합니다.
- 점수 평균에서도 제외합니다.

## 18. 의료 표현 원칙

이 서비스는 의료 진단 서비스가 아닙니다.

따라서 프론트에서는 다음 표현을 피합니다.

- 진단
- 확진
- 질병 판정

대신 다음 표현을 사용합니다.

- 건강검진 수치 기반 참고 정보
- 관리 필요
- 위험 경향
- 추적 관리 권장
- 미측정

## 19. 팀원에게 짧게 설명할 요약

프론트엔드는 React, Vite, TypeScript 기반으로 구현했고 Supabase Auth와 백엔드 API를 연결했습니다. 사용자는 로그인 후 건강검진 이미지를 업로드하고, OCR 결과를 확인 및 수정한 뒤 분석 결과를 저장할 수 있습니다. 저장된 리포트는 대시보드, 히스토리, 검진 기록, 위험도 분석 화면에서 목적에 맞게 재가공되어 표시됩니다. 측정되지 않은 항목은 임의값으로 채우지 않고 `미측정`으로 처리해 데이터 신뢰성을 유지하도록 설계했습니다.

## 20. 팀원 질문 정리

### 질문 1. 위험도 페이지에서 프론트가 따로 계산해야 하나요?

결론부터 말하면, 최종 구조에서는 백엔드 JSON에 이미 `정상`, `주의`, `위험` 같은 분류 결과가 들어있다면 프론트에서 다시 같은 기준으로 분류 계산을 하는 것은 권장하지 않습니다.

가장 좋은 역할 분리는 다음과 같습니다.

```text
백엔드:
- 검진 수치 분석
- 정상/주의/위험 분류
- risk_score 계산
- overall_status 계산
- 대사증후군 기준 계산

프론트:
- 백엔드가 내려준 분석 결과를 화면에 보기 좋게 표시
- 그래프, 카드, 배지, 표 형태로 시각화
```

즉, 건강 수치에 대한 판정 기준은 백엔드가 가지고 있고, 프론트는 그 결과를 표시하는 역할이 맞습니다.

다만 현재 프론트에 일부 계산 로직이 들어간 이유는 개발 중간 단계에서 API 응답이 없거나 일부 값이 비어 있을 때도 화면이 깨지지 않게 하기 위한 보조 처리입니다.

예를 들어 다음 값이 백엔드에서 내려오면:

```json
{
  "metric": "공복혈당",
  "value": 112,
  "unit": "mg/dL",
  "status": "high",
  "label": "주의",
  "meaning": "혈당 추적 관리 권장"
}
```

프론트는 `112면 주의인가 위험인가`를 다시 판단하지 않고, 백엔드가 내려준 값을 그대로 화면에 표시하는 것이 맞습니다.

```text
공복혈당: 112 mg/dL
상태: 주의
의미: 혈당 추적 관리 권장
```

현재 프론트의 방향은 다음과 같습니다.

```text
1. 백엔드 comprehensive 데이터가 있으면 우선 사용
2. comprehensive.summary.risk_score가 있으면 관리점수 계산에 우선 반영
3. comprehensive.all_evaluations에 status/label이 있으면 관리 필요 항목 표시 기준으로 사용
4. 백엔드 값이 부족한 경우에만 프론트에서 보조 계산
```

따라서 추후 정리 방향은 다음이 좋습니다.

```text
백엔드 분석 결과가 충분히 안정화되면:
- 위험도 분류
- 정상/주의/위험 배지
- risk_score
- overall_status
- 대사증후군 판단

위 항목은 백엔드 값을 우선 사용하고,
프론트 계산은 fallback 또는 화면 보조용으로만 유지합니다.
```

### 질문 2. DB 연결하는 부분이 문서에 안 적혀 있습니다.

프론트는 Supabase DB에 직접 연결하지 않습니다.

전체 데이터 흐름은 다음과 같습니다.

```text
프론트엔드 React
  ↓ API 요청
백엔드 FastAPI
  ↓ DB 조회/저장/삭제
Supabase DB
```

프론트가 직접 하는 것은 DB 접속이 아니라 다음 두 가지입니다.

```text
1. Supabase Auth
   - 로그인
   - 회원가입
   - access token 가져오기

2. 백엔드 API 호출
   - 사용자 정보 조회/수정
   - 파일 업로드
   - 분석 저장
   - 리포트 조회
   - 리포트 삭제 요청
```

즉, DB 연결과 DB 쿼리는 백엔드 담당입니다.

프론트는 로그인 후 Supabase 작업에서 access token을 가져오고, 백엔드 API 요청에 이 토큰을 붙입니다.

```http
Authorization: Bearer {supabase_access_token}
```

백엔드는 이 토큰을 검증한 뒤 Supabase DB에서 데이터를 조회합니다.

예를 들어 저장된 검진 기록을 불러오는 흐름은 다음과 같습니다.

```text
1. 사용자가 로그인
2. Supabase Auth가 session.user.id와 access_token 발급
3. 프론트가 session.user.id를 user_id로 사용
4. 프론트가 GET /reports/{user_id} 요청
5. 요청 헤더에 Authorization: Bearer {access_token} 포함
6. 백엔드가 token 검증
7. 백엔드가 Supabase DB에서 해당 사용자의 리포트 조회
8. 백엔드가 JSON으로 응답
9. 프론트가 받은 JSON을 화면용 데이터로 변환
10. 대시보드, 히스토리, 검진기록, 위험도 분석에 표시
```

예시 요청:

```http
GET /reports/9ff91acc-7458-4813-8c45-2bbabc1b8c5f
Authorization: Bearer eyJ...
```

예시 응답:

```json
{
  "user_id": "9ff91acc-7458-4813-8c45-2bbabc1b8c5f",
  "years": [2024, 2025],
  "count": 2
}
```

연도별 상세 리포트는 다음 API로 다시 가져옵니다.

```http
GET /reports/{user_id}/{year}
```

예시 응답 구조:

```json
{
  "user_id": "9ff91acc-7458-4813-8c45-2bbabc1b8c5f",
  "year": 2024,
  "checkup": {
    "height_cm": 172,
    "weight_kg": 68,
    "bmi": 23.0,
    "waist_cm": 82,
    "sbp": 126,
    "dbp": 81,
    "fbs": 93,
    "total_cholesterol": 188,
    "ldl": 108,
    "hdl": 63,
    "tg": 112,
    "ast": 25,
    "alt": 27,
    "ggt": 33,
    "creatinine": 0.9
  },
  "basic_report": {},
  "comprehensive": {},
  "analyzed_at": "2026-05-20T..."
}
```

프론트는 이 JSON을 `src/api/reportMapper.ts`에서 화면용 데이터로 변환합니다.

예시:

```text
height_cm          -> height
weight_kg          -> weight
waist_cm           -> waist
total_cholesterol  -> totalCholesterol
urine_protein      -> urineProtein
```

따라서 문서에 DB 접속 코드가 없는 이유는 프론트가 DB에 직접 접속하지 않기 때문입니다.

정리하면 다음과 같습니다.

```text
프론트가 하는 일:
- Supabase 로그인 세션 확인
- access token 가져오기
- 백엔드 API 호출
- 받은 JSON을 화면에 맞게 변환
- 화면에 표시

백엔드가 하는 일:
- access token 검증
- Supabase DB 조회
- Supabase DB 저장
- Supabase DB 삭제
- 분석 결과 JSON 응답
```

### 팀원 질문에 대한 짧은 답변

```text
위험도 계산은 최종적으로 백엔드 JSON에 들어있는 status, label, risk_score, overall_status를 우선 사용하는 구조가 맞습니다.
현재 프론트 계산은 백엔드 값이 없거나 일부 항목이 비어 있을 때 화면이 동작하도록 만든 보조 로직입니다.

DB는 프론트에서 직접 연결하지 않습니다.
프론트는 Supabase Auth로 access token만 받고, 백엔드 API에 요청합니다.
실제 Supabase DB 조회, 저장, 삭제는 백엔드가 담당합니다.
```
