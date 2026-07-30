-- ================================================================
-- 014_customer_memo_timeline_dedup.sql
-- 고객별 메모 타임라인 기능을 위한 안전장치.
--
-- 배경: work_diary.customer_id(고객 FK), customers 테이블, crm_attachments
-- 테이블은 이미 존재하며 필요한 인덱스(customer_id, customer_id+date,
-- phone_normalized 등)도 이미 갖춰져 있음. 프론트엔드에서 고객을
-- 이름/전화번호로 검색해 없으면 자동 생성(resolveOrCreateCustomer)하는
-- 흐름을 추가하면서, 동시 저장/중복 클릭 상황에서 같은 전화번호로
-- 고객이 중복 생성되지 않도록 DB 레벨 유니크 인덱스를 추가한다.
--
-- 기존 데이터: 현재 phone_normalized 중복 없음(사전 확인 완료).
-- NULL 값은 유니크 제약에서 제외되므로 전화번호 없는 고객은 영향 없음.
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_normalized_unique
  ON public.customers (phone_normalized)
  WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';
