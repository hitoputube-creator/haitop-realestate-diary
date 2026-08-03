import { supabase, isSupabaseConfigured } from './supabase'
import { normalizeAttachmentMime } from './fileMime'
export { normalizeAttachmentMime } from './fileMime'

export const PHOTO_BUCKET = 'crm-attachments'
export const MAX_PHOTO_FILES = 10
export const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif'

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])

export function formatPhotoSize(bytes) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value}B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function getExtension(name = '') {
  const ext = String(name).split('.').pop()
  if (!ext || ext === name) return ''
  return ext.toLowerCase()
}

export function validatePhotoFiles(files) {
  const list = Array.from(files || [])
  const errors = []
  const validFiles = []

  if (list.length > MAX_PHOTO_FILES) {
    errors.push(`한 번에 최대 ${MAX_PHOTO_FILES}장까지 첨부할 수 있습니다.`)
  }

  list.slice(0, MAX_PHOTO_FILES).forEach((file) => {
    const ext = getExtension(file.name)
    const mime = normalizeAttachmentMime(file, '')
    if (!IMAGE_EXTENSIONS.has(ext) || !IMAGE_MIME_TYPES.has(mime)) {
      errors.push(`${file.name}: jpg, png, webp, heic, heif 사진만 첨부할 수 있습니다.`)
      return
    }
    if (file.size > MAX_PHOTO_FILE_BYTES) {
      errors.push(`${file.name}: 사진 1장 최대 용량은 ${formatPhotoSize(MAX_PHOTO_FILE_BYTES)}입니다.`)
      return
    }
    validFiles.push(file)
  })

  return { validFiles, errors }
}

/* ══════════════════════════════════════════════
   공용: Storage 경로 추출 / signed URL / 다운로드
   crm-attachments는 비공개(private) 버킷이므로 DB에는 storage_path만
   저장하고, 미리보기·다운로드가 필요한 순간마다 signed URL을 새로 발급한다.
══════════════════════════════════════════════ */

// 과거 레코드가 다른 컬럼명(file_path/path)이나 예전에 저장된 URL 형태를
// 갖고 있어도 최대한 실제 Storage 경로를 뽑아낸다. blob:/data: 같은 임시
// 주소는 다른 기기에서 절대 복구할 수 없으므로 그대로 버린다.
export function extractStoragePath(row) {
  if (!row) return null
  const direct = row.storage_path || row.file_path || row.path
  if (direct && !/^(blob:|data:)/i.test(direct)) return direct

  const candidateUrl = row.url || row.file_url || row.signed_url
  if (candidateUrl && !/^(blob:|data:)/i.test(candidateUrl)) {
    const match = candidateUrl.match(/\/object\/(?:public|sign)\/[^/]+\/([^?]+)/)
    if (match) return decodeURIComponent(match[1])
  }
  return null
}

function attachmentBucket(row) {
  return row?.storage_bucket || PHOTO_BUCKET
}

const signedUrlCache = new Map() // `${bucket}:${path}` -> { url, expiresAt }
const SIGNED_URL_SAFETY_MARGIN_MS = 10_000

// 미리보기/다운로드용 signed URL을 요청 시점에 새로 발급한다.
// (DB에 저장된 과거 signed URL을 재사용하지 않는다)
export async function getAttachmentSignedUrl(row, { expiresIn = 120, forceRefresh = false } = {}) {
  const path = extractStoragePath(row)
  if (!path) throw new Error('첨부파일 경로를 찾을 수 없습니다.')
  const bucket = attachmentBucket(row)
  const cacheKey = `${bucket}:${path}`

  if (!forceRefresh) {
    const cached = signedUrlCache.get(cacheKey)
    if (cached && cached.expiresAt - SIGNED_URL_SAFETY_MARGIN_MS > Date.now()) {
      return cached.url
    }
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) {
    console.error('[attachments] signed URL 발급 실패:', { bucket, path, message: error.message })
    throw new Error('파일 주소를 발급받지 못했습니다.')
  }

  signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 })
  return data.signedUrl
}

function sanitizeFilename(name) {
  // Windows/맥에서 파일명으로 쓸 수 없는 문자만 치환. 한글·공백은 그대로 유지.
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'attachment'
}

// original_name이 없으면 Storage 경로의 마지막 조각(uuid.ext)을 사용해 확장자를 보존한다.
export function resolveDownloadFilename(row) {
  if (row?.original_name) return sanitizeFilename(row.original_name)
  const path = extractStoragePath(row)
  if (path) {
    const last = path.split('/').pop()
    if (last) return sanitizeFilename(last)
  }
  return 'attachment'
}

