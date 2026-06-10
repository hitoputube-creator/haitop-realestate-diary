-- ================================================================
-- 005_private_notes_no_auth.sql
-- 개인메모: 인증 제거 + 작성자(writer_name) 기반 분리 접근
-- ================================================================

-- 1. user_id를 nullable로 변경 (인증 없이 insert 가능하도록)
ALTER TABLE public.private_notes
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. 기존 auth 기반 RLS 정책 제거
DROP POLICY IF EXISTS private_notes_select ON public.private_notes;
DROP POLICY IF EXISTS private_notes_insert ON public.private_notes;
DROP POLICY IF EXISTS private_notes_update ON public.private_notes;
DROP POLICY IF EXISTS private_notes_delete ON public.private_notes;

-- 3. anon/authenticated 모두 허용하는 정책 추가
--    (writer_name 구분은 앱 레벨에서 처리)
CREATE POLICY "private_notes_open_select" ON public.private_notes
  FOR SELECT USING (true);

CREATE POLICY "private_notes_open_insert" ON public.private_notes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "private_notes_open_update" ON public.private_notes
  FOR UPDATE USING (true);

CREATE POLICY "private_notes_open_delete" ON public.private_notes
  FOR DELETE USING (true);
