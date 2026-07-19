-- ============================================================================
-- 05_medication.sql — medication_records 테이블 + RLS
-- ============================================================================
-- 목적: HIRA '내가 먹는 약! 한눈에' 엑셀 업로드 → 파싱된 투약이력 저장.
--       향후 영양제 추천 엔진의 입력 데이터로 사용 (ingredient_en 매칭 키).
--
-- 적용 순서: 01_schema.sql → 02_rls.sql → 04_add_birth_md.sql → 05_medication.sql
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────
-- 1. medication_records : 투약이력 (HIRA 엑셀 한 행 = 한 레코드)
-- ──────────────────────────────────────────────────────────────────
-- HIRA가 제공하는 필드는 다양하지만, 추천 엔진이 실제로 쓰는 건 ingredient_en.
-- 나머지는 사용자 표시(history view)용으로 보존.

CREATE TABLE IF NOT EXISTS public.medication_records (
  medication_id    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- 조제 정보
  dispensed_date   char(8),                  -- YYYYMMDD (HIRA 원본 그대로)
  product_name     text         NOT NULL,    -- 제품명
  efficacy_class   text,                     -- 약효분류 (효능 표시용)
  ingredient_en    text,                     -- 성분명(영문) — 추천 엔진 매칭 키
  drug_code        text,                     -- 약품코드

  -- 처방/조제 기관
  prescriber       text,                     -- 처방기관
  dispenser        text,                     -- 조제기관

  -- 투약량
  unit             text,                     -- 단위 (정/캡슐/mL 등)
  dose_per_time    text,                     -- 1회 투약량
  times_per_day    integer      CHECK (times_per_day IS NULL OR times_per_day > 0),
  total_days       integer      CHECK (total_days IS NULL OR total_days > 0),

  -- 안전성 정보
  safety_alert     text,                     -- 안전성 서한(속보)
  antithrombotic   text,                     -- 항혈전제 여부

  -- 감사
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_medrec_user
  ON public.medication_records (user_id);

CREATE INDEX IF NOT EXISTS idx_medrec_user_date
  ON public.medication_records (user_id, dispensed_date DESC);

-- 추천 엔진이 성분명으로 매칭할 때 사용
CREATE INDEX IF NOT EXISTS idx_medrec_ingredient
  ON public.medication_records (ingredient_en)
  WHERE ingredient_en IS NOT NULL;

-- updated_at 자동 갱신 트리거 (기존 set_updated_at 함수 재사용)
DROP TRIGGER IF EXISTS trg_medication_records_updated_at ON public.medication_records;
CREATE TRIGGER trg_medication_records_updated_at
  BEFORE UPDATE ON public.medication_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ──────────────────────────────────────────────────────────────────
-- 2. RLS — 본인 데이터만 접근
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.medication_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medication_records_select_own ON public.medication_records;
CREATE POLICY medication_records_