-- =====================================================================
-- Migration: 002_add_link_key
-- Description: work_diary 테이블에 연결고리(link_key) 컬럼 추가
-- Created: 2026-06-09
-- =====================================================================

ALTER TABLE public.work_diary
  ADD COLUMN IF NOT EXISTS link_key text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_work_diary_link_key ON public.work_diary (link_key);
