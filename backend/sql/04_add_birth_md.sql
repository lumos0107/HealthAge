-- ============================================================================
-- 04_add_birth_md.sql — profiles에 birth_md (MMDD) 컬럼 추가
-- ============================================================================
-- 목적: HIRA 개인투약이력 엑셀의 생일-암호(YYYYMMDD) 자동 생성.
--       기존 birth_year (YYYY)와 결합하여 8자리 암호 구성.
--
-- 적용: Supabase 대시보드 → SQL Editor에 통째로 붙여넣고 Run
--
-- 참고: birth_md는 0101~1231 범위의 4자리 정수.
--       기존 birth_year는 그대로 유지 (분석 모듈 호환성).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_md smallint
  CHECK (birth_md IS NULL OR (birth_md BETWEEN 101 AND 1231));

-- 0101~0931, 1001~1231 형태 (월 01~12, 일 01~31) 강제는 안 함.
-- 어차피 HIRA 암호는 사용자가 알고 있는 본인 생일이므로,
-- 잘못 입력하면 복호화 단계에서 PasswordError로 잡힘.

COMMENT ON COLUMN public.profiles.birth_md IS
  'MMDD 형식의 생월일 (예: 3월 5일 → 305). birth_year와 결합하여 HIRA 암호(YYYYMMDD) 생성.';