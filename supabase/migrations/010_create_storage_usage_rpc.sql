-- ============================================================
-- 저장공간/DB 용량 관리자 조회 RPC
--
-- 사전 확인 (Supabase MCP execute_sql로 직접 조회, xaxbkdnrzsghsabkdvzj):
--   select id, email, created_at from auth.users where email = 'hh720403@gmail.com';
--   → id: 894aca91-4f57-47a7-8f9e-08cabbcf1831
--   → email: hh720403@gmail.com
--   → created_at: 2026-05-29 04:53:03+00
-- 관리자 등록은 이메일 문자열 비교가 아니라 위에서 확인한 UUID를 직접 지정한다.
-- ============================================================

-- 1) 관리자 판별 테이블
CREATE TABLE public.admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
-- 의도적으로 SELECT/INSERT/UPDATE/DELETE 정책을 하나도 만들지 않는다.
-- anon/authenticated 어떤 역할도 이 테이블을 직접 조회·수정할 수 없고,
-- 오직 아래 is_admin() 같은 SECURITY DEFINER 함수 내부에서만 조회된다.

INSERT INTO public.admin_users (user_id)
VALUES ('894aca91-4f57-47a7-8f9e-08cabbcf1831'); -- hh720403@gmail.com (확인된 UUID)

-- 2) 관리자 판별 함수
CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 3) 저장공간 사용량 RPC
--    버킷별 파일 개수·총용량만 반환한다. 파일명·경로는 어떤 필드로도 내보내지 않는다.
--    metadata->>'size'가 NULL이거나 숫자가 아닌 문자열이어도 캐스팅 오류 없이 0으로 처리한다.
CREATE FUNCTION public.get_storage_usage()
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin privilege required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS bucket_id,
    COUNT(o.id) AS file_count,
    COALESCE(
      SUM(
        CASE
          WHEN o.metadata->>'size' ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint
          ELSE 0
        END
      ),
      0
    ) AS total_bytes
  FROM storage.buckets b
  LEFT JOIN storage.objects o ON o.bucket_id = b.id
  GROUP BY b.id
  ORDER BY b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_storage_usage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_storage_usage() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_storage_usage() TO authenticated;

-- 4) DB 테이블 용량 RPC
--    public 스키마의 "일반 테이블(r)"만 대상으로 한다.
--    인덱스('i')·뷰('v')·구체화 뷰('m')·시퀀스('S') 등은 relkind 조건에서 제외되므로
--    별도로 더하지 않는 한 중복 집계되지 않는다.
--    (pg_total_relation_size(oid)는 해당 테이블 하나의 힙+인덱스+TOAST를 합산한 값이며,
--     인덱스를 relkind='i'로 따로 순회해 다시 더하지 않기 때문에 이중 계산이 없다.)
CREATE FUNCTION public.get_db_table_sizes()
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin privilege required' USING ERRCODE = '42501';
  END IF;

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
REVOKE ALL ON FUNCTION public.get_db_table_sizes() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_db_table_sizes() TO authenticated;
