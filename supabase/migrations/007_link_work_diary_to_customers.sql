-- =====================================================================
-- Migration: 007_link_work_diary_to_customers
-- Description: 업무일지(work_diary)와 고객(customers) 연결 컬럼 추가
-- Created: 2026-07-17
-- =====================================================================

ALTER TABLE public.work_diary
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT '일반메모',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT '일반',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'work_diary_customer_id_fkey'
      AND conrelid = 'public.work_diary'::regclass
  ) THEN
    ALTER TABLE public.work_diary
      ADD CONSTRAINT work_diary_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES public.customers(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_work_diary_customer_id
  ON public.work_diary (customer_id);

CREATE INDEX IF NOT EXISTS idx_work_diary_record_type
  ON public.work_diary (record_type);

CREATE INDEX IF NOT EXISTS idx_work_diary_scheduled_at
  ON public.work_diary (scheduled_at);

CREATE INDEX IF NOT EXISTS idx_work_diary_customer_id_date
  ON public.work_diary (customer_id, date);

CREATE INDEX IF NOT EXISTS idx_work_diary_customer_id_created_at
  ON public.work_diary (customer_id, created_at);
