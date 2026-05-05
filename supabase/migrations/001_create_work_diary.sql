-- =====================================================================
-- Migration: 001_create_work_diary
-- Description: 업무일지(work_diary) 테이블 생성
-- Created: 2026-05-05
-- =====================================================================

-- 1) work_diary 테이블 생성
CREATE TABLE IF NOT EXISTS public.work_diary (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    content     text          NOT NULL,
    status      text          NOT NULL DEFAULT 'normal'
                              CHECK (status IN ('normal', 'important', 'later', 'done')),
    tags        text[]        NOT NULL DEFAULT '{}',
    date        date          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- 2) 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_work_diary_date   ON public.work_diary (date);
CREATE INDEX IF NOT EXISTS idx_work_diary_status ON public.work_diary (status);

-- 3) updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_diary_updated_at ON public.work_diary;
CREATE TRIGGER trg_work_diary_updated_at
    BEFORE UPDATE ON public.work_diary
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 4) RLS 활성화
ALTER TABLE public.work_diary ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- TODO: 아래 정책은 개발용 임시 정책입니다.
--       익명(anon) 사용자도 모든 CRUD 작업이 가능하도록 허용합니다.
--       추후 사용자 인증 도입 시 user_id 컬럼 추가 + auth.uid() 기반
--       정책으로 반드시 교체해야 합니다.
-- =====================================================================
DROP POLICY IF EXISTS "dev_allow_all_select" ON public.work_diary;
DROP POLICY IF EXISTS "dev_allow_all_insert" ON public.work_diary;
DROP POLICY IF EXISTS "dev_allow_all_update" ON public.work_diary;
DROP POLICY IF EXISTS "dev_allow_all_delete" ON public.work_diary;

CREATE POLICY "dev_allow_all_select"
    ON public.work_diary
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "dev_allow_all_insert"
    ON public.work_diary
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "dev_allow_all_update"
    ON public.work_diary
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "dev_allow_all_delete"
    ON public.work_diary
    FOR DELETE
    TO anon, authenticated
    USING (true);
