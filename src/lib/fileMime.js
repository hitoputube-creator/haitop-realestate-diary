const EXTENSION_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

const MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/heic-sequence': 'image/heic',
  'image/heif-sequence': 'image/heif',
}

function getExtension(name = '') {
  const ext = String(name).split('.').pop()
  if (!ext || ext === name) return ''
  return ext.toLowerCase()
}

export function normalizeAttachmentMime(file, fallback = 'application/octet-stream') {
  const ext = getExtension(file?.name || '')
  const raw = String(file?.type || '').trim().toLowerCase()
  const normalizedRaw = MIME_ALIASES[raw] || raw

  if (normalizedRaw && normalizedRaw !== 'application/octet-stream') return normalizedRaw
  return EXTENSION_MIME[ext] || fallback
}
