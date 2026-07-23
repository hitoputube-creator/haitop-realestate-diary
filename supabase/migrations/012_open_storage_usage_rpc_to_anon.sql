-- ============================================================
-- 저장공간 관리 페이지의 이중 로그인 제거에 따른 RPC 권한 완화
--
-- 배경: StorageAdmin 화면이 별도의 Supabase Auth 이메일/비밀번호 로그인으로
--   보호되어 있었으나, 사이트 전체를 감싸는 게이트(AuthGate, sessionStorage
--   비밀번호)만으로 접근을 통일하기로 함. 이 저장소의 다른 모든 테이블
--   (work_diary, private_notes, diary_photo_attachments 등)이 이미 anon에게
--   전면 개방되어 있어 보안 모델이 "게이트 비밀번호 하나"로 일관되어 있으므로,
--   이 RPC 두 개만 authenticated 전용으로 남겨둘 이유가 없다.
--
-- 변경: is_admin() 체크를 제거하고 EXECUTE 권한을 anon에도 부여한다.
--   admin_users 테이블과 is_admin() 함수 자체는 더 이상 쓰이지 않지만,
--   당장 다른 용도로 재사용될 수 있어 삭제하지 않고 남겨둔다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_storage_usage()
RETURNS TABLE (
  bucket_id   text,
  file_count  bigint,
  total_bytes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS bucket_id,
    COUNT(o.id) AS file_count,
    COALESCE(
      SUM(
        CASE
          WHEN o.metadata->>'size' ~ '^[0-9]+$'
            THEN (o.metadata->>'size')::numeric
          ELSE 0::numeric
        END
      ),
      0::numeric
    )::bigint AS total_bytes
  FROM storage.buckets b
  LEFT JOIN storage.objects o ON o.bucket_id = b.id
  GROUP BY b.id
  ORDER BY b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_storage_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storage_usage() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_db_table_sizes()
RETURNS TABLE (
  table_name  text,
  total_bytes bigint,
  pretty_size text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.relname::text AS table_name,
    pg_catalog.pg_total_relation_size(c.oid) AS total_bytes,
    pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) AS pretty_size
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'  -- 일반 테이블만. 인덱스/뷰/구체화뷰/시퀀스/파티션부모('p') 등은 제외
  ORDER BY total_bytes DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_db_table_sizes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_table_sizes() TO anon, authenticated;
