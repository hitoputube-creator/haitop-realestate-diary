-- =====================================================================
-- Migration: 008_create_crm_attachments
-- Description: CRM customer and work diary attachment metadata + private storage bucket
-- Created: 2026-07-17
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-attachments',
  'crm-attachments',
  false,
  20971520,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/x-hwp',
    'application/haansofthwp',
    'application/x-hwpx'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.crm_attachments (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid         REFERENCES public.customers(id) ON DELETE SET NULL,
  work_diary_id   uuid         REFERENCES public.work_diary(id) ON DELETE SET NULL,
  storage_bucket  text         NOT NULL DEFAULT 'crm-attachments',
  storage_path    text         NOT NULL UNIQUE,
  original_name   text         NOT NULL,
  mime_type       text,
  file_size       bigint,
  description     text,
  uploaded_by     text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT crm_attachments_owner_check
    CHECK (customer_id IS NOT NULL OR work_diary_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_crm_attachments_customer_id
  ON public.crm_attachments (customer_id);

CREATE INDEX IF NOT EXISTS idx_crm_attachments_work_diary_id
  ON public.crm_attachments (work_diary_id);

CREATE INDEX IF NOT EXISTS idx_crm_attachments_created_at
  ON public.crm_attachments (created_at DESC);

ALTER TABLE public.crm_attachments ENABLE ROW LEVEL SECURITY;

-- Customer files are private data. The current public Pages app uses an anon key,
-- so broad anon policies are intentionally not created here.
DROP POLICY IF EXISTS "authenticated_crm_attachments_select" ON public.crm_attachments;
DROP POLICY IF EXISTS "authenticated_crm_attachments_insert" ON public.crm_attachments;
DROP POLICY IF EXISTS "authenticated_crm_attachments_update" ON public.crm_attachments;
DROP POLICY IF EXISTS "authenticated_crm_attachments_delete" ON public.crm_attachments;

CREATE POLICY "authenticated_crm_attachments_select"
  ON public.crm_attachments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_crm_attachments_insert"
  ON public.crm_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_crm_attachments_update"
  ON public.crm_attachments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_crm_attachments_delete"
  ON public.crm_attachments
  FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_crm_attachment_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_crm_attachment_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_crm_attachment_objects_update" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_crm_attachment_objects_delete" ON storage.objects;

CREATE POLICY "authenticated_crm_attachment_objects_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'crm-attachments');

CREATE POLICY "authenticated_crm_attachment_objects_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'crm-attachments');

CREATE POLICY "authenticated_crm_attachment_objects_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'crm-attachments')
  WITH CHECK (bucket_id = 'crm-attachments');

CREATE POLICY "authenticated_crm_attachment_objects_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'crm-attachments');
