-- 업무일지 메모의 "일정일" 컬럼 추가
-- 계약/잔금/약속 스티커를 선택한 메모가 작성일(date)과 다른 날짜에
-- 일정으로 표시될 수 있도록 한다. null이면 작성일과 동일하게 취급한다.
ALTER TABLE public.work_diary
  ADD COLUMN IF NOT EXISTS schedule_date date;

COMMENT ON COLUMN public.work_diary.schedule_date IS '스티커(계약/잔금/약속) 일정일 — null이면 작성일(date)과 동일하게 취급';

CREATE INDEX IF NOT EXISTS idx_work_diary_schedule_date ON public.work_diary (schedule_date);
