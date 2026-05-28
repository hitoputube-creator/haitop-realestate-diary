-- 업무일지 스티커 컬럼 추가
ALTER TABLE public.work_diary
  ADD COLUMN IF NOT EXISTS sticker text
  CHECK (sticker IS NULL OR sticker = ANY (ARRAY['계약','잔금','약속','내부','기타']));

COMMENT ON COLUMN public.work_diary.sticker IS '메모 스티커: 계약|잔금|약속|내부|기타|null';
