-- ============================================================================
-- 01_schema.sql — 테이블 정의
-- ============================================================================
-- 적용: Supabase 대시보드 → SQL Editor → 통째로 붙여넣고 Run
--
-- 설계 기준: 분석 측 "db에_들어갈_데이터_정리.docx" + 검수 흐름 단순화
--
-- 테이블 4개:
--   1. profiles            사용자 추가 정보 (auth.users와 1:1)
--   2. checkup_records     사용자가 OK한 검진 (분석 입력)
--   3. analysis_results    분석 결과 (basic + comprehensive)
--   4. timeseries_analyses 시계열 분석 캐시
--
-- 빠진 것 (의도적):
--   - ocr_uploads          → 이미지 보관 안 함. OCR 결과를 응답으로 한 번 쓰고 버림
--   - prescriptions        → 데모 범위 외, 추후 추가
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 공통 트리거 함수: updated_at 자동 갱신
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────────────────
-- 1. profiles : 사용자 추가 정보 (auth.users와 1:1)
-- ─────────────────────────────────────────────────────────────────────────
-- Supabase Auth가 auth.users를 자동 관리.
-- profiles.id = auth.users.id (FK + PK 동시)
-- 가입 시 트리거로 빈 프로필 자동 생성. 사용자가 추가 정보 채워넣음.
--
-- gender는 분석 측 형식 그대로 (1=남, 2=여, 정수).

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text,
  gender       smallint CHECK (gender IN (1, 2)),
  birth_year   integer CHECK (birth_year BETWEEN 1900 AND 2100),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 가입 시 자동으로 빈 profiles 행 생성
-- (프론트는 가입 직후 PATCH /profiles/me로 추가 정보 채움)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────
-- 2. checkup_records : 검진 수치 (사용자가 OK한 정제된 데이터)
-- ─────────────────────────────────────────────────────────────────────────
-- 분석 측 docx 설계대로 15개 검진 항목 + 2개 생활습관을 컬럼으로 펼침.
-- SQL로 직접 집계 가능 (SELECT AVG(ldl) WHERE exam_year=2024 등),
-- 인덱스 효율 좋음, 검진 항목은 표준이라 거의 안 바뀜.
--
-- 한 사용자, 한 해 한 행. exam_year로 시계열 정렬.

CREATE TABLE IF NOT EXISTS public.checkup_records (
  record_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- 검진 메타
  exam_date        date        NOT NULL,
  exam_year        integer     NOT NULL CHECK (exam_year BETWEEN 2000 AND 2100),
  hospital         text,

  -- 체위 (4)
  height_cm        numeric(5,1) CHECK (height_cm BETWEEN 50 AND 250),
  weight_kg        numeric(5,1) CHECK (weight_kg BETWEEN 20 AND 300),
  bmi              numeric(4,1) CHECK (bmi BETWEEN 10 AND 60),
  waist_cm         numeric(5,1) CHECK (waist_cm BETWEEN 30 AND 200),

  -- 혈압 (2)
  sbp              integer     CHECK (sbp BETWEEN 50 AND 300),
  dbp              integer     CHECK (dbp BETWEEN 30 AND 200),

  -- 혈당 (1)
  fbs              integer     CHECK (fbs BETWEEN 30 AND 600),

  -- 콜레스테롤 (4)
  total_cholesterol integer    CHECK (total_cholesterol BETWEEN 50 AND 600),
  ldl              integer     CHECK (ldl BETWEEN 20 AND 500),
  hdl              integer     CHECK (hdl BETWEEN 10 AND 200),
  tg               integer     CHECK (tg BETWEEN 20 AND 2000),

  -- 간 기능 (3)
  ast              integer     CHECK (ast BETWEEN 1 AND 5000),
  alt              integer     CHECK (alt BETWEEN 1 AND 5000),
  ggt              integer     CHECK (ggt BETWEEN 1 AND 5000),

  -- 기타 (2)
  hb               numeric(4,1) CHECK (hb BETWEEN 3 AND 25),
  creatinine       numeric(4,2) CHECK (creatinine BETWEEN 0.1 AND 20),

  -- 요검사 (1) — 1~6 코드 (음성=1 ~ 4+=6)
  urine_protein    smallint    CHECK (urine_protein BETWEEN 1 AND 6),

  -- 생활습관 (2)
  smoking          smallint    CHECK (smoking IN (1, 2, 3)),  -- 1=non, 2=former, 3=current
  drinking         smallint    CHECK (drinking IN (0, 1)),    -- 0=no, 1=yes

  -- 감사
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- 한 사용자, 한 해 한 행 (덮어쓰기는 UPDATE로)
  UNIQUE (user_id, exam_year)
);

-- 사용자별 시계열 조회 최적화 (시계열 시각화에 핵심)
CREATE INDEX IF NOT EXISTS idx_checkup_records_user_year
  ON public.checkup_records (user_id, exam_year);

DROP TRIGGER IF EXISTS trg_checkup_records_updated_at ON public.checkup_records;
CREATE TRIGGER trg_checkup_records_updated_at
  BEFORE UPDATE ON public.checkup_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- 3. analysis_results : 분석 결과
-- ─────────────────────────────────────────────────────────────────────────
-- 분석 측 docx 설계대로:
--   - JSONB로 통째로 보관 (구조 자주 진화)
--
-- 한 record에 N개 분석 가능 (재분석 이력 보존).

CREATE TABLE IF NOT EXISTS public.analysis_results (
  analysis_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id        uuid        NOT NULL REFERENCES public.checkup_records(record_id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- analyzer 버전 추적 (재분석 시 어떤 로직으로 돌렸는지)
  analyzer_version text        NOT NULL,

  -- 분석 산출물
  basic_report     jsonb       NOT NULL,    -- core/pipeline.run_basic_analysis 결과
  comprehensive    jsonb       NOT NULL,    -- core/pipeline.run_comprehensive_analysis 결과


  analyzed_at      timestamptz NOT NULL DEFAULT now()
);

-- 최신 분석 빠르게
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_analyzed
  ON public.analysis_results (user_id, analyzed_at DESC);

-- 특정 검진의 분석 이력
CREATE INDEX IF NOT EXISTS idx_analysis_results_record_analyzed
  ON public.analysis_results (record_id, analyzed_at DESC);



-- ─────────────────────────────────────────────────────────────────────────
-- 4. timeseries_analyses : 시계열 분석 캐시
-- ─────────────────────────────────────────────────────────────────────────
-- 사용자가 "내 5년치 추세" 누르면 한 번 계산해서 캐시. 재계산 비용 회피.
-- 새 검진 추가되면 기존 캐시 무효화 (라우터에서 처리).

CREATE TABLE IF NOT EXISTS public.timeseries_analyses (
  timeseries_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  year_from        integer     NOT NULL,
  year_to          integer     NOT NULL,
  CHECK (year_to >= year_from),

  timeseries_data  jsonb       NOT NULL,    -- 항목별 추세 (BMI 24.1 → 25.9 등)
  insights         jsonb,                    -- 분석 측 insight_generator 결과

  analyzed_at      timestamptz NOT NULL DEFAULT now(),

  -- 같은 사용자, 같은 구간 캐시는 하나만
  UNIQUE (user_id, year_from, year_to)
);

CREATE INDEX IF NOT EXISTS idx_timeseries_user_analyzed
  ON public.timeseries_analyses (user_id, analyzed_at DESC);
