-- ============================================================================
-- 06_add_recommendations.sql — analysis_results에 recommendations 컬럼 추가
-- ============================================================================
-- 목적: 약대 자문 반영된 권장사항(5인자별 + 약물 주의사항 + 노인 안내)을
--       분석 결과와 함께 저장. 프론트가 별도 호출 없이 한 번에 받을 수 있게 함.
--
-- 호환성: NULL 허용. 기존 행은 자동으로 NULL로 채워짐.
--         새 분석 응답은 recommendations 포함.
--
-- 적용: Supabase 대시보드 → SQL Editor → 통째로 붙여넣고 Run
-- ============================================================================

ALTER TABLE public.analysis_results
  ADD COLUMN IF NOT EXISTS recommendations jsonb;

COMMENT ON COLUMN public.analysis_results.recommendations IS
  '맞춤 권장사항 (common, metabolic_factors, group_specific, medication_notes, elderly_notes, priority_messages). pipeline.run_recommendations() 결과.';