// 첨부파일 1개의 실제 바이트(Blob)를 받아온다.
// 1) Storage SDK의 download()로 직접 Blob을 받아온다 (가장 안정적)
// 2) 실패하면 signed URL을 새로 발급해 fetch로 받아온다
// 둘 다 실패하면 사용자에게 보여줄 에러 메시지를 담아 throw한다.
export async function fetchAttachmentBlob(row) {
  const path = extractStoragePath(row)
  const bucket = attachmentBucket(row)

  if (!path) {
    throw new Error('이 첨부파일은 원본 경로가 없어 다운로드할 수 없습니다.')
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).download(path)
    if (error) throw error
    return data
  } catch (downloadErr) {
    console.warn('[attachments] storage.download 실패, signed URL로 재시도:', { bucket, path, message: downloadErr.message || downloadErr })
    try {
      const signedUrl = await getAttachmentSignedUrl(row, { expiresIn: 60, forceRefresh: true })
      const response = await fetch(signedUrl)
      if (!response.ok) {
        throw new Error(`파일 다운로드 실패: ${response.status}`, { cause: downloadErr })
      }
      return await response.blob()
    } catch (fetchErr) {
      console.error('[attachments] 다운로드 최종 실패:', { bucket, path, message: fetchErr.message || fetchErr })
      const reason = fetchErr?.message || downloadErr?.message || 'Storage 권한 또는 파일 경로를 확인해야 합니다.'
      throw new Error(`파일을 다운로드하지 못했습니다. ${reason}`, { cause: fetchErr })
    }
  }
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

// PC 브라우저에서 cross-origin 첨부파일 1개를 확실하게 저장한다.
export async function downloadAttachment(row) {
  const blob = await fetchAttachmentBlob(row)
  triggerBlobDownload(blob, resolveDownloadFilename(row))
}

// 이름 충돌 시 "파일(2).jpg" 형태로 겹치지 않게 만든다.
function dedupeZipName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let n = 2
  let candidate = `${base}(${n})${ext}`
  while (usedNames.has(candidate)) {
    n += 1
    candidate = `${base}(${n})${ext}`
  }
  usedNames.add(candidate)
  return candidate
}

// 선택한 첨부파일 여러 개를 zip 하나로 묶어 한 번에 다운로드한다.
// (브라우저는 스크립트가 여러 파일을 연속으로 다운로드하려 하면 막거나 확인창을
// 띄우므로, 여러 장을 선택했을 때는 파일을 여러 개 내려받는 대신 zip 하나로 합친다)
export async function downloadAttachmentsAsZip(rows, { zipName, onProgress } = {}) {
  const list = (rows || []).filter(Boolean)
  if (!list.length) return

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const usedNames = new Set()

  for (let i = 0; i < list.length; i += 1) {
    const blob = await fetchAttachmentBlob(list[i])
    const name = dedupeZipName(resolveDownloadFilename(list[i]), usedNames)
    zip.file(name, blob)
    onProgress?.(i + 1, list.length)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  triggerBlobDownload(zipBlob, zipName || `첨부사진_${list.length}장.zip`)
}

/* ══════════════════════════════════════════════
   업무일지 사진 첨부
══════════════════════════════════════════════ */

export async function listDiaryPhotosForIds(workDiaryIds) {
  const ids = Array.from(new Set((workDiaryIds || []).filter(Boolean)))
  if (!isSupabaseConfigured || ids.length === 0) return {}

  const { data, error } = await supabase
    .from('crm_attachments')
    .select('id, customer_id, work_diary_id, storage_bucket, storage_path, original_name, mime_type, file_size, uploaded_by, created_at')
    .in('work_diary_id', ids)
    .order('created_at', { ascending: true })

  if (error) throw error

  const map = {}
  ;(data || [])
    .filter((row) => String(row.mime_type || '').startsWith('image/'))
    .forEach((row) => {
      if (!map[row.work_diary_id]) map[row.work_diary_id] = []
      map[row.work_diary_id].push(row)
    })
  return map
}

function makeClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const random = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4))).map((value) => value.toString(16)).join('')
    : Math.random().toString(16).slice(2)
  return `${Date.now().toString(16)}-${random}`
}

function makePhotoPath({ workDiaryId, file }) {
  const ext = getExtension(file.name) || 'jpg'
  const uuid = makeClientId()
  return `work-diary/${workDiaryId}/${uuid}.${ext}`
}

