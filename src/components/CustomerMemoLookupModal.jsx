import { useEffect, useRef, useState } from 'react'
import {
  ensureDiaryRowCustomerId,
  getCustomerSelectionContext,
  searchCustomers,
  searchDiaryEntriesFull,
} from '../lib/customers'
import './CustomerMemoLookupModal.css'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function snippet(content, max = 70) {
  const text = (content || '').trim()
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

function mapRecentEntries(entries) {
  return (entries || []).map((entry) => ({
    id: entry.id,
    date: entry.date,
    created_at: entry.created_at,
    title: entry.title || '',
    content: entry.content || '',
    writer: entry.writer || '',
  }))
}

export default function CustomerMemoLookupModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState([])
  const [memoRows, setMemoRows] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [linkingKey, setLinkingKey] = useState(null)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const q = query.trim()
    clearTimeout(timerRef.current)
    if (!q) {
      timerRef.current = setTimeout(() => {
        setCustomers([])
        setMemoRows([])
        setError('')
      }, 0)
      return
    }

    timerRef.current = setTimeout(async () => {
      setSearching(true)
      setError('')
      try {
        const [customerResults, diaryResults] = await Promise.all([
          searchCustomers(q, { limit: 12 }),
          searchDiaryEntriesFull(q, { limit: 30 }),
        ])
        setCustomers(customerResults)
        setMemoRows(diaryResults)
      } catch (err) {
        setError(err.message || String(err))
        setCustomers([])
        setMemoRows([])
      } finally {
        setSearching(false)
      }
    }, 280)

    return () => clearTimeout(timerRef.current)
  }, [query])

  async function selectCustomer(customer) {
    if (linkingKey) return
    const key = `customer:${customer.id}`
    setLinkingKey(key)
    setError('')
    try {
      const { customer: freshCustomer, entries } = await getCustomerSelectionContext(customer.id, { limit: 5 })
      const selected = freshCustomer || customer
      onSelect?.({
        customerId: selected.id,
        customerName: selected.name || '',
        customerPhone: selected.phone || '',
        recentEntries: mapRecentEntries(entries),
      })
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLinkingKey(null)
    }
  }

  async function selectMemo(row) {
    if (linkingKey) return
    const key = `memo:${row.id}`
    setLinkingKey(key)
    setError('')
    try {
      const customerId = await ensureDiaryRowCustomerId(row)
      let customer = null
      let entries = []
      if (customerId) {
        const context = await getCustomerSelectionContext(customerId, { limit: 5 })
        customer = context.customer
        entries = context.entries
      }
      onSelect?.({
        customerId: customerId || null,
        customerName: customer?.name || row.customer_name || '',
        customerPhone: customer?.phone || row.customer_phone || '',
        recentEntries: mapRecentEntries(entries.length ? entries : [row]),
      })
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLinkingKey(null)
    }
  }

  const hasQuery = query.trim().length > 0
  const hasResults = customers.length > 0 || memoRows.length > 0

  return (
    <div className="cml-overlay" role="dialog" aria-modal="true" aria-label="기존 고객·메모 불러오기">
      <div className="cml-panel">
        <div className="cml-header">
          <div>
            <div className="cml-title">기존 고객·메모 불러오기</div>
            <div className="cml-sub">고객명·연락처·제목·메모 내용으로 검색합니다</div>
          </div>
          <button type="button" className="cml-close" onClick={() => onClose?.()} aria-label="닫기">×</button>
        </div>

        <div className="cml-search-row">
          <span className="cml-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="cml-search-input"
            type="text"
            placeholder="고객명, 연락처, 제목, 메모 내용 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="cml-search-clear" onClick={() => setQuery('')} aria-label="검색어 지우기">×</button>
          )}
        </div>

        {error && <div className="cml-error" role="alert">{error}</div>}

        <div className="cml-body">
          {!hasQuery ? (
            <div className="cml-empty">검색어를 입력해주세요.</div>
          ) : searching ? (
            <div className="cml-empty">검색 중...</div>
          ) : !hasResults ? (
            <div className="cml-empty">일치하는 결과가 없습니다.</div>
          ) : (
            <>
              {customers.length > 0 && (
                <div className="cml-section">
                  <div className="cml-section-title">고객</div>
                  {customers.map((customer) => {
                    const key = `customer:${customer.id}`
                    return (
                      <button
                        type="button"
                        key={customer.id}
                        className="cml-result-row"
                        onClick={() => selectCustomer(customer)}
                        disabled={linkingKey === key}
                      >
                        <div className="cml-result-top">
                          <span className="cml-result-title">{customer.name || '이름 미입력'}</span>
                          <span className="cml-result-date">{formatDate(customer.lastMemoDate || customer.created_at?.slice(0, 10))}</span>
                        </div>
                        <div className="cml-result-meta">
                          <span>연락처 {customer.phone || '미입력'}</span>
                          {customer.customer_role && <span>{customer.customer_role}</span>}
                        </div>
                        {customer.memo && <div className="cml-result-content">{snippet(customer.memo)}</div>}
                        {linkingKey === key && <div className="cml-result-linking">연결 중...</div>}
                      </button>
                    )
                  })}
                </div>
              )}

              {memoRows.length > 0 && (
                <div className="cml-section">
                  <div className="cml-section-title">기존 메모</div>
                  {memoRows.map((row) => {
                    const key = `memo:${row.id}`
                    return (
                      <button
                        type="button"
                        key={row.id}
                        className="cml-result-row"
                        onClick={() => selectMemo(row)}
                        disabled={linkingKey === key}
                      >
                        <div className="cml-result-top">
                          <span className="cml-result-title">{row.title || '(제목 미입력)'}</span>
                          <span className="cml-result-date">{formatDate(row.date)}</span>
                        </div>
                        <div className="cml-result-meta">
                          <span>고객 {row.customer_name || '미입력'}</span>
                          <span>연락처 {row.customer_phone || '미입력'}</span>
                        </div>
                        <div className="cml-result-content">{snippet(row.content)}</div>
                        {linkingKey === key && <div className="cml-result-linking">연결 중...</div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
