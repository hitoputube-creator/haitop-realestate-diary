import { supabase, isSupabaseConfigured } from './supabase'

export const PHOTO_BUCKET = 'crm-attachments'
export const MAX_PHOTO_FILES = 10
export const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

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

function normalizePhoto(row) {
  const bucket = row.storage_bucket || PHOTO_BUCKET
  const { data } = supabase.storage.from(bucket).getPublicUrl(row.storage_path)
  return {
    ...row,
    public_url: data?.publicUrl || '',
  }
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
    const mime = file.type || ''
    if (!IMAGE_EXTENSIONS.has(ext) || (mime && !IMAGE_MIME_TYPES.has(mime))) {
      errors.push(`${file.name}: jpg, png, webp 사진만 첨부할 수 있습니다.`)
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
    .map(normalizePhoto)
    .forEach((row) => {
      if (!map[row.work_diary_id]) map[row.work_diary_id] = []
      map[row.work_diary_id].push(row)
    })
  return map
}

function makePhotoPath({ workDiaryId, file }) {
  const ext = getExtension(file.name) || 'jpg'
  const uuid = makeClientId()
  return `work-diary/${workDiaryId}/${uuid}.${ext}`
}

function makeClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const random = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4))).map((value) => value.toString(16)).join('')
    : Math.random().toString(16).slice(2)
  return `${Date.now().toString(16)}-${random}`
}

export async function uploadDiaryPhotos({ files, workDiaryId, uploadedBy = '' }) {
  if (!isSupabaseConfigured || !workDiaryId) return []

  const { validFiles, errors } = validatePhotoFiles(files)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  const uploaded = []
  for (const file of validFiles) {
    const storagePath = makePhotoPath({ workDiaryId, file })
    const { error: uploadError } = await supabase
      .storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })
    if (uploadError) throw uploadError

    const { data, error: insertError } = await supabase
      .from('crm_attachments')
      .insert({
        customer_id: null,
        work_diary_id: workDiaryId,
        storage_bucket: PHOTO_BUCKET,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: uploadedBy || null,
      })
      .select()
      .single()

    if (insertError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([storagePath])
      throw insertError
    }
    uploaded.push(normalizePhoto(data))
  }

  return uploaded
}
