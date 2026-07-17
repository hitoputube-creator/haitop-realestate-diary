import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { RECORD_TYPE_META, RECORD_TYPES, normalizePhone } from '../lib/crm'
import { UnifiedCustomerResults } from './customer/CustomerWorkflow'
import { AttachmentList, AttachmentUploader, PendingAttachmentPicker } from './attachments/AttachmentManager'

/* ===== 스티커 메타 ===== */
export const STICKER_META = {
  '계약': { color: '#C9A84C' },
  '잔금': { color: '#E74C3C' },
  '약속': { color: '#3498DB' },
  '내부': { color: '#27AE60' },
  '기타': { color: '#95A5A6' },
}

const STICKER_OPTIONS = [
  { value: null,   label: '없음' },
  { value: '계약', label: '계약' },
  { value: '잔금', label: '잔금' },
  { value: '약속', label: '약속' },
  { value: '내부', label: '내부' },
  { value: '기타', label: '기타' },
]

/* ===== 헬퍼 ===== */
const TAG_REGEX = /#[\w가-힣]+/g

export function extractTags(text) {
  if (!text) return []
  const matches = text.match(TAG_REGEX) || []
  // # 제외, 중복 제거
  return Array.from(new Set(matches.map((t) => t.slice(1))))
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}:${m}`
}

function formatDateLabel(iso, fullFormat = false) {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  if (fullFormat) {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

function formatCustomerOption(customer) {
  if (!customer) return ''
  const details = [customer.phone, customer.customer_code].filter(Boolean).join(' · ')
  const category = [customer.property_category, customer.customer_role].filter(Boolean).join(' · ')
  return `${customer.name || '이름 없음'}${details ? ` / ${details}` : ''}${category ? ` / ${category}` : ''}`
}

/* ===== 상태 배지 ===== */
const STATUS_META = {
  normal: { label: '일반', icon: null },
  important: { label: '중요', icon: '★' },
  later: { label: '나중에', icon: '◉' },
  done: { label: '완료', icon: '✓' },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.normal
  if (status === 'normal') return null // 일반은 배지 숨김
  return (
    <span className={`wd-badge ${status}`}>
      {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
      {meta.label}
    </span>
  )
}

/* ===== 메모 카드 ===== */
function MemoCard({
  memo,
  customer,
  attachments,
  onCustomerClick,
  onChangeStatus,
  onDelete,
  onUpdateContent,
  showDate,
  onLinkKeyClick,
  onUpdateLinkKey,
  allLinkKeys,
  isPinned,
  onPin,
  onUnpin,
  isHighlighted,
  onNavigate,
  onExistingAttachmentsUploaded,
  onAttachmentDeleted,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(memo.content)
  const taRef = useRef(null)
  const cardRef = useRef(null)

  // 연결태그 인라인 편집 상태
  const [linkEditing, setLinkEditing] = useState(false)
  const [linkDraft, setLinkDraft] = useState(memo.link_key || '')
  const [linkSaving, setLinkSaving] = useState(false)
  const linkInputRef = useRef(null)

  useEffect(() => {
    setLinkDraft(memo.link_key || '')
  }, [memo.link_key])

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  useEffect(() => {
    if (linkEditing && linkInputRef.current) {
      linkInputRef.current.focus()
      linkInputRef.current.select()
    }
  }, [linkEditing])

  async function saveLinkKey() {
    if (linkSaving) return
    setLinkSaving(true)
    try {
      await onUpdateLinkKey(memo.id, linkDraft.trim())
      setLinkEditing(false)
    } finally {
      setLinkSaving(false)
    }
  }

  function autoResize(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(150, el.scrollHeight)}px`
  }

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      taRef.current.setSelectionRange(draft.length, draft.length)
      autoResize(taRef.current)
    }
  }, [editing])

  useEffect(() => {
    setDraft(memo.content)
  }, [memo.content])

  const tags = memo.tags && memo.tags.length ? memo.tags : extractTags(memo.content)

  const stickerMeta = memo.sticker ? STICKER_META[memo.sticker] : null
  const recordType = memo.record_type || '일반메모'
  const recordTone = RECORD_TYPE_META[recordType]?.tone || 'memo'

  const cls = ['wd-card', `status-${memo.status || 'normal'}`, editing && 'editing', isHighlighted && 'wd-card-highlighted']
    .filter(Boolean)
    .join(' ')

  function saveEdit() {
    const next = draft.trim()
    if (!next) return
    if (next === memo.content) {
      setEditing(false)
      return
    }
    onUpdateContent(memo.id, next)
    setEditing(false)
  }

  return (
    <article ref={cardRef} className={cls} aria-label="메모">
      <div className="wd-card-top">
        <div className="wd-card-meta">
          <span className="wd-card-time">{formatTime(memo.created_at)}</span>
          <span className="wd-card-writer" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
            · {memo.writer || '주현희'}
          </span>
          {showDate && <span className="wd-card-date">· {formatDateLabel(memo.date, true)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {memo.record_type && (
            <span className={`wd-record-type tone-${recordTone}`}>
              {recordType}
            </span>
          )}
          {memo.link_key ? (
            <>
              <button
                type="button"
                className="wd-link-badge"
                onClick={(e) => { e.stopPropagation(); onLinkKeyClick && onLinkKeyClick(memo.link_key) }}
                title={`연결태그 메모 보기: ${memo.link_key}`}
              >
                🔗 {memo.link_key}
              </button>
              {!editing && (
                <button
                  type="button"
                  className="wd-link-edit-btn"
                  onClick={() => setLinkEditing(true)}
                  title="연결태그 수정"
                >
                  수정
                </button>
              )}
            </>
          ) : null}
          {stickerMeta && (
            <span
              className="wd-sticker-badge"
              style={{ background: stickerMeta.color }}
            >
              {memo.sticker}
            </span>
          )}
          <StatusBadge status={memo.status || 'normal'} />
        </div>
      </div>

      {memo.customer_id && (
        <button
          type="button"
          className="wd-customer-badge"
          onClick={(e) => {
            e.stopPropagation()
            onCustomerClick?.(memo.customer_id)
          }}
          title="고객관리에서 보기"
        >
          <span>고객</span>
          <strong>{customer?.name || '연결 고객 없음'}</strong>
          <em>{customer?.customer_code || memo.customer_id}</em>
        </button>
      )}

      {/* 연결태그 인라인 편집 */}
      {linkEditing && (
        <div className="wd-link-inline-editor">
          <span className="wd-link-inline-label">연결태그</span>
          <input
            ref={linkInputRef}
            list="wd-link-key-datalist-card"
            className="wd-link-inline-input"
            placeholder="예: 금승리67-6, 공장손님-김OO"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveLinkKey() }
              if (e.key === 'Escape') { setLinkDraft(memo.link_key || ''); setLinkEditing(false) }
            }}
            disabled={linkSaving}
          />
          <datalist id="wd-link-key-datalist-card">
            {(allLinkKeys || []).map((k) => <option key={k} value={k} />)}
          </datalist>
          <button
            type="button"
            className="wd-link-inline-save"
            onClick={saveLinkKey}
            disabled={linkSaving}
          >
            {linkSaving ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            className="wd-link-inline-cancel"
            onClick={() => { setLinkDraft(memo.link_key || ''); setLinkEditing(false) }}
            disabled={linkSaving}
          >
            취소
          </button>
          {/* 내용 수정창이 없을 때는 link 에디터 바 안에 인라인 표시 */}
          {!editing && (
            <LinkKeySearchBox
              currentValue={linkDraft}
              onSelect={setLinkDraft}
              disabled={linkSaving}
              variant="inline"
            />
          )}
        </div>
      )}

      <div
        className={`wd-card-content${showDate && onNavigate ? ' wd-card-content--navigable' : ''}`}
        onClick={showDate && onNavigate && !editing ? () => onNavigate(memo.date, memo.id) : undefined}
        title={showDate && onNavigate ? '클릭하면 해당 날짜로 이동합니다' : undefined}
      >
        {memo.content}
      </div>

      {memo.scheduled_at && !editing && (
        <div className="wd-scheduled-at">
          다음 연락: {formatDateLabel(memo.scheduled_at, true)}
        </div>
      )}

      {!editing && attachments?.length > 0 && (
        <div className="wd-card-attachments">
          <AttachmentList
            attachments={attachments}
            compact
            onDeleted={onAttachmentDeleted}
          />
        </div>
      )}

      {editing && (
        <>
          {linkEditing && (
            <div className="wd-composer-tools-row">
              <LinkKeySearchBox
                currentValue={linkDraft}
                onSelect={setLinkDraft}
                disabled={linkSaving}
              />
            </div>
          )}
          <div className="wd-card-edit-wrap">
            <textarea
              ref={taRef}
              className="wd-card-edit"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                autoResize(e.target)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft(memo.content)
                  setEditing(false)
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  saveEdit()
                }
              }}
            />
          </div>
        </>
      )}

      {tags.length > 0 && !editing && (
        <div className="wd-card-tags">
          {tags.map((t) => (
            <span key={t} className="wd-tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="wd-card-actions">
        {!editing ? (
          <>
            {/* 포스트잇 추가/해제 */}
            <button
              type="button"
              className={`wd-action-btn wd-pin-btn ${isPinned ? 'pinned' : ''}`}
              onClick={() => isPinned ? onUnpin && onUnpin(memo.id) : onPin && onPin(memo.id)}
              title={isPinned ? '포스트잇 해제' : '달력 아래에 고정'}
            >
              {isPinned ? '📌 포스트잇 해제' : '📌 포스트잇 추가'}
            </button>
            <AttachmentUploader
              customerId={memo.customer_id || null}
              workDiaryId={memo.id}
              uploadedBy={memo.writer || '주현희'}
              buttonLabel="파일 추가"
              onUploaded={(rows) => onExistingAttachmentsUploaded?.(memo, rows)}
            />
            {!memo.link_key && !linkEditing && (
              <button
                type="button"
                className="wd-action-btn wd-link-add-btn"
                onClick={() => setLinkEditing(true)}
              >
                🔗 연결태그 추가
              </button>
            )}
            <button
              type="button"
              className={`wd-action-btn ${memo.status === 'important' ? 'active' : ''}`}
              onClick={() =>
                onChangeStatus(memo.id, memo.status === 'important' ? 'normal' : 'important')
              }
              aria-pressed={memo.status === 'important'}
            >
              <span aria-hidden="true">★</span> 중요
            </button>
            <button
              type="button"
              className={`wd-action-btn later ${memo.status === 'later' ? 'active later' : ''}`}
              onClick={() =>
                onChangeStatus(memo.id, memo.status === 'later' ? 'normal' : 'later')
              }
              aria-pressed={memo.status === 'later'}
            >
              <span aria-hidden="true">◉</span> 나중에
            </button>
            <button
              type="button"
              className={`wd-action-btn done ${memo.status === 'done' ? 'active done' : ''}`}
              onClick={() =>
                onChangeStatus(memo.id, memo.status === 'done' ? 'normal' : 'done')
              }
              aria-pressed={memo.status === 'done'}
            >
              <span aria-hidden="true">✓</span> 완료
            </button>
            <span className="wd-action-spacer" />
            <button
              type="button"
              className="wd-action-btn send-property"
              onClick={() => {
                const encoded = encodeURIComponent(memo.content)
                window.location.href = `https://hitoputube-creator.github.io/haitop-realty-system/?memo=${encoded}`
              }}
              aria-label="매물관리 프로그램으로 이동"
            >
              <span aria-hidden="true">🏠</span> 매물보내기
            </button>
            <button
              type="button"
              className="wd-action-btn"
              onClick={() => setEditing(true)}
              aria-label="메모 수정"
            >
              수정
            </button>
            <button
              type="button"
              className="wd-action-btn danger"
              onClick={() => {
                if (window.confirm('이 메모를 삭제하시겠어요?')) onDelete(memo.id)
              }}
              aria-label="메모 삭제"
            >
              삭제
            </button>
          </>
        ) : (
          <>
            <span className="wd-action-spacer" />
            <button
              type="button"
              className="wd-action-btn"
              onClick={() => {
                setDraft(memo.content)
                setEditing(false)
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="wd-action-btn active"
              onClick={saveEdit}
            >
              저장
            </button>
          </>
        )}
      </div>
    </article>
  )
}

/* ===== 연결태그 검색박스 ===== */
// variant: "topright" = textarea 오른쪽 상단 absolute | "inline" = flex 바 내 인라인
function LinkKeySearchBox({ currentValue, onSelect, disabled, variant = 'topright', onNavigate }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen]         = useState(false)
  const wrapRef  = useRef(null)
  const timerRef = useRef(null)

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const doSearch = useCallback(async (q) => {
    const trimmed = q.trim()
    if (!trimmed || !isSupabaseConfigured) { setResults([]); setOpen(false); return }
    setSearching(true)
    try {
      const normQ = trimmed.replace(/[\s_]+/g, '')
      const orParts = [
        `content.ilike.%${trimmed}%`,
        `link_key.ilike.%${trimmed}%`,
        `writer.ilike.%${trimmed}%`,
      ]
      if (normQ && normQ !== trimmed) {
        orParts.push(`content.ilike.%${normQ}%`, `link_key.ilike.%${normQ}%`)
      }

      const { data: diaryRows } = await supabase
        .from('work_diary')
        .select('id, content, link_key, writer, date, created_at')
        .or(orParts.join(','))
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      const rows = diaryRows || []
      setResults(rows)
      setOpen(rows.length > 0)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => doSearch(q), 280)
  }

  function appendTag(tag) {
    const trimTag = tag.trim()
    if (!trimTag) return
    const existing = currentValue
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (existing.includes(trimTag)) return // 중복 방지
    const next = existing.length ? existing.join(', ') + ', ' + trimTag : trimTag
    onSelect(next)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function handleResultClick(row) {
    setQuery('')
    setResults([])
    setOpen(false)
    // onNavigate가 있으면 해당 날짜로 이동 + 하이라이트
    if (onNavigate && row.date) {
      onNavigate(row.date, row.id)
    } else {
      // fallback: 기존 link_key 태그 추가 방식
      const tag = row.link_key
        ? row.link_key.trim()
        : (row.content || '').slice(0, 20).trim()
      appendTag(tag)
    }
  }

  function formatSnippet(content) {
    if (!content) return ''
    return content.length > 60 ? content.slice(0, 60) + '…' : content
  }

  function formatDate(dateStr, isoFallback) {
    const src = dateStr || isoFallback
    if (!src) return ''
    const d = new Date(src.includes('T') ? src : src + 'T00:00:00')
    if (isNaN(d)) return src
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className={`lks-wrap lks-wrap--${variant}`} ref={wrapRef}>
      <div className="lks-input-row">
        <span className="lks-icon">🔍</span>
        <input
          className="lks-input"
          placeholder="연결할 메모·매물·사람 검색"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          autoComplete="off"
        />
        {searching && <span className="lks-spinner">…</span>}
        {query && !searching && (
          <button
            type="button"
            className="lks-clear"
            onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
          >✕</button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="lks-dropdown" role="listbox">
          {results.map((row) => (
            <li
              key={row.id}
              className="lks-item"
              role="option"
              onMouseDown={(e) => { e.preventDefault(); handleResultClick(row) }}
            >
              <div className="lks-item-top">
                {row.link_key && (
                  <span className="lks-item-tag">🔗 {row.link_key}</span>
                )}
                <span className="lks-item-meta">
                  {row.writer || '?'} · {formatDate(row.date, row.created_at)}
                </span>
              </div>
              <div className="lks-item-content">{formatSnippet(row.content)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── 작성 중인 메모 임시저장 (탭 전환/새로고침에도 유지) ── */
const COMPOSER_DRAFT_KEY = 'wd_composer_draft'

function loadComposerDraft() {
  try {
    const raw = sessionStorage.getItem(COMPOSER_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function saveComposerDraft(draft) {
  try {
    sessionStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // 저장 실패해도 작성은 계속 가능해야 하므로 무시
  }
}

function clearComposerDraft() {
  try {
    sessionStorage.removeItem(COMPOSER_DRAFT_KEY)
  } catch {
    // 무시
  }
}

function CustomerSearchBox({ selectedCustomer, onSelect, onClear, disabled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchCustomers = useCallback(async (value) => {
    const trimmed = value.trim()
    if (!trimmed || !isSupabaseConfigured) {
      setResults([])
      setOpen(false)
      return
    }
    setSearching(true)
    setError('')
    try {
      const digits = normalizePhone(trimmed)
      const escaped = trimmed.replace(/[%_,]/g, '')
      const parts = [
        `name.ilike.%${escaped}%`,
        `customer_code.ilike.%${escaped}%`,
        `desired_region.ilike.%${escaped}%`,
      ]
      if (digits) parts.push(`phone_normalized.ilike.%${digits}%`, `phone.ilike.%${escaped}%`)

      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_code, name, phone, phone_normalized, customer_role, property_category, desired_region')
        .or(parts.join(','))
        .order('updated_at', { ascending: false })
        .limit(20)
      if (error) throw error
      setResults(data || [])
      setOpen((data || []).length > 0)
    } catch (error) {
      setResults([])
      setOpen(false)
      setError(`고객 검색 실패: ${error.message || error}`)
    } finally {
      setSearching(false)
    }
  }, [])

  function handleChange(event) {
    const next = event.target.value
    setQuery(next)
    clearTimeout(timerRef.current)
    if (!next.trim()) {
      setResults([])
      setOpen(false)
      setError('')
      return
    }
    timerRef.current = setTimeout(() => searchCustomers(next), 300)
  }

  return (
    <div className="wd-customer-select" ref={wrapRef}>
      <div className="wd-customer-select-head">
        <span>고객 연결</span>
        {selectedCustomer && (
          <button type="button" onClick={onClear} disabled={disabled}>
            선택 해제
          </button>
        )}
      </div>
      {selectedCustomer ? (
        <button type="button" className="wd-selected-customer" onClick={() => setOpen(false)} disabled={disabled}>
          <strong>{selectedCustomer.name}</strong>
          <span>{selectedCustomer.customer_code}</span>
        </button>
      ) : (
        <div className="wd-customer-search-row">
          <input
            type="search"
            value={query}
            onChange={handleChange}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="고객명, 고객번호, 전화번호 검색"
            disabled={disabled}
            autoComplete="off"
          />
          {searching && <span>...</span>}
        </div>
      )}
      {error && <div className="wd-customer-search-error">{error}</div>}
      {open && results.length > 0 && !selectedCustomer && (
        <ul className="wd-customer-results" role="listbox">
          {results.map((customer) => (
            <li key={customer.id} role="option">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(customer)
                  setQuery('')
                  setResults([])
                  setOpen(false)
                }}
              >
                <strong>{customer.name}</strong>
                <span>{formatCustomerOption(customer)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ===== 입력창 (Composer) ===== */
function Composer({
  onSubmit,
  disabled,
  allLinkKeys,
  onNavigate,
  activeCustomer,
  onSelectCustomer,
  onClearActiveCustomer,
}) {
  const initialDraft = useMemo(() => loadComposerDraft(), [])
  const [value, setValue] = useState(initialDraft?.value ?? '')
  const [writer, setWriter] = useState(initialDraft?.writer ?? '주현희')
  const [sticker, setSticker] = useState(initialDraft?.sticker ?? null)
  const [linkKey, setLinkKey] = useState(initialDraft?.linkKey ?? '')
  const [selectedCustomer, setSelectedCustomer] = useState(initialDraft?.selectedCustomer ?? null)
  const [recordType, setRecordType] = useState(initialDraft?.recordType ?? '일반메모')
  const [scheduledAt, setScheduledAt] = useState(initialDraft?.scheduledAt ?? '')
  const [pendingFiles, setPendingFiles] = useState([])
  const [attachmentResults, setAttachmentResults] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const composerRef = useRef(null)
  const effectiveCustomer = activeCustomer || selectedCustomer
  const effectiveRecordType = effectiveCustomer && recordType === '일반메모' ? '전화상담' : recordType

  // 입력값을 sessionStorage에 계속 동기화 — 완전히 빈 상태면 임시저장을 지운다
  useEffect(() => {
    const isEmpty = !value.trim() && !linkKey.trim() && !sticker && !effectiveCustomer && recordType === '일반메모' && !scheduledAt
    if (isEmpty) {
      clearComposerDraft()
    } else {
      saveComposerDraft({ value, writer, sticker, linkKey, selectedCustomer: activeCustomer ? null : selectedCustomer, recordType, scheduledAt })
    }
  }, [activeCustomer, effectiveCustomer, value, writer, sticker, linkKey, selectedCustomer, recordType, scheduledAt])

  // 최초 마운트 시 저장된 값 기준으로 textarea 높이 복원
  useEffect(() => {
    autoResizeComposer(composerRef.current)
  }, [])

  function autoResizeComposer(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(150, el.scrollHeight)}px`
  }

  async function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const result = await onSubmit(trimmed, writer, sticker, linkKey.trim(), effectiveCustomer, effectiveRecordType, scheduledAt, pendingFiles)
      setAttachmentResults(result?.attachmentResults || [])
      setValue('')
      setSticker(null)
      setLinkKey('')
      if (!activeCustomer) setSelectedCustomer(null)
      setRecordType('일반메모')
      setScheduledAt('')
      setPendingFiles([])
      if (composerRef.current) composerRef.current.style.height = '150px'
    } finally {
      setSubmitting(false)
    }
  }

  const previewTags = extractTags(value)

  return (
    <div className="wd-composer">
      <div className="wd-crm-row">
        <CustomerSearchBox
          selectedCustomer={effectiveCustomer}
          onSelect={(customer) => {
            setSelectedCustomer(customer)
            onSelectCustomer?.(customer)
          }}
          onClear={() => {
            if (activeCustomer) onClearActiveCustomer?.()
            setSelectedCustomer(null)
          }}
          disabled={disabled || submitting}
        />
        <label className="wd-record-select">
          <span>기록 종류</span>
          <select
            value={effectiveRecordType}
            onChange={(event) => setRecordType(event.target.value)}
            disabled={disabled || submitting}
          >
            {RECORD_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
      </div>
      {effectiveCustomer && (
        <div className="wd-selected-customer-strip">
          <div>
            <span>선택 고객</span>
            <strong>{effectiveCustomer.name}</strong>
            <em>{effectiveCustomer.customer_code}</em>
          </div>
          <label>
            <span>다음 연락일</span>
            <input
              type="date"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              disabled={disabled || submitting}
            />
          </label>
        </div>
      )}
      <div className="wd-composer-tools-row">
        <LinkKeySearchBox
          currentValue={linkKey}
          onSelect={setLinkKey}
          disabled={disabled || submitting}
          onNavigate={onNavigate}
        />
      </div>
      <div className="wd-composer-input-wrap">
        <textarea
          ref={composerRef}
          className="wd-composer-input"
          placeholder="이 날짜에 메모를 남겨보세요. #태그를 포함하면 자동으로 분류됩니다."
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            autoResizeComposer(e.target)
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
          disabled={disabled || submitting}
        />
      </div>

      <div className="wd-composer-attachments">
        <PendingAttachmentPicker
          onFilesChange={setPendingFiles}
          disabled={disabled || submitting}
        />
        {pendingFiles.length > 0 && (
          <div className="wd-attachment-hint">
            기록 저장 후 첨부파일 {pendingFiles.length}개를 업로드합니다.
          </div>
        )}
        {attachmentResults.length > 0 && (
          <div className="wd-attachment-result">
            {attachmentResults.map((result, index) => (
              <div key={index} className={result.status === 'success' ? 'success' : 'failed'}>
                {result.status === 'success'
                  ? `${result.file.name} 첨부 완료`
                  : `${result.file?.name || '파일'} 첨부 실패: ${result.error}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 스티커 선택 */}
      <div className="wd-sticker-bar">
        <span className="wd-sticker-bar-label">스티커</span>
        {STICKER_OPTIONS.map((opt) => {
          const isActive = sticker === opt.value
          const meta = opt.value ? STICKER_META[opt.value] : null
          return (
            <button
              key={opt.value ?? 'none'}
              type="button"
              className={`wd-sticker-btn ${isActive ? 'active' : ''}`}
              style={
                meta
                  ? isActive
                    ? { background: meta.color, borderColor: meta.color, color: '#fff' }
                    : { borderColor: meta.color + '88', color: meta.color }
                  : {}
              }
              onClick={() => setSticker(isActive && opt.value !== null ? null : opt.value)}
              disabled={disabled || submitting}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* 연결태그 입력 */}
      <div className="wd-link-bar">
        <span className="wd-link-bar-label">연결태그</span>
        <input
          list="wd-link-key-datalist"
          className="wd-link-input"
          placeholder="예: 금승리67-6, 공장손님-김OO"
          value={linkKey}
          onChange={(e) => setLinkKey(e.target.value)}
          disabled={disabled || submitting}
        />
        <datalist id="wd-link-key-datalist">
          {(allLinkKeys || []).map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        {linkKey && (
          <button
            type="button"
            className="wd-link-clear-btn"
            onClick={() => setLinkKey('')}
            disabled={disabled || submitting}
            aria-label="연결태그 초기화"
          >
            ✕
          </button>
        )}
      </div>
      <div className="wd-link-hint">같은 손님·매물·계약 건을 묶는 이름입니다.</div>

      <div className="wd-composer-bar">
        <div className="wd-composer-hint">
          <code>Cmd/Ctrl + Enter</code> 로 저장
          {previewTags.length > 0 && (
            <span style={{ marginLeft: 12 }}>
              감지된 태그: {previewTags.map((t) => `#${t}`).join(' ')}
            </span>
          )}
        </div>
        <div className="wd-composer-actions-right">
          <select
            className="wd-composer-writer-select"
            value={writer}
            onChange={(e) => setWriter(e.target.value)}
            disabled={disabled || submitting}
          >
            <option value="주현희">주현희</option>
            <option value="김정현">김정현</option>
          </select>
          <button
            type="button"
            className="wd-btn wd-btn-primary"
            onClick={handleSubmit}
            disabled={disabled || submitting || !value.trim()}
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ===== 다이어리 리스트 메인 ===== */
export default function DiaryList({
  selectedDate,
  memos,
  loading,
  error,
  searchMode,
  searchQuery,
  onCreate,
  onChangeStatus,
  onDelete,
  onUpdateContent,
  onUpdateLinkKey,
  composerDisabled,
  allLinkKeys,
  onLinkKeyClick,
  pinnedDiaryIds,
  onPin,
  onUnpin,
  onNavigate,
  highlightMemoId,
  customerResults,
  customerMap,
  onCustomerClick,
  onSearchCustomerClick,
  customerFilter,
  onClearCustomerFilter,
  selectedCustomer,
  onSelectCustomer,
  onClearSelectedCustomer,
  recordScope,
  attachmentsByDiary,
  onExistingAttachmentsUploaded,
  onAttachmentDeleted,
}) {
  const dateLabel = selectedDate
    ? `${selectedDate.getFullYear()}년 ${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`
    : ''

  const weekdayLabel = selectedDate
    ? ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][
        selectedDate.getDay()
      ]
    : ''

  const importantCount = memos.filter((m) => m.status === 'important').length
  const doneCount = memos.filter((m) => m.status === 'done').length
  const textSearchActive = Boolean(searchQuery?.trim())

  return (
    <section className="wd-panel wd-diary" aria-label="메모 목록">
      {!searchMode && (
        <header className="wd-diary-header">
          <div className="wd-diary-date">{dateLabel}</div>
          <div className="wd-diary-date-sub">{weekdayLabel}</div>
          <div className="wd-diary-stats">
            <span>
              <span className="wd-stat-num">{memos.length}</span>건
            </span>
            <span>
              중요 <span className="wd-stat-num">{importantCount}</span>
            </span>
            <span>
              완료 <span className="wd-stat-num">{doneCount}</span>
            </span>
          </div>
        </header>
      )}

      {searchMode && (
        <div className="wd-search-result-banner">
          <div className="wd-search-result-title">
            <span className="wd-search-result-label">{customerFilter?.id ? '고객 업무기록' : '검색 결과'}</span>
            {customerFilter?.id ? (
              <span className="wd-search-result-keyword">
                {customerFilter.name || customerFilter.customer_code}
              </span>
            ) : searchQuery && (
              <span className="wd-search-result-keyword">"{searchQuery.trim()}"</span>
            )}
            <span className="wd-search-result-count-wrap">
              총 <strong>{memos.length}</strong>건
              {memos.length >= 100 && (
                <span className="wd-search-result-cap"> (상위 100건 표시)</span>
              )}
            </span>
          </div>
          <span className="wd-search-result-hint">
            {customerFilter?.id
              ? recordScope === 'customer'
                ? 'customer_id 기준으로 정확히 연결된 기록만 표시합니다.'
                : '전체 업무기록 모드입니다.'
              : '검색어를 지우거나 ✕를 누르면 날짜별 일지로 돌아갑니다'}
          </span>
          {customerFilter?.id && (
            <button type="button" className="wd-clear-customer-filter" onClick={onClearCustomerFilter}>
              고객 필터 해제
            </button>
          )}
        </div>
      )}

      {!textSearchActive && (
        <Composer
          onSubmit={(content, writer, sticker, linkKey, selectedCustomer, recordType, scheduledAt, pendingFiles) =>
            onCreate(content, writer, sticker, linkKey, selectedCustomer, recordType, scheduledAt, pendingFiles)}
          disabled={composerDisabled}
          allLinkKeys={allLinkKeys}
          onNavigate={onNavigate}
          activeCustomer={selectedCustomer}
          onSelectCustomer={onSelectCustomer}
          onClearActiveCustomer={onClearSelectedCustomer}
        />
      )}

      {error && <div className="wd-error" role="alert">{error}</div>}

      {textSearchActive && (
        <UnifiedCustomerResults
          customers={customerResults || []}
          onSelectCustomer={onSearchCustomerClick}
        />
      )}

      <div className="wd-list">
        {loading ? (
          <div className="wd-loading">불러오는 중...</div>
        ) : memos.length === 0 ? (
          <div className="wd-empty">
            <div className="wd-empty-icon" aria-hidden="true">
              {searchMode ? '○' : '✎'}
            </div>
            <div className="wd-empty-title">
              {searchMode ? '검색 결과가 없습니다' : '아직 메모가 없습니다'}
            </div>
            <div className="wd-empty-sub">
              {searchMode
                ? '다른 키워드로 검색해보세요.'
                : '위쪽 입력창에 첫 메모를 남겨보세요.'}
            </div>
          </div>
        ) : (
          memos.map((m) => (
            <MemoCard
              key={m.id}
              memo={m}
              customer={m.customer_id ? customerMap?.[m.customer_id] : null}
              attachments={attachmentsByDiary?.[m.id] || []}
              onCustomerClick={onCustomerClick}
              showDate={searchMode}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
              onUpdateContent={onUpdateContent}
              onLinkKeyClick={onLinkKeyClick}
              onUpdateLinkKey={onUpdateLinkKey}
              allLinkKeys={allLinkKeys}
              isPinned={pinnedDiaryIds?.has(m.id) ?? false}
              onPin={onPin}
              onUnpin={onUnpin}
              isHighlighted={m.id === highlightMemoId}
              onNavigate={searchMode ? onNavigate : undefined}
              onExistingAttachmentsUploaded={onExistingAttachmentsUploaded}
              onAttachmentDeleted={onAttachmentDeleted}
            />
          ))
        )}
      </div>
    </section>
  )
}
