# Backend — Health Service

한국 건강검진 OCR 기반 개인 건강 분석 백엔드.

- **FastAPI + Supabase + Ollama (또는 Gemini)**
- **12개 엔드포인트** — 인증/사용자/OCR/분석/리포트
- **양방향 임계값 분석** — NHIS 1500만 행 모집단 통계 기반
- **격리된 분석 모듈** — 미래에 마이크로서비스로 분리 가능

---

## 빠르게 시작

### 사전 조건
- Python 3.11 이상
- [uv](https://docs.astral.sh/uv/) 패키지 매니저
- `.env` 파일 (백엔드 담당자에게 받음)

### uv 설치

**Windows PowerShell:**
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**Mac/Linux:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

설치 후 터미널 새로 열기.

### 의존성 설치

```bash
cd backend
uv sync
```

⚠️ 첫 `uv sync`는 75개 패키지 받아서 1~3분. 두 번째부터 빠름.

### 환경변수 설정

`backend/.env` 파일 만들기 (담당자에게 받음). 형식:

```env
ENV=development

# Supabase
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# OCR
VISION_BACKEND=ollama
# OLLAMA_HOST=https://...ngrok-free.dev   # 데모 시 받음
# OLLAMA_MODEL=qwen2.5vl:7b-q8_0

# 서버
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO
```

⚠️ `.env`는 절대 commit 금지. `.gitignore`에 포함됨.

### 서버 실행

```bash
uv run uvicorn app.main:app --reload --reload-dir app
```

성공:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

브라우저로 **http://localhost:8000/docs** 열면 Swagger UI 보임.

⚠️ 로그에 `OCR: backend 연결 실패` WARNING 보일 수 있음 — Ollama 안 켜져있어서 정상. OCR 외 기능엔 무관.

---

## 테스트

```bash
uv run pytest
```

기대: **54 passed, 1 skipped**

테스트 카테고리:
- `test_analyzer_isolation.py` — 분석 모듈 격리 검증 (9개)
- `test_ocr_service.py` — OCR 서비스 로직 (6+1)
- `test_routers.py` — HTTP 엔드포인트 (14개)
- `test_schemas.py` — Pydantic 검증 (16개)
- `test_uploads.py` — 파일 업로드 (9개)

---

## 폴더 구조

```
backend/
├── app/                          # 코드 본체
│   ├── main.py                   # FastAPI 진입점, 라우터 등록
│   ├── config.py                 # 환경변수 (Pydantic Settings)
│   ├── auth.py                   # JWT 검증 (ES256 via JWKS + HS256 fallback)
│   ├── db.py                     # Supabase 클라이언트 (서비스/유저 분리)
│   │
│   ├── routers/                  # HTTP 엔드포인트 정의
│   │   ├── health.py             #   GET /, GET /health
│   │   ├── users.py              #   /users CRUD (5개)
│   │   ├── uploads.py            #   POST /uploads (OCR)
│   │   └── analysis.py           #   POST /analyze, GET /reports/...
│   │
│   ├── services/                 # 비즈니스 로직 (라우터와 분리)
│   │   ├── user_service.py       #   profiles CRUD
│   │   ├── upload_service.py     #   OCR 호출 + 검증
│   │   └── checkup_service.py    #   분석 + DB 저장 (핵심)
│   │
│   ├── schemas/                  # Pydantic 입출력 모델
│   │   ├── profile.py            #   사용자 프로필
│   │   ├── checkup.py            #   검진 데이터
│   │   ├── analysis.py           #   분석 요청/응답
│   │   ├── uploads.py            #   OCR 응답
│   │   └── common.py             #   공통 (에러 등)
│   │
│   ├── analyzer/                 # 검진 분석 (격리 모듈)
│   │   ├── __init__.py           #   외부 진입점 (analyze 함수 + 버전)
│   │   └── _internal/            #   분석 코드 (외부 직접 접근 금지)
│   │       ├── pipeline.py       #     분석 파이프라인
│   │       ├── thresholds.py     #     양방향 임계값 정의
│   │       ├── peer_compare.py   #     모집단 비교
│   │       ├── health_report.py  #     basic + comprehensive 생성
│   │       └── ocr_adapter.py    #     OCR JSON → 분석 입력 변환
│   │
│   └── ocr/                      # OCR 처리
│       ├── service.py            #   진입점 (extract_ocr 함수)
│       ├── backends/             #   Vision 백엔드
│       │   └── gemini.py         #     Gemini API 어댑터
│       └── pipeline/             #   OCR 파이프라인 (OCR 친구 코드)
│           ├── entry.py          #     extract_from_images (단일/멀티 통합)
│           ├── config.py
│           ├── splitter/         #     이미지 영역 분할
│           ├── pipelines/        #     영역별 처리
│           ├── merger/           #     페이지 병합
│           └── utils/
│               └── vision_backend.py  # Ollama/Gemini 추상화
│
├── data/
│   └── stats/                    # NHIS 모집단 통계 (1.3MB Parquet)
│       ├── peer_stats.parquet
│       ├── group_stats.parquet
│       ├── group_demographics.parquet
│       └── change_stats.parquet
│
├── sql/                          # Supabase 셋업 (신규 프로젝트용)
│   ├── 01_schema.sql             # 4 테이블 + 인덱스 + 트리거
│   ├── 02_rls.sql                # Row Level Security 정책 (12개)
│   └── 03_sample_queries.sql     # 운영 쿼리 예시
│
├── scripts_for_migration/        # 분석/OCR 코드 이관 스크립트
│   ├── 01_copy_analyzer.sh       # Mac/Linux 분석 이관
│   ├── 02_bridge_files.sh        # 브릿지 파일 생성
│   ├── 03_copy_ocr.ps1           # Windows OCR 이관
│   └── 04_copy_analyzer.ps1      # Windows 분석 이관
│
├── tests/                        # 자동 테스트 (55개)
├── .env.example                  # 환경변수 템플릿
├── pyproject.toml                # 의존성 + 도구 설정
├── uv.lock                       # 의존성 잠금
└── README.md                     # 이 파일
```

---

## 아키텍처 흐름

### 회원가입 (백엔드 거치지 않음)

```
프론트 → Supabase JS SDK signUp()
            ↓
        auth.users INSERT
            ↓ (트리거 자동)
        profiles INSERT (빈 행)
```

### 사용자 프로필 입력

```
프론트 → POST /users { name, gender, birth_year }
            ↓
        auth.py: JWT 검증 (ES256 또는 HS256 fallback)
            ↓
        services/user_service.py
            ↓
        profiles UPDATE (upsert)
            ↓
        응답: 프로필 객체
```

### 검진지 업로드 → 분석 → 저장

```
프론트 → POST /uploads (multipart, file)
            ↓
        services/upload_service.py
            ↓
        ocr/service.py: extract_ocr(image_bytes, mime)
            ↓
        asyncio.to_thread → ocr/pipeline/entry.py: extract_from_images()
            ↓
        Ollama 또는 Gemini 호출 (vision backend)
            ↓
        OCR JSON 응답

프론트 → 사용자가 OCR 결과 검수 (UI에서 수정)

프론트 → POST /analyze { ocr, save: true }
            ↓
        services/checkup_service.py
            ↓
        analyzer.analyze(ocr, user_info)
            ↓ (격리 모듈)
        _internal/pipeline.py: run_basic + run_comprehensive
            ↓
            BMI 자동 계산
            동연령 백분위
            양방향 임계값
            대사증후군 판정
            ↓
        analyze 결과: basic_report + comprehensive
            ↓ (save=true이면)
        checkup_records INSERT (펼친 컬럼)
        analysis_results INSERT (JSONB)
            ↓
        응답: 분석 결과 + saved_paths
```

### 리포트 조회

```
프론트 → GET /reports/{user_id}             → 연도 목록
프론트 → GET /reports/{user_id}/{year}      → 특정 연도 검진 + 분석
프론트 → GET /reports/{user_id}/comprehensive/latest → 최근 종합
```

---

## 12개 엔드포인트

기본 URL: `http://localhost:8000` (로컬)

| Method | Path | 설명 | 인증 |
|---|---|---|---|
| GET | `/` | 서비스 정보 | X |
| GET | `/health` | 헬스체크 + 통계 | X |
| GET | `/users` | 본인 프로필 목록 (RLS) | O |
| GET | `/users/{user_id}` | 프로필 조회 | O |
| POST | `/users` | 프로필 upsert | O |
| PATCH | `/users/{user_id}` | 프로필 수정 | O |
| DELETE | `/users/{user_id}` | 계정 삭제 (미구현) | O |
| POST | `/uploads` | 이미지 → OCR JSON | O |
| POST | `/analyze` | OCR → 분석 + 옵션 저장 | O |
| GET | `/reports/{user_id}` | 검진 연도 목록 | O |
| GET | `/reports/{user_id}/{year}` | 연도별 상세 | O |
| GET | `/reports/{user_id}/comprehensive/latest` | 최근 종합 | O |

인증 필요 엔드포인트는 `Authorization: Bearer <Supabase JWT>` 헤더 필수.

자세한 명세는 Swagger UI (`/docs`) 또는 별도 명세서 참고.

---

## DB 스키마 (4개 테이블)

```
auth.users (Supabase 내장)
    ↓ 1:1
profiles
    ↓ 1:N
checkup_records ─────┐
    ↓ 1:N            │
analysis_results ←───┘ (FK record_id)

timeseries_analyses (시계열 캐시 — 현재 미사용)
```

### profiles
사용자 추가 정보 (이름/성별/출생연도). 가입 시 트리거가 빈 행 자동 생성.

### checkup_records
검진 데이터 (펼친 컬럼). `UNIQUE (user_id, exam_year)` 제약.

### analysis_results
분석 결과. `basic_report` + `comprehensive` 두 개의 JSONB.

### RLS (Row Level Security)
모든 테이블에 활성. 사용자는 자기 데이터만 접근 가능.

자세히: [DB 구조 가이드](../1_pending_tasks.md) 또는 `sql/01_schema.sql` 참고.

---

## 분석 모듈 격리

`app/analyzer/_internal/`는 외부 의존성 없는 순수 모듈. 외부에서 접근은 오직:

```python
from app.analyzer import analyze, ANALYZER_VERSION

result = await analyze(ocr_json, user_info)
```

격리 규칙:
- 외부 모듈은 `_internal/`에 직접 import 불가
- 의존성: polars, pandas, numpy만 (FastAPI/Supabase 의존성 X)
- `data/stats/`의 Parquet 사용

격리 규칙은 `tests/test_analyzer_isolation.py`가 자동 검증.

미래에 별도 마이크로서비스로 분리 가능. `data/stats/` Parquet 같이 옮기면 끝.

---

## OCR 백엔드

### 옵션 1: Ollama (개발용, 무료)

로컬 또는 ngrok 통한 원격:
```bash
ollama pull qwen2.5vl:7b-q8_0
ollama serve
```

`.env`:
```
VISION_BACKEND=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5vl:7b-q8_0
```

### 옵션 2: Ollama via ngrok (협업/데모용)

데스크탑에 GPU + Ollama, 노트북에서 사용:

데스크탑:
```powershell
$env:OLLAMA_HOST = "0.0.0.0:11434"
$env:OLLAMA_ORIGINS = "*"
ollama serve
ngrok http 11434
```

노트북 `.env`:
```
OLLAMA_HOST=https://<ngrok URL>
```

⚠️ `app/ocr/pipeline/utils/vision_backend.py`에 `ngrok-skip-browser-warning: true` 헤더 패치 적용됨 (Free 티어 봇 방지 우회용).

### 옵션 3: Gemini (정식 배포용)

```
VISION_BACKEND=gemini
GEMINI_API_KEY=...
```

`google-genai` 패키지 추가 필요: `uv add google-genai`

---

## 자주 막히는 곳

### `Set-ExecutionPolicy` 필요
PowerShell 스크립트 차단:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### `uv: command not found`
uv 설치 후 터미널 새로 열기. PATH 갱신 필요.

### `uv trampoline failed to canonicalize`
`.venv`가 옛 경로 가리키는 중 (폴더 옮긴 후). 해결:
```bash
rm -rf .venv
uv sync
```

### `503 OCR 서버 연결 실패`
- Ollama 안 켜졌거나
- ngrok URL이 옛 거 (재시작 시 변경됨)
- 해결: `.env`의 `OLLAMA_HOST` 확인, 서버 재시작

### `401 Unauthorized`
JWT 토큰 만료 (1시간). Supabase JS SDK가 자동 갱신.

### `403 본인의 user_id만 접근...`
URL path의 user_id가 토큰의 user_id와 다름. 본인 UUID 사용.

### `duplicate key value violates unique constraint`
같은 사용자가 같은 연도(`exam_year`)에 검진 두 번 등록. 기존 거 삭제하거나 다른 연도로.

### 한글 출력 깨짐 (Windows PowerShell)
`?곗씠?` 같이 깨지면 PowerShell 5.1 인코딩 문제. 파일 자체는 UTF-8로 정상. Git Bash 또는 PowerShell 7+ 추천.

---

## 자주 쓰는 명령

```bash
# 의존성
uv sync                                 # 설치/갱신
uv add <패키지>                          # 추가
uv add --dev <패키지>                    # 개발 의존성

# 실행
uv run uvicorn app.main:app --reload --reload-dir app
uv run pytest                           # 테스트
uv run pytest -v                        # verbose
uv run pytest tests/test_uploads.py     # 특정 파일

# 코드 검사
uv run ruff check app/                  # 린트
uv run ruff format app/                 # 포맷
```

---

## DB 셋업 (신규 Supabase 프로젝트)

본인 Supabase가 이미 있으면 SKIP. 신규 셋업 시:

1. Supabase 프로젝트 생성 (https://supabase.com)
2. SQL Editor에서 순서대로:
   ```
   sql/01_schema.sql    # 테이블 + 인덱스 + 트리거
   sql/02_rls.sql       # RLS 정책 12개
   ```
3. `.env`에 SUPABASE_URL/키 설정
4. JWKS는 자동 동작 (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`)

---

## 라이선스

(미정 — 학술/데모용)
