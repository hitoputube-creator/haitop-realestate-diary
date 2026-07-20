-- =====================================================================
-- Migration: 007_fix_diary_photo_delete
-- Description: Allow diary memo deletion when crm_attachments rows exist
-- Created: 2026-07-20
-- =====================================================================

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname
    INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.crm_attachments'::regclass
    AND confrelid = 'public.work_diary'::regclass
    AND contype = 'f'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.crm_attachments DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.crm_attachments
    ADD CONSTRAINT crm_attachments_work_diary_id_fkey
    FOREIGN KEY (work_diary_id)
    REFERENCES public.work_diary(id)
    ON DELETE CASCADE;
END $$;
