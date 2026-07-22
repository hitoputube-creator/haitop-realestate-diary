-- =====================================================================
-- Migration: 010_create_storage_usage_rpc
-- Description: Storage and database usage summary for the Hitop admin UI
-- Created: 2026-07-22
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_hitop_storage_usage()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
WITH tracked_buckets(bucket_id, label) AS (
  VALUES
    ('crm-attachments', '업무일지 사진'),
    ('listing-images', '매물관리 사진')
),
storage_objects AS (
  SELECT
    o.bucket_id,
    o.name,
    o.created_at,
    CASE
      WHEN o.metadata ? 'size' AND (o.metadata->>'size') ~ '^[0-9]+$'
        THEN (o.metadata->>'size')::bigint
      ELSE 0
    END AS size_bytes
  FROM storage.objects o
  WHERE o.bucket_id IN (SELECT bucket_id FROM tracked_buckets)
),
bucket_usage AS (
  SELECT
    b.bucket_id,
    b.label,
    COALESCE(COUNT(o.name), 0)::bigint AS file_count,
    COALESCE(SUM(o.size_bytes), 0)::bigint AS total_bytes,
    MAX(o.created_at) AS last_uploaded_at
  FROM tracked_buckets b
  LEFT JOIN storage_objects o ON o.bucket_id = b.bucket_id
  GROUP BY b.bucket_id, b.label
),
table_usage AS (
  SELECT
    relname AS table_name,
    pg_total_relation_size(relid)::bigint AS total_bytes
  FROM pg_catalog.pg_statio_user_tables
  WHERE schemaname = 'public'
),
large_files AS (
  SELECT bucket_id, name, size_bytes, created_at
  FROM storage_objects
  ORDER BY size_bytes DESC, created_at DESC NULLS LAST
  LIMIT 20
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'storage', jsonb_build_object(
    'total_bytes', COALESCE((SELECT SUM(total_bytes) FROM bucket_usage), 0),
    'total_file_count', COALESCE((SELECT SUM(file_count) FROM bucket_usage), 0),
    'buckets', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket_id', bucket_id,
          'label', label,
          'file_count', file_count,
          'total_bytes', total_bytes,
          'last_uploaded_at', last_uploaded_at
        )
        ORDER BY total_bytes DESC
      )
      FROM bucket_usage
    ), '[]'::jsonb),
    'large_files', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket_id', bucket_id,
          'name', name,
          'size_bytes', size_bytes,
          'created_at', created_at
        )
        ORDER BY size_bytes DESC, created_at DESC NULLS LAST
      )
      FROM large_files
    ), '[]'::jsonb)
  ),
  'database', jsonb_build_object(
    'total_bytes', pg_database_size(current_database())::bigint,
    'tables', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'table_name', table_name,
          'total_bytes', total_bytes
        )
        ORDER BY total_bytes DESC
      )
      FROM table_usage
    ), '[]'::jsonb)
  )
);
$$;

COMMENT ON FUNCTION public.get_hitop_storage_usage()
IS 'Returns storage bucket, large file, and database size usage for the Hitop admin storage dashboard.';

REVOKE ALL ON FUNCTION public.get_hitop_storage_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hitop_storage_usage() TO anon, authenticated;
