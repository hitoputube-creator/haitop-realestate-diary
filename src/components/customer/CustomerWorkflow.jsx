import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import {
  CUSTOMER_ROLES,
  CUSTOMER_SELECT_FIELDS,
  CUSTOMER_STATUSES,
  MANAGERS,
  PROPERTY_CATEGORIES,
  buildCustomerSearchParts,
  customerLabel,
  formatCrmDate,
  formatPhone,
  isDueTodayOrPast,
  isMissingCustomerMigrationError,
  makeCustomerCode,
  normalizePhone,
  toDateTimeValue,
} from '../../lib/crm'
import './CustomerWorkflow.css'

const EMPTY_QUICK_FORM = {
  name: '',
  phone: '',
  customer_role: '매수',
  property_category: '공장창고',
  desired_region: '',
  desired_price: '',
  desired_area: '',
  status: '신규',
  next_contact_at: '',
  manager: '주현희',
  memo: '',
  initial_record: '',
  record_date: new Date().toISOString().slice(0, 10),
}

function customerMeta(customer) {
  return [
    customer.customer_role,
    customer.property_category,
    customer.desired_region,
    customer.manager && `담당 ${customer.manager}`,
  ].filter(Boolean).join(' · ')
}

async function insertInitialRecord(customer, form) {
  const content = form.initial_record.trim()
  if (!content) return null

  const payload = {
    customer_id: customer.id,
    content,
    tags: [],
    status: 'normal',
    date: form.record_date || new Date().toISOString().slice(0, 10),
    writer: form.manager || customer.manager || '주현희',
    sticker: null,
    link_key: customer.name ? `고객-${customer.name}` : customer.customer_code,
    record_type: '최초상담',
    priority: '일반',
    scheduled_at: toDateTimeValue(form.next_contact_at),
  }

  const { data, error } = await supabase
    .from('work_diary')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

function TimelinePreview({ customer, refreshKey }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      if (!customer?.id || !isSupabaseConfigured) {
        if (!cancelled) setRows([])
        return
      }
      setLoading(true)
      setError('')
      try {
        const { data, error: timelineError } = await supabase
          .from('work_diary')
          .select('id, content, status, date, writer, record_type, scheduled_at, created_at')
          .eq('customer_id', customer.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5)
        if (timelineError) throw timelineError
        if (!cancelled) setRows(data || [])
      } catch (timelineError) {
        if (!cancelled) {
          setRows([])
          setError(
            isMissingCustomerMigrationError(timelineError)
              ? '고객 타임라인을 보려면 007 마이그레이션 적용이 필요합니다.'
              : `타임라인 조회 실패: ${timelineError.message || timelineError}`
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [customer, refreshKey])

  const summary = useMemo(() => {
    return {
      total: rows.length,
      next: rows.find((row) => row.scheduled_at)?.scheduled_at || customer?.next_contact_at,
      open: rows.filter((row) => row.status !== 'done').length,
    }
  }, [customer?.next_contact_at, rows])

  if (!customer) return null

  return (
    <section className="cw-timeline">
      <div className="cw-section-head">
        <h3>최근 업무기록</h3>
        <span>{summary.total}건 미리보기</span>
      </div>
      <div className="cw-timeline-stats">
        <span>미완료 {summary.open}</span>
        <span className={isDueTodayOrPast(summary.next) ? 'is-due' : ''}>다음 연락 {formatCrmDate(summary.next)}</span>
      </div>
      {loading ? (
        <div className="cw-state">불러오는 중...</div>
      ) : error ? (
        <div className="cw-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="cw-state">아직 연결된 업무기록이 없습니다.</div>
      ) : (
        <div className="cw-timeline-list">
          {rows.map((row) => (
            <article key={row.id} className="cw-timeline-item">
              <div>
                <strong>{formatCrmDate(row.date)}</strong>
                <span>{row.record_type || '일반메모'} · {row.writer || '-'}</span>
              </div>
              <p>{row.content}</p>
              {row.scheduled_at && (
                <em className={isDueTodayOrPast(row.scheduled_at) ? 'is-due' : ''}>
                  다음 연락 {formatCrmDate(row.scheduled_at)}
                </em>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function QuickCreateForm({ draftName, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_QUICK_FORM, name: draftName || '' }))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [retryCustomer, setRetryCustomer] = useState(null)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function retryInitialRecord() {
    if (!retryCustomer || saving || !form.initial_record.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const record = await insertInitialRecord(retryCustomer, form)
      setMessage({ type: 'success', text: '최초상담 기록을 다시 저장했습니다.' })
      onSaved?.(retryCustomer, record)
      setRetryCustomer(null)
      setForm(EMPTY_QUICK_FORM)
    } catch (error) {
      setMessage({
        type: 'error',
        text: isMissingCustomerMigrationError(error)
          ? '최초상담 저장 실패: 007 마이그레이션 적용이 필요합니다.'
          : `최초상담 저장 실패: ${error.message || error}`,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving || !form.name.trim()) return
    setSaving(true)
    setMessage(null)
    setRetryCustomer(null)
    try {
      const payload = {
        customer_code: makeCustomerCode(),
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        phone_normalized: normalizePhone(form.phone) || null,
        customer_role: form.customer_role || null,
        property_category: form.property_category || null,
        desired_region: form.desired_region.trim() || null,
        desired_price: form.desired_price.trim() || null,
        desired_area: form.desired_area.trim() || null,
        status: form.status || '신규',
        next_contact_at: form.next_contact_at || null,
        manager: form.manager || null,
        memo: form.memo.trim() || null,
      }

      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert(payload)
        .select()
        .single()
      if (customerError) throw customerError

      try {
        const record = await insertInitialRecord(customer, form)
        setMessage({
          type: 'success',
          text: record ? '고객과 최초상담 기록을 저장했습니다.' : '고객을 저장했습니다.',
        })
        onSaved?.(customer, record)
        setForm(EMPTY_QUICK_FORM)
      } catch (recordError) {
        setRetryCustomer(customer)
        setMessage({
          type: 'error',
          text: isMissingCustomerMigrationError(recordError)
            ? '고객은 저장됐고 최초상담은 실패했습니다. 007 마이그레이션 적용 후 다시 저장할 수 있습니다.'
            : `고객은 저장됐고 최초상담만 실패했습니다: ${recordError.message || recordError}`,
        })
        onSaved?.(customer, null)
      }
    } catch (error) {
      setMessage({ type: 'error', text: `고객 저장 실패: ${error.message || error}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="cw-quick-form" onSubmit={handleSubmit}>
      <div className="cw-section-head">
        <h3>신규 고객 간편등록</h3>
        <span>기본메모와 최초상담을 분리 저장</span>
      </div>
      <label>
        <span>고객명 또는 별칭 *</span>
        <input value={form.name} onChange={(event) => updateField('name', event.target.value)} disabled={saving} required />
      </label>
      <label>
        <span>전화번호</span>
        <input type="tel" value={form.phone} onChange={(event) => updateField('phone', formatPhone(event.target.value))} disabled={saving} />
      </label>
      <div className="cw-form-grid">
        <label>
          <span>고객유형</span>
          <select value={form.customer_role} onChange={(event) => updateField('customer_role', event.target.value)} disabled={saving}>
            {CUSTOMER_ROLES.map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
        <label>
          <span>부동산 종류</span>
          <select value={form.property_category} onChange={(event) => updateField('property_category', event.target.value)} disabled={saving}>
            {PROPERTY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
      </div>
      <div className="cw-form-grid">
        <label>
          <span>진행상태</span>
          <select value={form.status} onChange={(event) => updateField('status', event.target.value)} disabled={saving}>
            {CUSTOMER_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label>
          <span>담당자</span>
          <select value={form.manager} onChange={(event) => updateField('manager', event.target.value)} disabled={saving}>
            {MANAGERS.map((manager) => <option key={manager}>{manager}</option>)}
          </select>
        </label>
      </div>
      <label>
        <span>희망지역</span>
        <input value={form.desired_region} onChange={(event) => updateField('desired_region', event.target.value)} disabled={saving} />
      </label>
      <div className="cw-form-grid">
        <label>
          <span>희망금액</span>
          <input value={form.desired_price} onChange={(event) => updateField('desired_price', event.target.value)} disabled={saving} />
        </label>
        <label>
          <span>희망면적</span>
          <input value={form.desired_area} onChange={(event) => updateField('desired_area', event.target.value)} disabled={saving} />
        </label>
      </div>
      <label>
        <span>다음 연락일</span>
        <input type="date" value={form.next_contact_at} onChange={(event) => updateField('next_contact_at', event.target.value)} disabled={saving} />
      </label>
      <label>
        <span>고객 기본메모</span>
        <textarea value={form.memo} onChange={(event) => updateField('memo', event.target.value)} disabled={saving} placeholder="고객의 고정 정보, 성향, 조건, 주의사항" />
      </label>
      <label>
        <span>최초상담 기록</span>
        <textarea value={form.initial_record} onChange={(event) => updateField('initial_record', event.target.value)} disabled={saving} placeholder="처음 문의 내용, 상담 경위, 오늘 처리한 내용" />
      </label>
      {message && (
        <div className={`cw-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          <span>{message.text}</span>
          {retryCustomer && (
            <button type="button" onClick={retryInitialRecord} disabled={saving || !form.initial_record.trim()}>
              최초상담 다시 저장
            </button>
          )}
        </div>
      )}
      <button type="submit" className="cw-primary" disabled={saving || !form.name.trim() || !isSupabaseConfigured}>
        {saving ? '저장 중...' : form.initial_record.trim() ? '고객+최초상담 저장' : '고객만 저장'}
      </button>
    </form>
  )
}

export function CustomerWorkPanel({
  selectedCustomer,
  recordScope,
  timelineRefreshKey,
  onSelectCustomer,
  onClearCustomer,
  onCustomerSaved,
  onOpenCustomerManager,
  onRecordScopeChange,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const timerRef = useRef(null)

  const searchCustomers = useCallback(async (value) => {
    const trimmed = value.trim()
    if (!trimmed || !isSupabaseConfigured) {
      setResults([])
      return
    }
    setSearching(true)
    setError('')
    try {
      const parts = buildCustomerSearchParts(trimmed)
      const { data, error: searchError } = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT_FIELDS)
        .or(parts.join(','))
        .order('updated_at', { ascending: false })
        .limit(20)
      if (searchError) throw searchError
      setResults(data || [])
    } catch (searchError) {
      setResults([])
      setError(`고객 검색 실패: ${searchError.message || searchError}`)
    } finally {
      setSearching(false)
    }
  }, [])

  function handleQueryChange(event) {
    const next = event.target.value
    setQuery(next)
    clearTimeout(timerRef.current)
    if (!next.trim()) {
      setResults([])
      setError('')
      return
    }
    timerRef.current = setTimeout(() => searchCustomers(next), 300)
  }

  const selectedMeta = selectedCustomer ? customerMeta(selectedCustomer) : ''

  return (
    <aside className="cw-panel" aria-label="고객 업무 패널">
      <div className="cw-panel-head">
        <div>
          <h2>고객 업무</h2>
          <p>검색, 선택, 등록, 타임라인을 한 곳에서 처리합니다.</p>
        </div>
        <button type="button" className="cw-ghost" onClick={() => setShowQuickCreate((value) => !value)}>
          {showQuickCreate ? '등록 닫기' : '신규 등록'}
        </button>
      </div>

      <label className="cw-search">
        <span>고객 검색</span>
        <input
          type="search"
          value={query}
          onChange={handleQueryChange}
          placeholder="이름, 고객번호, 전화번호, 지역"
          autoComplete="off"
        />
      </label>
      {searching && <div className="cw-state compact">검색 중...</div>}
      {error && <div className="cw-error">{error}</div>}
      {query.trim() && !searching && results.length === 0 && (
        <div className="cw-empty-search">
          <span>검색 결과가 없습니다.</span>
          <button type="button" onClick={() => setShowQuickCreate(true)}>새 고객으로 등록</button>
        </div>
      )}
      {results.length > 0 && (
        <div className="cw-search-results" role="list">
          {results.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className={selectedCustomer?.id === customer.id ? 'active' : ''}
              onClick={() => {
                onSelectCustomer?.(customer)
                setQuery('')
                setResults([])
              }}
            >
              <strong>{customer.name}</strong>
              <span>{customer.customer_code}</span>
              <em>{customerMeta(customer)}</em>
            </button>
          ))}
        </div>
      )}

      {showQuickCreate && (
        <QuickCreateForm
          draftName={query}
          onSaved={(customer, record) => {
            setShowQuickCreate(false)
            setQuery('')
            setResults([])
            onCustomerSaved?.(customer, record)
          }}
        />
      )}

      <section className="cw-summary">
        <div className="cw-section-head">
          <h3>선택 고객</h3>
          {selectedCustomer && <button type="button" onClick={onClearCustomer}>선택 해제</button>}
        </div>
        {selectedCustomer ? (
          <>
            <div className="cw-selected-card">
              <strong>{selectedCustomer.name}</strong>
              <span>{selectedCustomer.customer_code}</span>
              {selectedCustomer.phone && <span>{selectedCustomer.phone}</span>}
              {selectedMeta && <em>{selectedMeta}</em>}
              <dl>
                <div><dt>상태</dt><dd>{selectedCustomer.status || '-'}</dd></div>
                <div><dt>다음 연락</dt><dd className={isDueTodayOrPast(selectedCustomer.next_contact_at) ? 'is-due' : ''}>{formatCrmDate(selectedCustomer.next_contact_at)}</dd></div>
              </dl>
            </div>
            <div className="cw-scope-tabs" role="group" aria-label="업무기록 표시 범위">
              <button
                type="button"
                className={recordScope === 'customer' ? 'active' : ''}
                onClick={() => onRecordScopeChange?.('customer')}
              >
                이 고객 기록
              </button>
              <button
                type="button"
                className={recordScope === 'all' ? 'active' : ''}
                onClick={() => onRecordScopeChange?.('all')}
              >
                전체 업무기록
              </button>
            </div>
            <div className="cw-summary-actions">
              <button type="button" className="cw-ghost" onClick={() => onOpenCustomerManager?.(selectedCustomer.id)}>
                고객 수정
              </button>
              <button type="button" className="cw-ghost" onClick={() => onRecordScopeChange?.('customer')}>
                전체 타임라인
              </button>
            </div>
          </>
        ) : (
          <div className="cw-state">
            고객을 선택하면 기록 작성창과 업무목록이 해당 고객 기준으로 연결됩니다.
          </div>
        )}
      </section>

      <TimelinePreview customer={selectedCustomer} refreshKey={timelineRefreshKey} />

      <button type="button" className="cw-full-list" onClick={() => onOpenCustomerManager?.(selectedCustomer?.id || null)}>
        전체 고객보기
      </button>
    </aside>
  )
}

export function UnifiedCustomerResults({ customers, onSelectCustomer }) {
  if (!customers?.length) return null

  return (
    <section className="cw-unified-results">
      <div className="cw-section-head">
        <h3>고객 결과</h3>
        <span>{customers.length}명</span>
      </div>
      <div className="cw-unified-list">
        {customers.map((customer) => (
          <button key={customer.id} type="button" onClick={() => onSelectCustomer?.(customer)}>
            <strong>{customer.name}</strong>
            <span>{customerLabel(customer)}</span>
            <em>{customerMeta(customer)}</em>
          </button>
        ))}
      </div>
    </section>
  )
}
