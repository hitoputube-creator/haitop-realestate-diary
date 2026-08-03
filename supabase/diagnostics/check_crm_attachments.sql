-- Read-only diagnostics for crm-attachments.
-- Run one SELECT block at a time in Supabase SQL Editor.
-- Do not share result rows publicly if they contain internal IDs.
-- If the first query shows a table as null, skip later queries that read that table.

-- 0. Required table existence check
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
select
  to_regclass('storage.buckets') as storage_buckets_table,
  to_regclass('storage.objects') as storage_objects_table,
  to_regclass('public.crm_attachments') as crm_attachments_table,
  to_regclass('public.work_diary') as work_diary_table,
  to_regclass('supabase_migrations.schema_migrations') as migration_table;

-- 1. Bucket 상태
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- storage.buckets_table이 null이면 이 쿼리를 건너뛰세요.
select
  to_jsonb(b)->>'id' as id,
  to_jsonb(b)->>'name' as name,
  (to_jsonb(b)->>'public')::boolean as public,
  nullif(to_jsonb(b)->>'file_size_limit', '')::bigint as file_size_limit
from storage.buckets b
where to_jsonb(b)->>'id' = 'crm-attachments';

-- 2. Bucket MIME 설정
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- storage.buckets_table이 null이면 이 쿼리를 건너뛰세요.
select
  to_jsonb(b)->>'id' as id,
  to_jsonb(b)->'allowed_mime_types' as allowed_mime_types,
  coalesce(to_jsonb(b)->'allowed_mime_types', '[]'::jsonb) ? 'image/heic' as allows_image_heic,
  coalesce(to_jsonb(b)->'allowed_mime_types', '[]'::jsonb) ? 'image/heif' as allows_image_heif,
  coalesce(to_jsonb(b)->'allowed_mime_types', '[]'::jsonb) ? 'image/jpeg' as allows_image_jpeg,
  coalesce(to_jsonb(b)->'allowed_mime_types', '[]'::jsonb) ? 'image/png' as allows_image_png,
  coalesce(to_jsonb(b)->'allowed_mime_types', '[]'::jsonb) ? 'image/webp' as allows_image_webp,
  coalesce(to_jsonb(b)->'allowed_mime_types', '[]'::jsonb) ? 'application/pdf' as allows_pdf
from storage.buckets b
where to_jsonb(b)->>'id' = 'crm-attachments';

-- 3. Storage 정책
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- storage.objects_table이 null이면 이 쿼리를 건너뛰세요.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    qual ilike '%crm-attachments%'
    or with_check ilike '%crm-attachments%'
  )
order by policyname;

-- 4. crm_attachments 테이블 정책
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- crm_attachments_table이 null이면 이 쿼리를 건너뛰세요.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'crm_attachments'
order by policyname;

-- 5. 비정상 storage_path
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- crm_attachments_table이 null이면 이 쿼리를 건너뛰세요.
-- original_name은 출력하지 않습니다.
select
  to_jsonb(a)->>'id' as id,
  to_jsonb(a)->>'work_diary_id' as work_diary_id,
  to_jsonb(a)->>'customer_id' as customer_id,
  to_jsonb(a)->>'storage_bucket' as storage_bucket,
  to_jsonb(a)->>'mime_type' as mime_type,
  length(coalesce(to_jsonb(a)->>'storage_path', '')) as storage_path_length,
  to_jsonb(a)->>'storage_path' is null or to_jsonb(a)->>'storage_path' = '' as missing_storage_path,
  to_jsonb(a)->>'storage_path' ilike 'http%' as looks_like_http_url,
  to_jsonb(a)->>'storage_path' ilike 'blob:%' as looks_like_blob_url,
  to_jsonb(a)->>'storage_path' ilike 'data:%' as looks_like_data_url,
  to_jsonb(a)->>'created_at' as created_at
from public.crm_attachments a
where to_jsonb(a)->>'storage_path' is null
   or to_jsonb(a)->>'storage_path' = ''
   or to_jsonb(a)->>'storage_path' ilike 'http%'
   or to_jsonb(a)->>'storage_path' ilike 'blob:%'
   or to_jsonb(a)->>'storage_path' ilike 'data:%'
order by to_jsonb(a)->>'created_at' desc
limit 100;

-- 6. orphan attachment
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- crm_attachments_table 또는 work_diary_table이 null이면 이 쿼리를 건너뛰세요.
-- original_name과 storage_path 원문은 출력하지 않습니다.
select
  to_jsonb(a)->>'id' as id,
  to_jsonb(a)->>'work_diary_id' as work_diary_id,
  to_jsonb(a)->>'customer_id' as customer_id,
  to_jsonb(a)->>'storage_bucket' as storage_bucket,
  to_jsonb(a)->>'mime_type' as mime_type,
  length(coalesce(to_jsonb(a)->>'storage_path', '')) as storage_path_length,
  to_jsonb(a)->>'created_at' as created_at
from public.crm_attachments a
left join public.work_diary w on to_jsonb(w)->>'id' = to_jsonb(a)->>'work_diary_id'
where to_jsonb(a)->>'work_diary_id' is not null
  and to_jsonb(w)->>'id' is null
order by to_jsonb(a)->>'created_at' desc
limit 100;

-- 7. MIME별 첨부파일 통계
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- crm_attachments_table이 null이면 이 쿼리를 건너뛰세요.
-- original_name과 storage_path 원문은 출력하지 않습니다.
select
  to_jsonb(a)->>'storage_bucket' as storage_bucket,
  to_jsonb(a)->>'mime_type' as mime_type,
  count(*) as row_count,
  count(*) filter (where to_jsonb(a)->>'storage_path' is null or to_jsonb(a)->>'storage_path' = '') as missing_storage_path_count,
  count(*) filter (
    where to_jsonb(a)->>'storage_path' ilike 'http%'
       or to_jsonb(a)->>'storage_path' ilike 'blob:%'
       or to_jsonb(a)->>'storage_path' ilike 'data:%'
  ) as url_like_storage_path_count,
  min(to_jsonb(a)->>'created_at') as first_created_at,
  max(to_jsonb(a)->>'created_at') as last_created_at
from public.crm_attachments a
group by to_jsonb(a)->>'storage_bucket', to_jsonb(a)->>'mime_type'
order by row_count desc, storage_bucket, mime_type;

-- 8. 마이그레이션 테이블 컬럼 확인
-- 아래 쿼리만 선택한 뒤 Run을 누르세요.
-- migration_table이 null이면 이 쿼리를 건너뛰세요.
-- Supabase 환경마다 schema_migrations 컬럼이 다를 수 있으므로 컬럼 목록만 확인합니다.
select
  column_name,
  data_type,
  ordinal_position
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;
