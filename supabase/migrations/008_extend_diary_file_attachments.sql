-- =====================================================================
-- Migration: 008_extend_diary_file_attachments
-- Description: Allow general document/archive file attachments (PDF,
--   HWP/HWPX, Office docs, TXT, ZIP/7Z) on top of the existing
--   image-only work diary photo attachments. Reuses the crm-attachments
--   bucket and crm_attachments table; does not remove any existing
--   image support or data.
-- Created: 2026-07-27
-- =====================================================================

UPDATE storage.buckets
SET
  file_size_limit = 52428800, -- 50MB
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/x-hwp',
    'application/haansofthwpx',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip',
    'application/x-7z-compressed'
  ]
WHERE id = 'crm-attachments';

DROP POLICY IF EXISTS "public_diary_photos_insert" ON public.crm_attachments;
DROP POLICY IF EXISTS "public_diary_attachments_insert" ON public.crm_attachments;

CREATE POLICY "public_diary_attachments_insert"
  ON public.crm_attachments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    storage_bucket = 'crm-attachments'
    AND work_diary_id IS NOT NULL
    AND storage_path LIKE 'work-diary/%'
    AND mime_type IN (
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/x-hwp',
      'application/haansofthwpx',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/zip',
      'application/x-7z-compressed'
    )
  );

DROP POLICY IF EXISTS "public_diary_photo_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "public_diary_attachment_objects_insert" ON storage.objects;

CREATE POLICY "public_diary_attachment_objects_insert"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'crm-attachments'
    AND name LIKE 'work-diary/%'
    AND lower(storage.extension(name)) IN (
      'jpg', 'jpeg', 'png', 'webp',
      'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'csv',
      'ppt', 'pptx', 'txt', 'zip', '7z'
    )
  );
