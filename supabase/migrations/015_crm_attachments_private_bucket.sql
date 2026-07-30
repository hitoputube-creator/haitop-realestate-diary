-- ================================================================
-- 015_crm_attachments_private_bucket.sql
-- 첨부파일(사진/문서) 스토리지를 진짜 비공개 버킷으로 전환.
--
-- 조사 결과: crm-attachments 버킷은 실제로는 public=true 였다.
-- "모바일에서 올린 사진을 PC에서 다운로드하지 못하는" 증상의 진짜 원인은
-- 버킷 공개여부가 아니라, 프론트엔드가 cross-origin(Storage 도메인) URL에
-- <a download> 속성을 사용했기 때문(대부분의 브라우저는 cross-origin
-- 리소스에서 download 속성을 무시하고 그냥 새 탭에서 열어버린다)이었다.
-- 이 마이그레이션은 그 문제와 별개로, 고객 사진/문서가 인증 없이도
-- 영구적인 공개 URL로 열람 가능했던 부분을 막기 위해 버킷을 비공개로
-- 전환하고, 프론트엔드는 항상 요청 시점에 생성하는 signed URL을 쓴다.
--
-- storage.objects의 anon/authenticated SELECT 정책은 그대로 유지한다.
-- 이 앱은 별도의 Supabase Auth 없이 공유 비밀번호 게이트 + anon key로
-- 동작하므로, signed URL을 발급받으려면 anon 역할의 SELECT 권한이
-- 필요하다(이미 존재하는 public_diary_photo_objects_select 정책 재사용).
-- ================================================================

UPDATE storage.buckets
SET public = false
WHERE id = 'crm-attachments';

-- 모바일에서 HEIC/HEIF로 저장된 사진도 업로드할 수 있도록 허용 MIME 타입 확장
UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT mime)
  FROM unnest(
    coalesce(allowed_mime_types, ARRAY[]::text[]) || ARRAY['image/heic', 'image/heif']
  ) AS mime
)
WHERE id = 'crm-attachments';
