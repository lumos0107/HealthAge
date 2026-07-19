-- ============================================================================
-- 03_sample_queries.sql — 동작 확인 + 예시 쿼리
-- ============================================================================
-- 적용 순서: 01_schema.sql, 02_rls.sql 다음에 한 블록씩 실행하며 확인.
-- 데이터 삽입 쿼리는 모두 주석 처리. 필요할 때만 활성화.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- A. 스키마 검증
-- ─────────────────────────────────────────────────────────────────────────

-- A-1. 테이블 4개 모두 생성되었는지
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- 기대: analysis_results, checkup_records, profiles, timeseries_analyses


-- A-2. RLS 활성화 여부 (모두 true여야 함)
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;


-- A-3. RLS 정책 목록
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;


-- A-4. 트리거 확인 (updated_at, handle_new_user)
SELECT event_object_table, trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema IN ('public', 'auth')
ORDER BY event_object_table, trigger_name;


-- A-5. 인덱스 확인
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;


-- A-6. checkup_records 컬럼 + CHECK 제약 보기
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'checkup_records'
ORDER BY ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────
-- B. 더미 데이터로 동작 확인 (service_role 키 + Supabase SQL Editor 환경에서만)
-- ─────────────────────────────────────────────────────────────────────────
-- 일반 백엔드 API 흐름 검증은 백엔드 구동 후 수행. 아래는 DB 자체 검증용.

/*
-- B-1. auth.users 더미 생성 (실제로는 Supabase Auth가 만듦)
-- ⚠️  주의: 실서비스에선 Supabase Auth의 signUp을 통해서만 생성. 아래는 SQL 테스트용.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'test1@example.com', 'dummy', now())
ON CONFLICT DO NOTHING;
-- → handle_new_user 트리거가 profiles 자동 생성


-- B-2. 프로필 채우기
UPDATE public.profiles
SET name = '홍길동', gender = 1, birth_year = 1980
WHERE id = '00000000-0000-0000-0000-000000000001';


-- B-3. 검진 한 건 INSERT
INSERT INTO public.checkup_records (
  user_id, exam_date, exam_year,
  height_cm, weight_kg, bmi, waist_cm,
  sbp, dbp, fbs,
  total_cholesterol, ldl, hdl, tg,
  ast, alt, ggt,
  hb, creatinine, urine_protein,
  smoking, drinking
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '2024-03-15', 2024,
  172, 78, 26.4, 88,
  135, 88, 105,
  215, 135, 42, 180,
  35, 48, 72,
  15.2, 1.0, 1,
  3, 1
);


-- B-4. 시계열 시뮬레이션 (같은 유저 다른 연도)
INSERT INTO public.checkup_records (
  user_id, exam_date, exam_year, sbp, dbp, fbs, bmi
) VALUES
  ('00000000-0000-0000-0000-000000000001', '2022-03-10', 2022, 128, 82, 95, 25.1),
  ('00000000-0000-0000-0000-000000000001', '2023-03-12', 2023, 132, 85, 100, 25.7);


-- B-5. 시계열 조회 (분석 쪽이 시계열 분석할 때 받는 데이터)
SELECT exam_year, sbp, dbp, fbs, bmi, ldl
FROM public.checkup_records
WHERE user_id = '00000000-0000-0000-0000-000000000001'
ORDER BY exam_year;


-- B-6. 분석 결과 INSERT
INSERT INTO public.analysis_results (
  record_id, user_id, analyzer_version,
  basic_report, comprehensive,
  risk_score, overall_status, risk_count, warning_count, normal_count
)
SELECT
  record_id,
  user_id,
  '0.1.0',
  '{"placeholder": "basic"}'::jsonb,
  '{"placeholder": "comprehensive"}'::jsonb,
  5, '주의 필요', 0, 4, 11
FROM public.checkup_records
WHERE user_id = '00000000-0000-0000-0000-000000000001'
  AND exam_year = 2024
LIMIT 1;


-- B-7. 최신 분석 조회 패턴 (검진 + 분석 JOIN)
SELECT
  c.exam_year,
  c.sbp,
  c.dbp,
  a.risk_score,
  a.overall_status,
  a.analyzed_at
FROM public.checkup_records c
LEFT JOIN LATERAL (
  SELECT risk_score, overall_status, analyzed_at
  FROM public.analysis_results
  WHERE record_id = c.record_id
  ORDER BY analyzed_at DESC
  LIMIT 1
) a ON true
WHERE c.user_id = '00000000-0000-0000-0000-000000000001'
ORDER BY c.exam_year DESC;


-- B-8. JSONB 안쪽 접근 예시
SELECT
  analyzed_at,
  basic_report -> 'summary' AS summary,
  comprehensive -> 'summary' ->> 'overall_status' AS overall_status
FROM public.analysis_results
WHERE user_id = '00000000-0000-0000-0000-000000000001'
ORDER BY analyzed_at DESC
LIMIT 1;


-- B-9. 정리
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
-- → CASCADE로 profiles, checkup_records, analysis_results, timeseries 다 삭제됨
*/


-- ─────────────────────────────────────────────────────────────────────────
-- C. 운영 중 자주 쓸 쿼리 (참고)
-- ─────────────────────────────────────────────────────────────────────────

-- C-1. 내 검진 목록 (시계열 시각화용)
-- backend: client.table("checkup_records").select("*").eq("user_id", uid).order("exam_year")

-- C-2. 특정 검진의 최신 분석
-- backend: 위 B-7과 같은 LATERAL JOIN 또는 두 번의 쿼리

-- C-3. 시계열 캐시 조회 / 생성
-- backend:
--   client.table("timeseries_analyses").select("*").eq("user_id", uid)
--         .eq("year_from", 2020).eq("year_to", 2024).maybe_single()
--   없으면 새로 계산해서 upsert
