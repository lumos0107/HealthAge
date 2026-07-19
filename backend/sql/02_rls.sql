-- ============================================================================
-- 02_rls.sql — Row Level Security
-- ============================================================================
-- 원칙: 사용자는 본인 데이터에만 접근.
--       service_role 키는 RLS를 우회하므로 백엔드 내부 작업엔 그대로 사용 가능.
--
-- 적용 순서: 01_schema.sql 다음에 실행.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 1. profiles
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- INSERT는 트리거가 service_role로 처리하므로 일반 정책 불필요.
-- 직접 INSERT가 필요하면 다음을 활성화:
-- CREATE POLICY profiles_insert_own ON public.profiles
--   FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. checkup_records
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.checkup_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checkup_records_select_own ON public.checkup_records;
CREATE POLICY checkup_records_select_own ON public.checkup_records
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS checkup_records_insert_own ON public.checkup_records;
CREATE POLICY checkup_records_insert_own ON public.checkup_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS checkup_records_update_own ON public.checkup_records;
CREATE POLICY checkup_records_update_own ON public.checkup_records
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS checkup_records_delete_own ON public.checkup_records;
CREATE POLICY checkup_records_delete_own ON public.checkup_records
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 3. analysis_results
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analysis_results_select_own ON public.analysis_results;
CREATE POLICY analysis_results_select_own ON public.analysis_results
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS analysis_results_insert_own ON public.analysis_results;
CREATE POLICY analysis_results_insert_own ON public.analysis_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 의도적으로 UPDATE/DELETE 정책 없음 — 분석 이력은 불변 보존.
-- 잘못된 분석 삭제하려면 service_role로 처리.


-- ─────────────────────────────────────────────────────────────────────────
-- 4. timeseries_analyses
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.timeseries_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timeseries_select_own ON public.timeseries_analyses;
CREATE POLICY timeseries_select_own ON public.timeseries_analyses
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS timeseries_insert_own ON public.timeseries_analyses;
CREATE POLICY timeseries_insert_own ON public.timeseries_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 캐시는 UPSERT 패턴이므로 UPDATE 허용
DROP POLICY IF EXISTS timeseries_update_own ON public.timeseries_analyses;
CREATE POLICY timeseries_update_own ON public.timeseries_analyses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS timeseries_delete_own ON public.timeseries_analyses;
CREATE POLICY timeseries_delete_own ON public.timeseries_analyses
  FOR DELETE USING (auth.uid() = user_id);
