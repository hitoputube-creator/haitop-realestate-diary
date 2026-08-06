import { supabase, isSupabaseConfigured } from './supabase'
import { listDiaryPhotosForIds, listDiaryFilesForIds } from './attachments'

const WORK_DIARY_TABLE = 'work_diary'
const CUSTOMERS_TABLE = 'customers'
const DAILY_SCHEDULE_KEY = '__daily_schedule__'

export function normalizePhone(phone) {
  return (phone || '').replace(/[^0-9]/g, '')
}

function makeClientSuffix() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  return Math.random().toString(16).slice(2, 10).toUpperCase()
}

function generateCustomerCode() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `C-${y}${m}${day}-${makeClientSuffix()}`
}

export async function searchCustomers(query, { limit = 20 } = {}) {
  const trimmed = (query || '').trim()
  if (!isSupabaseConfigured || !trimmed) return []

  const digits = normalizePhone(trimmed)
  const orParts = [`name.ilike.%${trimmed}%`, `phone.ilike.%${trimmed}%`]
  if (digits) orParts.push(`phone_normalized.ilike.%${digits}%`)

  const { data, error } = await supabase
    .from(CUSTOMERS_TABLE)
    .select('id, customer_code, name, phone, phone_normalized, customer_role, status, memo, created_at')
    .or(orParts.join(','))
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  const customers = data || []
  if (customers.length === 0) return []

  const ids = customers.map((c) => c.id)
  const { data: memoRows } = await supabase
    .from(WORK_DIARY_TABLE)
    .select('customer_id, date')
    .in('customer_id', ids)
    .neq('link_key', DAILY_SCHEDULE_KEY)

  const lastDateMap = {}
  ;(memoRows || []).forEach((row) => {
    if (!row.customer_id || !row.date) return
    if (!lastDateMap[row.customer_id] || row.date > lastDateMap[row.customer_id]) {
      lastDateMap[row.customer_id] = row.date
    }
  })

  return customers.map((c) => ({ ...c, lastMemoDate: lastDateMap[c.id] || null }))
}

export async function resolveOrCreateCustomer({ name, phone, manager } = {}) {
  if (!isSupabaseConfigured) return null
  const trimmedName = (name || '').trim()
  const trimmedPhone = (phone || '').trim()
  const digits = normalizePhone(trimmedPhone)
  if (!trimmedName && !digits) return null

  if (digits) {
    const { data: byPhone, error: phoneErr } = await supabase
      .from(CUSTOMERS_TABLE)
      .select('id, name, phone, phone_normalized')
      .eq('phone_normalized', digits)
      .limit(1)
      .maybeSingle()
    if (phoneErr) throw phoneErr
    if (byPhone) return byPhone
  }

  if (trimmedName) {
    const { data: byName, error: nameErr } = await supabase
      .from(CUSTOMERS_TABLE)
      .select('id, name, phone, phone_normalized')
      .ilike('name', trimmedName)
      .limit(1)
      .maybeSingle()
    if (nameErr) throw nameErr
    if (byName) return byName
  }

  if (!trimmedName) return null

  const payload = {
    customer_code: generateCustomerCode(),
    name: trimmedName,
    phone: trimmedPhone || null,
    phone_normalized: digits || null,
    manager: manager || null,
    status: '신규',
  }

  const { data: created, error: insertErr } = await supabase
    .from(CUSTOMERS_TABLE)
    .insert(payload)
    .select('id, name, phone, phone_normalized')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505' && digits) {
      const { data: retry } = await supabase
        .from(CUSTOMERS_TABLE)
        .select('id, name, phone, phone_normalized')
        .eq('phone_normalized', digits)
        .limit(1)
        .maybeSingle()
      if (retry) return retry
    }
    throw insertErr
  }

  return created
}