export async function uploadDiaryPhotos({ files, workDiaryId, uploadedBy = '' }) {
  if (!isSupabaseConfigured || !workDiaryId) return []

  const { validFiles, errors } = validatePhotoFiles(files)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  const uploaded = []
  for (const file of validFiles) {
    const requestedPath = makePhotoPath({ workDiaryId, file })
    const contentType = normalizeAttachmentMime(file, 'image/jpeg')
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from(PHOTO_BUCKET)
      .upload(requestedPath, file, {
        contentType,
        upsert: false,
      })
    if (uploadError) throw uploadError

    // 실제로 저장된 경로(data.path)를 기준으로 DB에 기록한다.
    const storedPath = uploadData?.path || requestedPath

    const { data, error: insertError } = await supabase
      .from('crm_attachments')
      .insert({
        customer_id: null,
        work_diary_id: workDiaryId,
        storage_bucket: PHOTO_BUCKET,
        storage_path: storedPath,
        original_name: file.name,
        mime_type: contentType,
        file_size: file.size,
        uploaded_by: uploadedBy || null,
      })
      .select()
      .single()

    if (insertError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([storedPath])
      throw insertError
    }
    uploaded.push(data)
  }

  return uploaded
}

/* ══════════════════════════════════════════════
   업무일지 일반 파일 첨부 (문서/압축파일, 사진과 별도)
══════════════════════════════════════════════ */

export const FILE_BUCKET = PHOTO_BUCKET
export const MAX_DIARY_FILES = 10
export const MAX_DIARY_FILE_BYTES = 50 * 1024 * 1024
export const FILE_ACCEPT = '.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip,.7z'

const FILE_EXTENSION_MIME = {
  pdf: 'application/pdf',
  hwp: 'application/x-hwp',
  hwpx: 'application/haansofthwpx',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
}

export function validateDiaryFiles(files) {
  const list = Array.from(files || [])
  const errors = []
  const validFiles = []

  if (list.length > MAX_DIARY_FILES) {
    errors.push(`한 번에 최대 ${MAX_DIARY_FILES}개까지 첨부할 수 있습니다.`)
  }

  list.slice(0, MAX_DIARY_FILES).forEach((file) => {
    const ext = getExtension(file.name)
    if (!FILE_EXTENSION_MIME[ext]) {
      errors.push(`${file.name}: 지원하지 않는 파일 형식입니다.`)
      return
    }
    if (file.size > MAX_DIARY_FILE_BYTES) {
      errors.push(`${file.name}: 파일 1개 최대 용량은 ${formatPhotoSize(MAX_DIARY_FILE_BYTES)}입니다.`)
      return
    }
    validFiles.push(file)
  })

  return { validFiles, errors }
}

export async function listDiaryFilesForIds(workDiaryIds) {
  const ids = Array.from(new Set((workDiaryIds || []).filter(Boolean)))
  if (!isSupabaseConfigured || ids.length === 0) return {}

  const { data, error } = await supabase
    .from('crm_attachments')
    .select('id, customer_id, work_diary_id, storage_bucket, storage_path, original_name, mime_type, file_size, uploaded_by, created_at')
    .in('work_diary_id', ids)
    .order('created_at', { ascending: true })

  if (error) throw error

  const map = {}
  ;(data || [])
    .filter((row) => !String(row.mime_type || '').startsWith('image/'))
    .forEach((row) => {
      if (!map[row.work_diary_id]) map[row.work_diary_id] = []
      map[row.work_diary_id].push(row)
    })
  return map
}

function makeFilePath({ workDiaryId, file }) {
  const ext = getExtension(file.name) || 'bin'
  const uuid = makeClientId()
  return `work-diary/${workDiaryId}/${uuid}.${ext}`
}

export async function uploadDiaryFiles({ files, workDiaryId, uploadedBy = '' }) {
  if (!isSupabaseConfigured || !workDiaryId) return []

  const { validFiles, errors } = validateDiaryFiles(files)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  const uploaded = []
  for (const file of validFiles) {
    const ext = getExtension(file.name)
    const contentType = normalizeAttachmentMime(file, FILE_EXTENSION_MIME[ext] || 'application/octet-stream')
    const requestedPath = makeFilePath({ workDiaryId, file })
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from(FILE_BUCKET)
      .upload(requestedPath, file, {
        contentType,
        upsert: false,
      })
    if (uploadError) throw uploadError

    const storedPath = uploadData?.path || requestedPath

    const { data, error: insertError } = await supabase
      .from('crm_attachments')
      .insert({
        customer_id: null,
        work_diary_id: workDiaryId,
        storage_bucket: FILE_BUCKET,
        storage_path: storedPath,
        original_name: file.name,
        mime_type: contentType,
        file_size: file.size,
        uploaded_by: uploadedBy || null,
      })
      .select()
      .single()

    if (insertError) {
      await supabase.storage.from(FILE_BUCKET).remove([storedPath])
      throw insertError
    }
    uploaded.push(data)
  }

  return uploaded
}
