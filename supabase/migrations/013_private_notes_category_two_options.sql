-- ================================================================
-- 013_private_notes_category_two_options.sql
-- 개인일지 새 메모 항목을 '개인적인기록' / '업무기록' 두 가지로 단순화.
-- 기존 메모(유튜브/기타/AI공부 등)는 그대로 두고 검증하지 않음(NOT VALID)
-- ================================================================

ALTER TABLE public.private_notes
  DROP CONSTRAINT IF EXISTS private_notes_category_check;

ALTER TABLE public.private_notes
  ADD CONSTRAINT private_notes_category_check
  CHECK (category = ANY (ARRAY['개인적인기록'::text, '업무기록'::text]))
  NOT VALID;
