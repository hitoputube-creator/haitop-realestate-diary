-- AI가 메모에서 추출한 매물 정보를 사람이 확인하기 전까지 "등록 대기" 상태로 보관하는 테이블.
-- listings에는 확인 후 사람이 "등록" 버튼을 눌러야만 최종 저장된다.
CREATE TABLE public.listing_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_diary_id uuid REFERENCES public.work_diary(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','registered','dismissed'])),
  category1 text,
  category2 text,
  deal_type text,
  title text,
  address text,
  sale_price text,
  deposit text,
  monthly_rent text,
  area_m2 numeric,
  floor_info text,
  detail_description text,
  customer_name text,
  customer_phone text,
  building_register_raw jsonb,
  ai_confidence_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.listing_intakes ENABLE ROW LEVEL SECURITY;

-- work_diary와 동일한 수준(내부 도구, anon/authenticated 전체 허용)으로 맞춤
CREATE POLICY dev_allow_all_select ON public.listing_intakes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_allow_all_insert ON public.listing_intakes
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_allow_all_update ON public.listing_intakes
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY dev_allow_all_delete ON public.listing_intakes
  FOR DELETE TO anon, authenticated USING (true);
