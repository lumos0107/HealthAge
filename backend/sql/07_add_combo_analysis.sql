-- ============================================================================
-- 07_add_combo_analysis.sql — analysis_results에 combo_analysis 컬럼 추가
-- ============================================================================
-- 목적: 조합 그룹(복합 질환군) 판정 결과와 지방간 유형(MASLD/ALD)을
--       분석 결과와 함께 저장. 이력 조회(GET /reports/...)에서도 보이게 함.
--
--       발표에 쓰는 모집단 수치(예: 메타볼릭 트라이어드 O/E=2.93)를
--       실제 사용자 결과와 연결하는 것이 이 컬럼의 존재 이유다.
--
-- 호환성: NULL 허용. 기존 행은 자동으로 NULL로 채워짐.
--         과거 분석은 combo_analysis 없이 저장돼 있으므로 프론트는
--         값이 없을 때(구버전 분석)를 반드시 처리해야 한다.
--
-- 적용: Supabase 대시보드 → SQL Editor → 통째로 붙여넣고 Run
-- 적용 순서: 01 → 02 → 04 → 05 → 06 → 07
-- ============================================================================

ALTER TABLE public.analysis_results
  ADD COLUMN IF NOT EXISTS combo_analysis jsonb;

COMMENT ON COLUMN public.analysis_results.combo_analysis IS
  '조합 그룹 판정 + 모집단 O/E 통계 + 지방간 유형(MASLD/ALD/MetALD). analyzer/_internal/combo_group_analysis.run_combo_analysis() 결과.';
