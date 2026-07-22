-- ============================================================
-- 010_create_storage_usage_rpc.sql 적용 후 발견된 버그 수정
--
-- 증상: get_storage_usage() 관리자 호출 시
--   ERROR: 42804: structure of query does not match function result type
--   DETAIL: Returned type numeric does not match expected type bigint in column 3.
--
-- 원인: PostgreSQL에서 SUM(bigint 표현식)의 반환 타입은 bigint가 아니라 numeric이다
--   (오버플로 방지를 위한 표준 동작). 기존 코드는 CASE 표현식 내부에서만 ::bigint로
--   캐스팅했을 뿐, SUM() 자체의 결과는 numeric인 채로 남아 있어 함수의 반환 컬럼
--   타입(bigint)과 불일치가 발생했다.
--
-- 수정: SUM 내부는 numeric으로 통일해서 계산하고, COALESCE(SUM(...), 0) 전체 결과를
--   마지막에 한 번만 ::bigint로 명시 변환한다. 실제 저장공간 총량은 bigint 범위
--   (약 9.2 x 10^18 바이트 = 약 9.2 엑사바이트)를 벗어날 수 없으므로 이 캐스팅은 안전하다.
--
-- 다른 함수(is_admin, get_db_table_sizes)와 admin_users 테이블은 변경하지 않는다.
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
REVOKE ALL ON FUNCTION public.get_storage_usage() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_storage_usage() TO authenticated;
