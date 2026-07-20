import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  DIARY_STATUS_OPTIONS,
  RECORD_TYPE_META,
  RECORD_TYPES,
  formatCrmDate,
  formatCrmTime,
  isMissingCustomerMigrationError,
  toDateTimeValue,
} from '../lib/crm'
import './CustomerManager.css'

const TABLE = 'customers'
const WORK_DIARY_TABLE = 'work_diary'

const CUSTOMER_ROLES = ['매수', '임차', '매도', '임대', '기타']
const PROPERTY_CATEGORIES = ['공장창고', '상가사무실', '토지', '주거용', '기타']
const CUSTOMER_STATUSES = ['신규', '상담중', '매물추천', '방문예정', '협의중', '계약진행', '완료', '보류']
const MANAGERS = ['주현희', '김정현']

const SORT_OPTIONS = [
  { value: 'priority', label: '연락 우선순' },
  { value: 'created', label: '최근 등록순' },
  { value: 'updated', label: '최근 수정순' },
  { value: 'name', label: '이름순' },
  { value: 'next_contact', label: '다음 연락일순' },
]

const EMPTY_FORM = {
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
}

function formFromCustomer(customer) {
  if (!customer) return EMPTY_FORM
  return {
    name: customer.name || '',
    phone: customer.phone || '',
    customer_role: customer.customer_role || '매수',
    property_category: customer.property_category || '공장창고',
    desired_region: customer.desired_region || '',
    desired_price: customer.desired_price || '',
    desired_area: customer.desired_area || '',
    status: customer.status || '신규',
    next_contact_at: toInputDate(customer.next_contact_at),
    manager: customer.manager || '주현희',
    memo: customer.memo || '',
  }
}

function normalizePhone(value) {
  return (value || '').replace(/\D/g, '')
}

