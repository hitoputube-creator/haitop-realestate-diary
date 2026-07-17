import { supabase, isSupabaseConfigured } from './supabase'

export const ATTACHMENT_BUCKET = 'crm-attachments'
export const MAX_ATTACHMENT_FILES = 10
export const MAX_ATTACHMENT_FILE_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENT_BATCH_BYTES = 100 * 1024 * 1024
export const SIGNED_URL_SECONDS = 5 * 60

const EXTENSION_MIME = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  hwp: ['application/x-hwp', 'application/haansofthwp', 'application/octet-stream', ''],
  hwpx: ['application/x-hwpx', 'application/octet-stream', ''],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
}

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'js', 'html', 'htm', 'svg', 'zip', 'rar', '7z', 'apk',
])

export const ATTACHMENT_ACCEPT = [
  '.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.hwp', '.hwpx', '.xls', '.xlsx',
].join(',')

export function getFileExtension(name = '') {
  const last = String(name).split('.').pop()
  if (!last || last === name) return ''
  return last.toLowerCase()
}

export function isImageAttachment(attachment) {
  return String(attachment?.mime_type || '').startsWith('image/')
}

export function isPdfAttachment(attachment) {
  return String(attachment?.mime_type || '').toLowerCase() === 'application/pdf'
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value}B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

export function isMissingAttachmentSetupError(error) {
  const text = String(error?.message || error || '').toLowerCase()
  return (
    text.includes('crm_attachments') ||
    text.includes('crm-attachments') ||
    text.includes('storage') ||
    text.includes('bucket') ||
    text.includes('schema cache') ||
    text.includes('row-level security') ||
    text.includes('permission') ||
    text.includes('not authorized') ||
    text.includes('unauthorized')
  )
}

export function validateAttachmentFiles(files) {
  const list = Array.from(files || [])
  const errors = []
  const validFiles = []

  if (list.length > MAX_ATTACHMENT_FILES) {
    errors.push(`한 번에 최대 ${MAX_ATTACHMENT_FILES}개까지 선택할 수 있습니다.`)
  }

  const totalBytes = list.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > MAX_ATTACHMENT_BATCH_BYTES) {
    errors.push(`한 번 선택 총용량은 ${formatFileSize(MAX_ATTACHMENT_BATCH_BYTES)} 이하여야 합니다.`)
  }

  list.slice(0, MAX_ATTACHMENT_FILES).forEach((file) => {
    const ext = getFileExtension(file.name)
    const mime = file.type || ''
    if (!ext || BLOCKED_EXTENSIONS.has(ext) || !EXTENSION_MIME[ext]) {
      errors.push(`${file.name}: 허용되지 않는 파일 형식입니다.`)
      return
    }
    if (file.size > MAX_ATTACHMENT_FILE_BYTES) {
      errors.push(`${file.name}: 파일 1개 최대 용량은 ${formatFileSize(MAX_ATTACHMENT_FILE_BYTES)}입니다.`)
      return
    }
    const allowedMimes = EXTENSION_MIME[ext]
    if (mime && allowedMimes.length > 0 && !allowedMimes.includes(mime)) {
      errors.push(`${file.name}: 확장자와 MIME 타입이 맞지 않습니다.`)
      return
    }
    validFiles.push(file)
  })

  return { validFiles, errors }
}

export function makeAttachmentStoragePath({ customerId, workDiaryId, file }) {
  const ext = getFileExtension(file.name) || 'bin'
  const uuid = crypto.randomUUID()
  if (customerId && workDiaryId) {
    return `customers/${customerId}/work-diary/${workDiaryId}/${uuid}.${ext}`
  }
  if (customerId) {
    return `customers/${customerId}/${uuid}.${ext}`
  }
  return `work-diary/${workDiaryId}/${uuid}.${ext}`
}

export async function listAttachmentsForDiaryIds(workDiaryIds) {
  const ids = Array.from(new Set((workDiaryIds || []).filter(Boolean)))
  if (!isSupabaseConfigured || ids.length === 0) return {}
  const { data, error } = await supabase
    .from('crm_attachments')
    .select('id, customer_id, work_diary_id, storage_bucket, storage_path, original_name, mime_type, file_size, description, uploaded_by, created_at')
    .in('work_diary_id', ids)
    .order('created_at', { ascending: false })
  if (error) throw error
  const map = {}
  ;(data || []).forEach((row) => {
    if (!map[row.work_diary_id]) map[row.work_diary_id] = []
    map[row.work_diary_id].push(row)
  })
  return map
}

export async function listAttachmentsForCustomer(customerId, limit = 20) {
  if (!isSupabaseConfigured || !customerId) return []
  const { data, error } = await supabase
    .from('crm_attachments')
    .select('id, customer_id, work_diary_id, storage_bucket, storage_path, original_name, mime_type, file_size, description, uploaded_by, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function createAttachmentSignedUrl(attachment) {
  const { data, error } = await supabase
    .storage
    .from(attachment.storage_bucket || ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, SIGNED_URL_SECONDS)
  if (error) throw error
  return data?.signedUrl
}

export async function uploadAttachmentFiles({ files, customerId = null, workDiaryId = null, uploadedBy = '' }) {
  if (!customerId && !workDiaryId) {
    throw new Error('고객 또는 업무기록 연결이 필요합니다.')
  }
  const { validFiles, errors } = validateAttachmentFiles(files)
  const results = []
  errors.forEach((error) => results.push({ status: 'failed', error }))

  for (const file of validFiles) {
    const storagePath = makeAttachmentStoragePath({ customerId, workDiaryId, file })
    try {
      const { error: uploadError } = await supabase
        .storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
      if (uploadError) throw uploadError

      const { data, error: insertError } = await supabase
        .from('crm_attachments')
        .insert({
          customer_id: customerId || null,
          work_diary_id: workDiaryId || null,
          storage_bucket: ATTACHMENT_BUCKET,
          storage_path: storagePath,
          original_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: uploadedBy || null,
        })
        .select()
        .single()
      if (insertError) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
        throw insertError
      }
      results.push({ status: 'success', file, attachment: data })
    } catch (error) {
      results.push({ status: 'failed', file, error: error.message || String(error), setupError: isMissingAttachmentSetupError(error) })
    }
  }

  return results
}

export async function deleteAttachment(attachment) {
  const bucket = attachment.storage_bucket || ATTACHMENT_BUCKET
  const { error: storageError } = await supabase
    .storage
    .from(bucket)
    .remove([attachment.storage_path])
  if (storageError) throw storageError

  const { error: dbError } = await supabase
    .from('crm_attachments')
    .delete()
    .eq('id', attachment.id)
  if (dbError) throw dbError
}
