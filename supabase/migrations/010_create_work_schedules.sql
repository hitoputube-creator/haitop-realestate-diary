-- =====================================================================
-- Migration: 010_create_work_schedules
-- Description: 업무일지 오른쪽 패널용 날짜별 일정 테이블
-- 기존 work_diary 메모 데이터와 분리해서 저장한다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.work_schedules (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_date  date         NOT NULL,
  schedule_time  time         NULL,
  title          text         NOT NULL CHECK (length(trim(title)) > 0),
  memo           text         NULL,
  is_completed   boolean      NOT NULL DEFAULT false,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_schedules_date
  ON public.work_schedules (schedule_date);

CREATE INDEX IF NOT EXISTS idx_work_schedules_date_completed_time
  ON public.work_schedules (schedule_date, is_completed, schedule_time);

DROP TRIGGER IF EXISTS trg_work_schedules_updated_at ON public.work_schedules;
CREATE TRIGGER trg_work_schedules_updated_at
  BEFORE UPDATE ON public.work_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

-- 운영 정책은 프로젝트의 실제 인증/테넌트 기준에 맞춰 별도로 적용한다.
-- 현재 저장소의 기존 업무일지 테이블은 anon/authenticated CRUD를 허용하지만,
-- 새 테이블에 동일 정책을 추가하는 것은 운영 보안 결정이므로 이 migration에는 포함하지 않는다.