export async function searchDiaryEntriesFull(query, { limit = 50 } = {}) {
  const trimmed = (query || '').trim()
  if (!isSupabaseConfigured || !trimmed) return []

  const digits = normalizePhone(trimmed)
  const normQ = trimmed.replace(/[\s_]+/g, '')

  const orParts = [
    `customer_name.ilike.%${trimmed}%`,
    `customer_phone.ilike.%${trimmed}%`,
    `title.ilike.%${trimmed}%`,
    `content.ilike.%${trimmed}%`,
  ]
  if (digits) orParts.push(`customer_phone.ilike.%${digits}%`)
  if (normQ && normQ !== trimmed) {
    orParts.push(
      `customer_name.ilike.%${normQ}%`,
      `title.ilike.%${normQ}%`,
      `content.ilike.%${normQ}%`
    )
  }

  const { data, error } = await supabase
    .from(WORK_DIARY_TABLE)
    .select('id, date, created_at, title, customer_name, customer_phone, customer_id, content, writer')
    .neq('link_key', DAILY_SCHEDULE_KEY)
    .or(orParts.join(','))
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function ensureDiaryRowCustomerId(row) {
  if (!isSupabaseConfigured || !row) return null
  if (row.customer_id) return row.customer_id

  const lookupName = (row.customer_name || '').trim()
  const lookupPhone = row.customer_phone || ''
  if (!lookupName && !lookupPhone) return null

  const customer = await resolveOrCreateCustomer({ name: lookupName, phone: lookupPhone, manager: row.writer })
  if (!customer?.id) return null

  const { error } = await supabase
    .from(WORK_DIARY_TABLE)
    .update({ customer_id: customer.id })
    .eq('id', row.id)
  if (error) throw error

  return customer.id
}

export async function getCustomerBrief(customerId) {
  if (!isSupabaseConfigured || !customerId) return null

  const { data, error } = await supabase
    .from(CUSTOMERS_TABLE)
    .select('id, customer_code, name, phone, phone_normalized, customer_role, status, memo, created_at')
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function getCustomerRecentDiaryEntries(customerId, { limit = 5 } = {}) {
  if (!isSupabaseConfigured || !customerId) return []

  const { data, error } = await supabase
    .from(WORK_DIARY_TABLE)
    .select('id, date, created_at, title, customer_name, customer_phone, customer_id, content, writer')
    .eq('customer_id', customerId)
    .neq('link_key', DAILY_SCHEDULE_KEY)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function getCustomerSelectionContext(customerId, { limit = 5 } = {}) {
  if (!isSupabaseConfigured || !customerId) {
    return { customer: null, entries: [] }
  }

  const [customer, entries] = await Promise.all([
    getCustomerBrief(customerId),
    getCustomerRecentDiaryEntries(customerId, { limit }),
  ])

  return { customer, entries }
}

export async function getCustomerTimeline(customerId) {
  if (!isSupabaseConfigured || !customerId) {
    return { customer: null, entries: [] }
  }

  const { data: customer, error: custErr } = await supabase
    .from(CUSTOMERS_TABLE)
    .select('id, name, phone, phone_normalized, memo, created_at')
    .eq('id', customerId)
    .maybeSingle()
  if (custErr) throw custErr

  const { data: diaryRows, error: diaryErr } = await supabase
    .from(WORK_DIARY_TABLE)
    .select('*')
    .eq('customer_id', customerId)
    .neq('link_key', DAILY_SCHEDULE_KEY)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (diaryErr) throw diaryErr

  const rows = diaryRows || []
  const ids = rows.map((r) => r.id)
  const [photoMap, fileMap] = await Promise.all([
    listDiaryPhotosForIds(ids),
    listDiaryFilesForIds(ids),
  ])

  const entries = rows.map((row) => ({
    kind: 'memo',
    id: row.id,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    content: row.content,
    writer: row.writer,
    title: row.title,
    photos: photoMap[row.id] || [],
    files: fileMap[row.id] || [],
  }))

  if (customer?.memo && customer.memo.trim()) {
    entries.push({
      kind: 'registration',
      id: `registration-${customer.id}`,
      date: (customer.created_at || '').slice(0, 10),
      createdAt: customer.created_at,
      updatedAt: customer.created_at,
      content: customer.memo,
      writer: null,
      title: null,
      photos: [],
      files: [],
    })
  }

  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

  return { customer: customer || null, entries }
}
