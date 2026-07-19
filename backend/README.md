# health-service

한국 건강검진 OCR 기반 개인 건강 서비스 — 통합 백엔드.

분석 측 (`pipeline.py`, `thresholds.py` 등) + OCR 측 + Auth/DB가 한 프로세스 안에 흡수된 형태.
**분리 가능성**은 `app/analyzer/_internal/` 격리 규칙으로 보존.

---

## 📂 폴더 구조

```
health-service/
├── app/
│   ├── main.py                         # FastAPI 진입점
│   ├── config.py                       # 환경변수 (턴 2-2에서 추가)
│   ├── auth.py                         # Supabase JWT 검증 (턴 2-2)
│   ├── db.py                           # Supabase 클라이언트 (턴 2-2)
│   │
│   ├── analyzer/                       # ★ 분리 후보
│   │   ├── __init__.py                 # 단순 import 한 줄 (1B)
│   │   └── _internal/                  # ★★ 분리 시 통째로 떼낼 폴더
│   │       ├── __init__.py
│   │       ├── pipeline.py             # 분석 진입점 (dict in/out)
│   │       ├── thresholds.py           # 양방향 임계값
│   │       ├── ocr_adapter.py          # OCR JSON 파싱
│   │       └── health_report.py        # 리포트 생성
│   │
│   ├── ocr/                            # 턴 2-3에서 채움
│   │   ├── service.py                  # LocalOCRService (조립 담당)
│   │   ├── pipeline/                   # OCR 친구 코드 자리
│   │   └── backends/
│   │       └── gemini.py               # 미래용
│   │
│   ├── routers/                        # 라우터 (턴 3 이후)
│   ├── services/                       # 비즈니스 로직 (턴 3 이후)
│   └── schemas/                        # Pydantic 모델 (턴 3 이후)
│
├── tests/
│   └── test_analyzer_isolation.py      # ★ analyzer/_internal/ 격리 자동 검사
│
├── sql/                                # 턴 1 결과물
│   ├── 01_schema.sql
│   ├── 02_rls.sql
│   └── 03_sample_queries.sql
│
├── scripts_for_migration/              # 일회성 마이그레이션 스크립트
│   ├── 01_copy_analyzer.sh             # 분석 코드 복사 + 검증
│   └── 02_copy_ocr.sh                  # (턴 2-3에서)
│
├── pyproject.toml                      # 의존성
├── .gitignore
└── README.md                           # 이 파일
```

---

## 🚀 빠른 시작 (현재 턴 기준)

### 1. 의존성 설치
```bash
# uv 미설치 시
curl -LsSf https://astral.sh/uv/install.sh | sh

cd health-service
uv sync
```

### 2. 분석 코드 이관 (한 번만)
분석 측의 `scripts/` 및 `core/`에서 4개 파일을 옮겨야 한다.
가이드: `scripts_for_migration/01_copy_analyzer.sh` 참조.

### 3. 서버 실행
```bash
uv run uvicorn app.main:app --reload
```

### 4. 테스트
```bash
uv run pytest
```

---

## 🔑 핵심 설계 원칙

### analyzer/_internal/ 격리 규칙

`_internal/` 폴더 안의 코드는 **외부를 import하면 안 된다**. 미래에 분석을
별도 서비스로 분리할 때 폴더만 통째로 떼낼 수 있게 하기 위함.

규칙:
1. `_internal/` 안에선 `from app.*` import 금지 (표준 라이브러리, polars, numpy 등 외부 패키지만)
2. 입출력은 `dict`, `list`, `int`, `str`, `float`, `None` 만 (Pydantic 모델, 사용자 정의 클래스 금지)
3. 외부 상태 의존 금지 (DB 직접 조회, 환경변수 직접 접근 금지 — 함수 인자로만)
4. `_internal/`은 자기만의 의존성을 가짐 (polars, numpy 등)

이 규칙은 `tests/test_analyzer_isolation.py`에서 자동 검사한다.

### 분리 시점 작업
1. `app/analyzer/_internal/` 통째로 새 저장소(`analyzer-service`)에 복사
2. `analyzer-service`에 FastAPI 진입점 30줄 작성
3. `app/analyzer/__init__.py`를 HTTP 호출 함수로 교체 (~30줄)
4. 환경변수 `ANALYZER_SERVICE_URL` 추가
5. 두 서비스 따로 배포

라우터/DB/스키마/OCR 코드는 한 줄도 안 바뀐다.
