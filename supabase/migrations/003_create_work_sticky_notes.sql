-- =====================================================================
-- Migration: 003_create_work_sticky_notes (v3 — 2026-06-09)
-- Description: 진행중 포스트잇 — 업무일지 메모 id 기반 고정 기능
-- work_diary.id 타입: uuid (001 마이그레이션 기준)
-- ※ DROP 없이 IF NOT EXISTS로 안전하게 생성
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.work_sticky_notes (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id    uuid         NOT NULL,
  status      text         NOT NULL DEFAULT 'active',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_sticky_notes_diary_id
  ON public.work_sticky_notes (diary_id);

CREATE INDEX IF NOT EXISTS idx_work_sticky_notes_status
  ON public.work_sticky_notes (status);

-- updated_at 트리거 (001의 set_updated_at 함수 재사용)
DROP TRIGGER IF EXISTS trg_wsn_updated_at ON public.work_sticky_notes;
CREATE TRIGGER trg_wsn_updated_at
  BEFORE UPDATE ON public.work_sticky_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.work_sticky_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_allow_all_select" ON public.work_sticky_notes;
DROP POLICY IF EXISTS "dev_allow_all_insert" ON public.work_sticky_notes;
DROP POLICY IF EXISTS "dev_allow_all_update" ON public.work_sticky_notes;
DROP POLICY IF EXISTS "dev_allow_all_delete" ON public.work_sticky_notes;

CREATE POLICY "dev_allow_all_select"
  ON public.work_sticky_notes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dev_allow_all_insert"
  ON public.work_sticky_notes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "dev_allow_all_update"
  ON public.work_sticky_notes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_allow_all_delete"
  ON public.work_sticky_notes FOR DELETE TO anon, authenticated USING (true);
