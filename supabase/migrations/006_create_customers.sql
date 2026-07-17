-- =====================================================================
-- Migration: 006_create_customers
-- Description: 고객관리 CRM 기반 customers 테이블 생성
-- Created: 2026-07-17
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.customers (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code      text         NOT NULL UNIQUE,
  name               text         NOT NULL,
  phone              text,
  phone_normalized   text,
  customer_role      text,
  property_category  text,
  desired_region     text,
  desired_price      text,
  desired_area       text,
  status             text         NOT NULL DEFAULT '신규',
  next_contact_at    date,
  manager            text,
  memo               text,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT customers_customer_role_check
    CHECK (customer_role IS NULL OR customer_role IN ('매수', '임차', '매도', '임대', '기타')),
  CONSTRAINT customers_property_category_check
    CHECK (property_category IS NULL OR property_category IN ('공장창고', '상가사무실', '토지', '주거용', '기타')),
  CONSTRAINT customers_status_check
    CHECK (status IN ('신규', '상담중', '매물추천', '방문예정', '협의중', '계약진행', '완료', '보류'))
);

CREATE INDEX IF NOT EXISTS idx_customers_customer_code
  ON public.customers (customer_code);

CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized
  ON public.customers (phone_normalized);

CREATE INDEX IF NOT EXISTS idx_customers_name
  ON public.customers (name);

CREATE INDEX IF NOT EXISTS idx_customers_status
  ON public.customers (status);

CREATE INDEX IF NOT EXISTS idx_customers_manager
  ON public.customers (manager);

CREATE INDEX IF NOT EXISTS idx_customers_created_at
  ON public.customers (created_at);

CREATE INDEX IF NOT EXISTS idx_customers_next_contact_at
  ON public.customers (next_contact_at);

-- 001_create_work_diary.sql의 public.set_updated_at() 함수가 이미 있으면 재사용하고,
-- 단독 실행 상황에서도 안전하게 동작하도록 같은 구현을 보강한다.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 현재 앱은 로그인 없이 anon key로 기존 업무일지를 사용하므로 customers도 같은 접근 형태를 따른다.
-- 추후 인증 도입 시 user_id/office_id 기준 정책으로 교체해야 한다.
DROP POLICY IF EXISTS "dev_allow_all_select" ON public.customers;
DROP POLICY IF EXISTS "dev_allow_all_insert" ON public.customers;
DROP POLICY IF EXISTS "dev_allow_all_update" ON public.customers;
DROP POLICY IF EXISTS "dev_allow_all_delete" ON public.customers;

CREATE POLICY "dev_allow_all_select"
  ON public.customers
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "dev_allow_all_insert"
  ON public.customers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "dev_allow_all_update"
  ON public.customers
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
