-- 메모에 이름/연락처/제목 구조화 필드 추가 (모두 nullable — 과거 데이터 호환)
ALTER TABLE public.work_diary
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text;

CREATE INDEX IF NOT EXISTS idx_work_diary_customer_phone ON public.work_diary (customer_phone);
