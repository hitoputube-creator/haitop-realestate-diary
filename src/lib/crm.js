export const RECORD_TYPES = [
  '전화상담',
  '방문상담',
  '현장방문',
  '매물전송',
  '문자·카톡',
  '가격협의',
  '계약진행',
  '일반메모',
]

export const RECORD_TYPE_META = {
  전화상담: { label: '전화상담', tone: 'call' },
  방문상담: { label: '방문상담', tone: 'visit' },
  현장방문: { label: '현장방문', tone: 'site' },
  매물전송: { label: '매물전송', tone: 'send' },
  '문자·카톡': { label: '문자·카톡', tone: 'message' },
  가격협의: { label: '가격협의', tone: 'price' },
  계약진행: { label: '계약진행', tone: 'contract' },
  일반메모: { label: '일반메모', tone: 'memo' },
}

export const DIARY_STATUS_OPTIONS = [
  { value: 'normal', label: '일반' },
  { value: 'important', label: '중요' },
  { value: 'later', label: '나중에' },
  { value: 'done', label: '완료' },
]

export function normalizePhone(value) {
  return (value || '').replace(/\D/g, '')
}

export function toDateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return date.toISOString().slice(0, 10)
}

export function toDateTimeValue(dateValue) {
  if (!dateValue) return null
  return `${dateValue}T00:00:00`
}

export function formatCrmDate(value) {
  if (!value) return '-'
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

export function formatCrmTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function isDueTodayOrPast(value) {
  if (!value) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return !Number.isNaN(target.getTime()) && target <= today
}

export function isMissingCustomerMigrationError(error) {
  const text = String(error?.message || error || '').toLowerCase()
  return (
    text.includes('customer_id') ||
    text.includes('record_type') ||
    text.includes('scheduled_at') ||
    text.includes('column') ||
    text.includes('schema cache')
  )
}
