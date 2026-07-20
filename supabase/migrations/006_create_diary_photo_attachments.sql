-- =====================================================================
-- Migration: 006_create_diary_photo_attachments
-- Description: Public work diary photo attachments using crm_attachments
-- Created: 2026-07-20
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-attachments',
  'crm-attachments',
  true,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.crm_attachments (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid,
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

ALTER TABLE public.crm_attachments
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS work_diary_id uuid REFERENCES public.work_diary(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'crm-attachments',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS uploaded_by text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_attachments_storage_path_unique
  ON public.crm_attachments (storage_path);

CREATE INDEX IF NOT EXISTS idx_crm_attachments_work_diary_id
  ON public.crm_attachments (work_diary_id);

CREATE INDEX IF NOT EXISTS idx_crm_attachments_created_at
  ON public.crm_attachments (created_at DESC);

ALTER TABLE public.crm_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_diary_photos_select" ON public.crm_attachments;
DROP POLICY IF EXISTS "public_diary_photos_insert" ON public.crm_attachments;

CREATE POLICY "public_diary_photos_select"
  ON public.crm_attachments
  FOR SELECT
  TO anon, authenticated
  USING (storage_bucket = 'crm-attachments');

CREATE POLICY "public_diary_photos_insert"
  ON public.crm_attachments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    storage_bucket = 'crm-attachments'
    AND work_diary_id IS NOT NULL
    AND storage_path LIKE 'work-diary/%'
    AND mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  );

DROP POLICY IF EXISTS "public_diary_photo_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "public_diary_photo_objects_select" ON storage.objects;

CREATE POLICY "public_diary_photo_objects_select"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'crm-attachments');

CREATE POLICY "public_diary_photo_objects_insert"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'crm-attachments'
    AND name LIKE 'work-diary/%'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );
