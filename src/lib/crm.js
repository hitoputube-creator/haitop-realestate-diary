export const RECORD_TYPES = [
  '최초상담',
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
  최초상담: { label: '최초상담', tone: 'first' },
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

export const CUSTOMER_ROLES = ['매수', '임차', '매도', '임대', '기타']

export const PROPERTY_CATEGORIES = ['공장창고', '상가·사무실', '토지', '주거용', '기타']

export const CUSTOMER_STATUSES = ['신규', '상담중', '매물추천', '방문예정', '협의중', '계약진행', '완료', '보류']

export const MANAGERS = ['주현희', '김정현']

export const CUSTOMER_SELECT_FIELDS = [
  'id',
  'customer_code',
  'name',
  'phone',
  'phone_normalized',
  'customer_role',
  'property_category',
  'desired_region',
  'desired_price',
  'desired_area',
  'status',
  'next_contact_at',
  'manager',
  'memo',
  'created_at',
  'updated_at',
].join(', ')

export function normalizePhone(value) {
  return (value || '').replace(/\D/g, '')
}

export function formatPhone(value) {
  const digits = normalizePhone(value).slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

export function makeCustomerCode() {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `C-${date}-${randomPart.toUpperCase()}`
}

export function buildCustomerSearchParts(rawValue) {
  const trimmed = (rawValue || '').trim()
  if (!trimmed) return []
  const escaped = trimmed.replace(/[%_,]/g, '')
  const digits = normalizePhone(trimmed)
  const parts = [
    `name.ilike.%${escaped}%`,
    `customer_code.ilike.%${escaped}%`,
    `desired_region.ilike.%${escaped}%`,
    `memo.ilike.%${escaped}%`,
    `customer_role.ilike.%${escaped}%`,
    `property_category.ilike.%${escaped}%`,
  ]
  if (digits) {
    parts.push(`phone_normalized.ilike.%${digits}%`, `phone.ilike.%${escaped}%`)
  } else {
    parts.push(`phone.ilike.%${escaped}%`)
  }
  return parts
}

export function customerLabel(customer) {
  if (!customer) return ''
  return [customer.name, customer.customer_code].filter(Boolean).join(' · ')
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