function formatPhone(value) {
  const digits = normalizePhone(value).slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function makeCustomerCode() {
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

function toInputDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isDueTodayOrPast(value) {
  if (!value) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return !Number.isNaN(target.getTime()) && target <= today
}

function priorityWeight(customer) {
  if (customer.next_contact_at && isDueTodayOrPast(customer.next_contact_at)) return 0
  if (customer.next_contact_at) return 1
  if (!['완료', '보류'].includes(customer.status)) return 2
  return 3
}

function sortCustomers(rows, sortMode) {
  const list = [...rows]
  return list.sort((a, b) => {
    if (sortMode === 'created') {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    }
    if (sortMode === 'updated') {
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
    }
    if (sortMode === 'name') {
      return (a.name || '').localeCompare(b.name || '', 'ko')
    }
    if (sortMode === 'next_contact') {
      const aDate = a.next_contact_at ? new Date(a.next_contact_at).getTime() : Number.MAX_SAFE_INTEGER
      const bDate = b.next_contact_at ? new Date(b.next_contact_at).getTime() : Number.MAX_SAFE_INTEGER
      return aDate - bDate
    }
    const weight = priorityWeight(a) - priorityWeight(b)
    if (weight !== 0) return weight
    return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
  })
}

function getMessageText(message) {
  if (!message) return ''
  return typeof message === 'string' ? message : message.text
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function CustomerForm({ selectedCustomer, duplicateWarning, onSubmit, onCancelEdit, saving }) {
  const [form, setForm] = useState(() => formFromCustomer(selectedCustomer))
  const nameRef = useRef(null)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const saved = await onSubmit(form)
    if (saved && !selectedCustomer) {
      setForm(EMPTY_FORM)
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }

  return (
    <form className="cm-form" onSubmit={handleSubmit}>
      <div className="cm-form-head">
        <div>
          <h2>{selectedCustomer ? '고객 정보 수정' : '신규 고객 등록'}</h2>
          <p>{selectedCustomer ? selectedCustomer.customer_code : '저장하면 고객 고유번호가 자동 생성됩니다.'}</p>
        </div>
        {selectedCustomer && (
          <button type="button" className="cm-ghost-button" onClick={onCancelEdit} disabled={saving}>
            취소
          </button>
        )}
      </div>

      <label className="cm-field cm-field-full">
        <span>고객명 또는 별칭 *</span>
        <input
          ref={nameRef}
          type="text"
          value={form.name}
          onChange={(event) => updateField('name', event.target.value)}
          placeholder="예: 김OO 대표, 금촌 공장 고객"
          required
          disabled={saving}
        />
      </label>

      <label className="cm-field">
        <span>전화번호</span>
        <input
          type="tel"
          value={form.phone}
          onChange={(event) => updateField('phone', formatPhone(event.target.value))}
          placeholder="010-0000-0000"
          disabled={saving}
        />
      </label>

      <label className="cm-field">
        <span>고객 유형</span>
        <select value={form.customer_role} onChange={(event) => updateField('customer_role', event.target.value)} disabled={saving}>
          {CUSTOMER_ROLES.map((role) => <option key={role}>{role}</option>)}
        </select>
      </label>

      <label className="cm-field">
        <span>부동산 종류</span>
        <select value={form.property_category} onChange={(event) => updateField('property_category', event.target.value)} disabled={saving}>
          {PROPERTY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>

      <label className="cm-field">
        <span>진행상태</span>
        <select value={form.status} onChange={(event) => updateField('status', event.target.value)} disabled={saving}>
          {CUSTOMER_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
      </label>

      <label className="cm-field">
        <span>희망지역</span>
        <input
          type="text"
          value={form.desired_region}
          onChange={(event) => updateField('desired_region', event.target.value)}
          placeholder="예: 파주, 일산, 김포"
          disabled={saving}
        />
      </label>

      <label className="cm-field">
        <span>희망금액</span>
        <input
          type="text"
          value={form.desired_price}
          onChange={(event) => updateField('desired_price', event.target.value)}
          placeholder="예: 10억 이하, 보증금 5천"
          disabled={saving}
        />
      </label>

      <label className="cm-field">
        <span>희망면적</span>
        <input
          type="text"
          value={form.desired_area}
          onChange={(event) => updateField('desired_area', event.target.value)}
          placeholder="예: 100평 이상"
          disabled={saving}
        />
      </label>

      <label className="cm-field">
        <span>다음 연락일</span>
        <input
          type="date"
          value={form.next_contact_at}
          onChange={(event) => updateField('next_contact_at', event.target.value)}
          disabled={saving}
        />
      </label>

      <label className="cm-field">
        <span>담당자</span>
        <select value={form.manager} onChange={(event) => updateField('manager', event.target.value)} disabled={saving}>
          {MANAGERS.map((manager) => <option key={manager}>{manager}</option>)}
        </select>
      </label>

      <label className="cm-field cm-field-full">
        <span>기본메모</span>
        <textarea
          value={form.memo}
          onChange={(event) => updateField('memo', event.target.value)}
          placeholder="상담 배경, 희망 조건, 주의할 점을 적어두세요."
          disabled={saving}
        />
      </label>

      {duplicateWarning && (
        <div className="cm-warning" role="status">
          동일한 전화번호로 등록된 고객이 있습니다. 필요한 경우 같은 고객인지 확인한 뒤 저장하세요.
        </div>
      )}

      <div className="cm-form-actions">
        <button type="submit" className="cm-primary-button" disabled={saving || !form.name.trim()}>
          {saving ? '저장 중...' : selectedCustomer ? '수정 저장' : '고객 저장'}
        </button>
      </div>
    </form>
  )
}

function CustomerList({ customers, selectedId, loading, searchText, onSelect }) {
  if (loading) {
    return <div className="cm-state">고객 목록을 불러오는 중...</div>
  }

  if (customers.length === 0) {
    return (
      <div className="cm-state">
        <strong>{searchText ? '검색 결과가 없습니다.' : '등록된 고객이 없습니다.'}</strong>
        <span>{searchText ? '검색어와 필터를 조정해보세요.' : '왼쪽 등록 영역에서 첫 고객을 저장하세요.'}</span>
      </div>
    )
  }

  return (
    <div className="cm-list" role="list">
      {customers.map((customer) => {
        const due = isDueTodayOrPast(customer.next_contact_at)
        return (
          <button
            key={customer.id}
            type="button"
            className={`cm-row ${customer.id === selectedId ? 'active' : ''}`}
            onClick={() => onSelect(customer)}
            role="listitem"
          >
            <div className="cm-row-main">
              <strong>{customer.name}</strong>
              <span>{customer.customer_code}</span>
            </div>
            <div className="cm-row-meta">
              <span>{customer.phone || '-'}</span>
              <span>{customer.customer_role || '-'}</span>
              <span>{customer.property_category || '-'}</span>
              <span>{customer.desired_region || '-'}</span>
            </div>
            <div className="cm-row-foot">
              <span className={`cm-status cm-status-${customer.status || '신규'}`}>{customer.status || '신규'}</span>
              <span>{customer.manager || '-'}</span>
              <span className={due ? 'cm-due' : ''}>다음 연락 {formatDate(customer.next_contact_at)}</span>
              <span>수정 {formatDate(customer.updated_at)}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function TimelineItem({ record, onOpenDiaryForCustomer, customer }) {
  const [expanded, setExpanded] = useState(false)
  const content = record.content || ''
  const isLong = content.length > 140
  const visibleContent = !isLong || expanded ? content : `${content.slice(0, 140)}...`
  const recordType = record.record_type || '일반메모'
  const recordTone = RECORD_TYPE_META[recordType]?.tone || 'memo'

  return (
    <article className={`cm-timeline-item status-${record.status || 'normal'}`}>
      <div className="cm-timeline-top">
        <div>
          <strong>{formatCrmDate(record.date)}</strong>
          <span>{formatCrmTime(record.created_at)}</span>
        </div>
        <span className={`cm-record-type tone-${recordTone}`}>{recordType}</span>
      </div>
      <div className="cm-timeline-meta">
        <span>{record.writer || '-'}</span>
        {record.status === 'important' && <span className="cm-timeline-flag important">중요</span>}
        {record.status === 'later' && <span className="cm-timeline-flag later">나중에</span>}
        {record.status === 'done' && <span className="cm-timeline-flag done">완료</span>}
        {record.sticker && <span className="cm-timeline-flag sticker">{record.sticker}</span>}
      </div>
      <p>{visibleContent || '내용 없음'}</p>
      {isLong && (
        <button type="button" className="cm-inline-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '접기' : '더보기'}
        </button>
      )}
      {record.scheduled_at && (
        <div className="cm-next-date">다음 연락: {formatCrmDate(record.scheduled_at)}</div>
      )}
      <button
        type="button"
        className="cm-inline-button"
        onClick={() => onOpenDiaryForCustomer?.(customer, record.date)}
      >
        업무일지에서 보기
      </button>
    </article>
  )
}

function AddRecordForm({ customer, onSaved, onCancel }) {
  const [form, setForm] = useState({
    record_type: '전화상담',
    content: '',
    date: todayInputValue(),
    scheduled_at: '',
    writer: customer.manager || '주현희',
    status: 'normal',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving || !form.content.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        customer_id: customer.id,
        content: form.content.trim(),
        tags: [],
        status: form.status,
        date: form.date || todayInputValue(),
        writer: form.writer || customer.manager || '주현희',
        sticker: null,
        link_key: customer.name ? `고객-${customer.name}` : customer.customer_code,
        record_type: form.record_type || '일반메모',
        priority: form.status === 'important' ? '중요' : '일반',
        scheduled_at: toDateTimeValue(form.scheduled_at),
      }

      const { data, error: insertError } = await supabase
        .from(WORK_DIARY_TABLE)
        .insert(payload)
        .select()
        .single()
      if (insertError) throw insertError

      let updatedCustomer = customer
      if (form.scheduled_at) {
        const { data: updated, error: updateError } = await supabase
          .from(TABLE)
          .update({ next_contact_at: form.scheduled_at })
          .eq('id', customer.id)
          .select()
          .single()
        if (updateError) throw updateError
        updatedCustomer = updated
      }

      onSaved?.(data, updatedCustomer)
      setForm({
        record_type: '전화상담',
        content: '',
        date: todayInputValue(),
        scheduled_at: '',
        writer: customer.manager || '주현희',
        status: 'normal',
      })
    } catch (error) {
      setError(
        isMissingCustomerMigrationError(error)
          ? '업무기록 저장 실패: 007_link_work_diary_to_customers.sql 마이그레이션 적용이 필요합니다.'
          : `업무기록 저장 실패: ${error.message || error}`
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="cm-record-form" onSubmit={handleSubmit}>
      <div className="cm-record-form-grid">
        <label className="cm-field">
          <span>기록 종류</span>
          <select value={form.record_type} onChange={(event) => updateField('record_type', event.target.value)} disabled={saving}>
            {RECORD_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="cm-field">
          <span>기록 날짜</span>
          <input type="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} disabled={saving} />
        </label>
        <label className="cm-field">
          <span>다음 연락일</span>
          <input type="date" value={form.scheduled_at} onChange={(event) => updateField('scheduled_at', event.target.value)} disabled={saving} />
        </label>
        <label className="cm-field">
          <span>담당자</span>
          <select value={form.writer} onChange={(event) => updateField('writer', event.target.value)} disabled={saving}>
            {MANAGERS.map((manager) => <option key={manager}>{manager}</option>)}
          </select>
        </label>
        <label className="cm-field">
          <span>상태</span>
          <select value={form.status} onChange={(event) => updateField('status', event.target.value)} disabled={saving}>
            {DIARY_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <label className="cm-field cm-field-full">
        <span>내용</span>
        <textarea
          value={form.content}
          onChange={(event) => updateField('content', event.target.value)}
          placeholder="상담·방문·연락 내용을 입력하세요."
          disabled={saving}
          required
        />
      </label>
      {error && <div className="cm-record-error" role="alert">{error}</div>}
      <div className="cm-record-actions">
        <button type="button" className="cm-ghost-button" onClick={onCancel} disabled={saving}>취소</button>
        <button type="submit" className="cm-primary-button" disabled={saving || !form.content.trim()}>
          {saving ? '저장 중...' : '기록 저장'}
        </button>
      </div>
    </form>
  )
}

function CustomerDetail({ customer, onEdit, onRecordCreated, onOpenDiaryForCustomer }) {
  const [timeline, setTimeline] = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState('')
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [timelineMessage, setTimelineMessage] = useState('')

  const loadTimeline = useCallback(async () => {
    if (!customer || !isSupabaseConfigured) {
      setTimeline([])
      return
    }
    setTimelineLoading(true)
    setTimelineError('')
    try {
      const { data, error } = await supabase
        .from(WORK_DIARY_TABLE)
        .select('id, customer_id, content, status, date, writer, sticker, link_key, record_type, priority, scheduled_at, completed_at, created_at, updated_at')
        .eq('customer_id', customer.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setTimeline(data || [])
    } catch (error) {
      setTimeline([])
      setTimelineError(
        isMissingCustomerMigrationError(error)
          ? '고객 업무기록을 불러오려면 007_link_work_diary_to_customers.sql 마이그레이션 적용이 필요합니다.'
          : `고객 업무기록 조회 실패: ${error.message || error}`
      )
    } finally {
      setTimelineLoading(false)
    }
  }, [customer])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTimeline()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadTimeline])

  const timelineSummary = useMemo(() => {
    const nextRecord = timeline
      .filter((record) => record.scheduled_at)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0]
    return {
      total: timeline.length,
      recentDate: timeline[0]?.date || null,
      nextDate: nextRecord?.scheduled_at || customer?.next_contact_at || null,
      openCount: timeline.filter((record) => record.status !== 'done').length,
    }
  }, [customer?.next_contact_at, timeline])

  if (!customer) {
    return (
      <aside className="cm-detail cm-detail-empty">
        <h2>고객 상세정보</h2>
        <p>목록에서 고객을 선택하면 상세정보가 표시됩니다.</p>
      </aside>
    )
  }

  const telHref = customer.phone_normalized ? `tel:${customer.phone_normalized}` : undefined
  const TimelineSection = (
    <section className="cm-timeline cm-timeline-featured">
      <div className="cm-timeline-header">
        <div>
          <h3>고객 타임라인</h3>
          <p>업무일지에서 이 고객으로 연결된 상담·방문·연락 기록입니다.</p>
        </div>
        <div className="cm-timeline-actions">
          <button type="button" className="cm-ghost-button cm-small-button" onClick={() => onOpenDiaryForCustomer?.(customer)}>
            업무일지에서 보기
          </button>
          <button type="button" className="cm-primary-button cm-small-button" onClick={() => setShowRecordForm(true)}>
            오늘 기록 추가
          </button>
        </div>
      </div>

      <div className="cm-timeline-summary">
        <span>전체 {timelineSummary.total}</span>
        <span>최근 상담 {formatCrmDate(timelineSummary.recentDate)}</span>
        <span className={isDueTodayOrPast(timelineSummary.nextDate) ? 'cm-due' : ''}>
          다음 연락 {formatCrmDate(timelineSummary.nextDate)}
        </span>
        <span>미완료 {timelineSummary.openCount}</span>
      </div>

      {showRecordForm && (
        <AddRecordForm
          customer={customer}
          onCancel={() => setShowRecordForm(false)}
          onSaved={(record, updatedCustomer) => {
            setShowRecordForm(false)
            setTimelineMessage('업무기록이 저장되었습니다.')
            setTimeline((prev) => [record, ...prev].sort((a, b) => {
              const dateDiff = String(b.date || '').localeCompare(String(a.date || ''))
              if (dateDiff !== 0) return dateDiff
              return new Date(b.created_at || 0) - new Date(a.created_at || 0)
            }))
            onRecordCreated?.(updatedCustomer)
          }}
        />
      )}

      {timelineMessage && (
        <div className="cm-record-success" role="status">
          {timelineMessage}
          <button type="button" onClick={() => setTimelineMessage('')}>×</button>
        </div>
      )}

      {timelineError && <div className="cm-record-error" role="alert">{timelineError}</div>}

      <div className="cm-timeline-list">
        {timelineLoading ? (
          <div className="cm-state">고객 업무기록을 불러오는 중...</div>
        ) : timeline.length === 0 ? (
          <div className="cm-state">
            <strong>아직 연결된 업무기록이 없습니다.</strong>
            <span>위의 추가기록 버튼으로 첫 기록을 남겨보세요.</span>
          </div>
        ) : (
          timeline.map((record) => (
            <TimelineItem
              key={record.id}
              record={record}
              customer={customer}
              onOpenDiaryForCustomer={onOpenDiaryForCustomer}
            />
          ))
        )}
      </div>
    </section>
  )

  return (
    <aside className="cm-detail">
      <div className="cm-detail-head">
        <div>
          <h2>{customer.name}</h2>
          <p>{customer.customer_code}</p>
        </div>
        <div className="cm-detail-head-actions">
          <button type="button" className="cm-ghost-button cm-small-button" onClick={() => onOpenDiaryForCustomer?.(customer)}>
            업무일지에서 보기
          </button>
          <button type="button" className="cm-primary-button cm-small-button" onClick={() => onEdit(customer)}>
            수정
          </button>
        </div>
      </div>

      <div className="cm-detail-call">
        <div>
          <span>전화번호</span>
          <strong>{customer.phone || '-'}</strong>
        </div>
        {telHref && (
          <a className="cm-call-button" href={telHref}>
            전화 걸기
          </a>
        )}
      </div>

      {TimelineSection}

      <dl className="cm-detail-grid">
        <div><dt>고객 유형</dt><dd>{customer.customer_role || '-'}</dd></div>
        <div><dt>부동산 종류</dt><dd>{customer.property_category || '-'}</dd></div>
        <div><dt>희망지역</dt><dd>{customer.desired_region || '-'}</dd></div>
        <div><dt>희망금액</dt><dd>{customer.desired_price || '-'}</dd></div>
        <div><dt>희망면적</dt><dd>{customer.desired_area || '-'}</dd></div>
        <div><dt>진행상태</dt><dd>{customer.status || '-'}</dd></div>
        <div><dt>다음 연락일</dt><dd className={isDueTodayOrPast(customer.next_contact_at) ? 'cm-due' : ''}>{formatDate(customer.next_contact_at)}</dd></div>
        <div><dt>담당자</dt><dd>{customer.manager || '-'}</dd></div>
        <div><dt>등록일</dt><dd>{formatDateTime(customer.created_at)}</dd></div>
        <div><dt>수정일</dt><dd>{formatDateTime(customer.updated_at)}</dd></div>
      </dl>

      <section className="cm-memo-box">
        <h3>기본메모</h3>
        <span>고객의 고정정보를 기록하세요. 상담·방문 내용은 아래 업무기록에 추가하세요.</span>
        <p>{customer.memo || '등록된 메모가 없습니다.'}</p>
      </section>
    </aside>
  )
}

export default function CustomerManager({ initialCustomerId, onOpenDiaryForCustomer }) {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [duplicateWarning, setDuplicateWarning] = useState(false)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [managerFilter, setManagerFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortMode, setSortMode] = useState('priority')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 320)
    return () => clearTimeout(timer)
  }, [searchInput])

  const loadCustomers = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCustomers([])
      return
    }

    setLoading(true)
    setMessage(null)
    try {
      let query = supabase.from(TABLE).select('*').limit(500)

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (managerFilter !== 'all') query = query.eq('manager', managerFilter)
      if (roleFilter !== 'all') query = query.eq('customer_role', roleFilter)
      if (categoryFilter !== 'all') query = query.eq('property_category', categoryFilter)

      if (debouncedSearch) {
        const digits = normalizePhone(debouncedSearch)
        const escaped = debouncedSearch.replace(/[%_,]/g, '')
        const parts = [
          `name.ilike.%${escaped}%`,
          `customer_code.ilike.%${escaped}%`,
          `desired_region.ilike.%${escaped}%`,
          `memo.ilike.%${escaped}%`,
          `phone.ilike.%${escaped}%`,
        ]
        if (digits) parts.push(`phone_normalized.ilike.%${digits}%`)
        query = query.or(parts.join(','))
      }

      const { data, error } = await query.order('updated_at', { ascending: false })
      if (error) throw error

      const sorted = sortCustomers(data || [], sortMode)
      setCustomers(sorted)
      setSelectedCustomer((current) => {
        if (initialCustomerId && (!current || current.id === initialCustomerId)) {
          const focused = sorted.find((customer) => customer.id === initialCustomerId)
          if (focused) return focused
        }
        if (!current) return sorted[0] || null
        return sorted.find((customer) => customer.id === current.id) || sorted[0] || null
      })
    } catch (error) {
      setCustomers([])
      setMessage({ type: 'error', text: `고객 목록을 불러오지 못했습니다: ${error.message || error}` })
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, debouncedSearch, initialCustomerId, managerFilter, roleFilter, sortMode, statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadCustomers])

  const stats = useMemo(() => {
    return {
      total: customers.length,
      due: customers.filter((customer) => isDueTodayOrPast(customer.next_contact_at)).length,
      active: customers.filter((customer) => !['완료', '보류'].includes(customer.status)).length,
    }
  }, [customers])

  async function checkDuplicatePhone(phoneDigits, currentId) {
    if (!phoneDigits || !isSupabaseConfigured) return false
    let query = supabase.from(TABLE).select('id').eq('phone_normalized', phoneDigits).limit(1)
    if (currentId) query = query.neq('id', currentId)
    const { data, error } = await query
    if (error) return false
    return (data || []).length > 0
  }

  async function handleSave(form) {
    if (saving) return false
    if (!isSupabaseConfigured) {
      setMessage({ type: 'error', text: 'Supabase 환경변수가 설정되지 않아 고객을 저장할 수 없습니다.' })
      return false
    }

    const name = form.name.trim()
    if (!name) return false

    setSaving(true)
    setMessage(null)
    try {
      const phoneNormalized = normalizePhone(form.phone)
      const isDuplicate = await checkDuplicatePhone(phoneNormalized, editingCustomer?.id)
      setDuplicateWarning(isDuplicate)

      const payload = {
        name,
        phone: form.phone.trim() || null,
        phone_normalized: phoneNormalized || null,
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

      let saved
      if (editingCustomer) {
        const { data, error } = await supabase
          .from(TABLE)
          .update(payload)
          .eq('id', editingCustomer.id)
          .select()
          .single()
        if (error) throw error
        saved = data
        setMessage({ type: 'success', text: `${saved.name} 고객 정보가 수정되었습니다.` })
      } else {
        const { data, error } = await supabase
          .from(TABLE)
          .insert({ ...payload, customer_code: makeCustomerCode() })
          .select()
          .single()
        if (error) throw error
        saved = data
        setMessage({ type: 'success', text: `${saved.customer_code} 고객이 등록되었습니다.` })
      }

      setEditingCustomer(null)
      setSelectedCustomer(saved)
      await loadCustomers()
      return true
    } catch (error) {
      setMessage({ type: 'error', text: `저장에 실패했습니다: ${error.message || error}` })
      return false
    } finally {
      setSaving(false)
    }
  }

  function startEdit(customer) {
    setEditingCustomer(customer)
    setDuplicateWarning(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSelect(customer) {
    setSelectedCustomer(customer)
  }

  function handleRecordCreated(updatedCustomer) {
    if (updatedCustomer?.id) {
      setSelectedCustomer(updatedCustomer)
      setCustomers((prev) =>
        sortCustomers(
          prev.map((customer) => (customer.id === updatedCustomer.id ? updatedCustomer : customer)),
          sortMode
        )
      )
    }
    loadCustomers()
  }

  return (
    <div className="cm-app">
      <header className="cm-header">
        <div className="cm-brand">
          <div className="cm-brand-mark">C</div>
          <div>
            <h1>고객관리</h1>
            <p>고객·매물·일정 연결을 위한 CRM 기반</p>
          </div>
        </div>
        <div className="cm-summary">
          <span>표시 {stats.total}</span>
          <span>연락 필요 {stats.due}</span>
          <span>진행중 {stats.active}</span>
        </div>
      </header>

      {!isSupabaseConfigured && (
        <div className="cm-notice" role="alert">
          Supabase URL 또는 anon key가 설정되지 않았습니다. 고객 목록 조회와 저장은 환경변수 설정 후 동작합니다.
        </div>
      )}

      {message && (
        <div className={`cm-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {getMessageText(message)}
          <button type="button" onClick={() => setMessage(null)} aria-label="메시지 닫기">×</button>
        </div>
      )}

      <main className="cm-main">
        <section className="cm-left">
          <CustomerForm
            key={editingCustomer?.id || 'new-customer'}
            selectedCustomer={editingCustomer}
            duplicateWarning={duplicateWarning}
            onSubmit={handleSave}
            onCancelEdit={() => {
              setEditingCustomer(null)
              setDuplicateWarning(false)
            }}
            saving={saving}
          />
        </section>

        <section className="cm-center" aria-label="고객 목록">
          <div className="cm-toolbar">
            <label className="cm-search">
              <span>검색</span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="이름, 고객번호, 전화번호, 지역, 메모"
              />
            </label>
            <div className="cm-filters">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="상태 필터">
                <option value="all">상태 전체</option>
                {CUSTOMER_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
              <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} aria-label="담당자 필터">
                <option value="all">담당 전체</option>
                {MANAGERS.map((manager) => <option key={manager}>{manager}</option>)}
              </select>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="고객 유형 필터">
                <option value="all">유형 전체</option>
                {CUSTOMER_ROLES.map((role) => <option key={role}>{role}</option>)}
              </select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="부동산 종류 필터">
                <option value="all">부동산 전체</option>
                {PROPERTY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="정렬">
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>

          <CustomerList
            customers={customers}
            selectedId={selectedCustomer?.id}
            loading={loading}
            searchText={debouncedSearch}
            onSelect={handleSelect}
          />
        </section>

        <CustomerDetail
          customer={selectedCustomer}
          onEdit={startEdit}
          onRecordCreated={handleRecordCreated}
          onOpenDiaryForCustomer={onOpenDiaryForCustomer}
        />
      </main>
    </div>
  )
}
