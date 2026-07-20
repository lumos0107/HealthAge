-- ============================================================================
-- 08_add_lifestyle_to_profiles.sql — profiles 에 생활습관(문진) 컬럼 추가
-- ============================================================================
-- 목적: 흡연/음주/음주량을 회원가입 시 1회 받아 프로필에 보관하고,
--       검진 분석 때마다 이 값을 자동으로 사용한다(매번 묻지 않음).
--       내정보(계정)에서 언제든 수정 가능.
--
-- 값 표현(프론트/백엔드 lifestyle 키와 동일):
--   smoking          : 'never' | 'former' | 'current' | NULL(미입력)
--   drinking         : 'no' | 'yes' | NULL(미입력)
--   alcohol_weekly_g : 주당 순알코올(g), 숫자 | NULL
--
-- 적용: Supabase 대시보드 → SQL Editor → 붙여넣고 Run
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS smoking text,
  ADD COLUMN IF NOT EXISTS drinking text,
  ADD COLUMN IF NOT EXISTS alcohol_weekly_g numeric;

COMMENT ON COLUMN public.profiles.smoking IS '흡연: never/former/current (문진)';
COMMENT ON COLUMN public.profiles.drinking IS '음주: no/yes (문진)';
COMMENT ON COLUMN public.profiles.alcohol_weekly_g IS '주당 순알코올(g) — MASLD/ALD 판정용';
