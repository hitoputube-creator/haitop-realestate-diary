import { useEffect, useRef, useState } from 'react'
import { searchDiaryEntriesFull, ensureDiaryRowCustomerId } from '../lib/customers'
import './CustomerMemoLookupModal.css'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function snippet(content) {
  if (!content) return ''
  return content.length > 70 ? content.slice(0, 70) + '…' : content
}

/*
 * 새 메모 입력창에서 "기존 고객·메모 불러오기"를 눌렀을 때 뜨는 검색창.
 * 고객명/전화번호/제목/메모 내용으로 전체 기간을 검색하고, 결과를 고르면
 * title/customer_name/customer_phone/customer_id를 그대로(서로 섞지 않고) 돌려준다.
 */
export default function CustomerMemoLookupModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [linkingId, setLinkingId] = useState(null)
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
      setResults([])
      setError('')
      return
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      setError('')
      try {
        const rows = await searchDiaryEntriesFull(q)
        setResults(rows)
      } catch (err) {
        setError(err.message || String(err))
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 280)
    return () => clearTimeout(timerRef.current)
  }, [query])

  async function handlePick(row) {
    if (linkingId) return
    setLinkingId(row.id)
    setError('')
    try {
      const customerId = await ensureDiaryRowCustomerId(row)
      onSelect?.({
        customerId: customerId || null,
        title: row.title || '',
        customerName: row.customer_name || '',
        customerPhone: row.customer_phone || '',
      })
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLinkingId(null)
    }
  }

  return (
    <div className="cml-overlay" role="dialog" aria-modal="true" aria-label="기존 고객·메모 불러오기">
      <div className="cml-panel">
        <div className="cml-header">
          <div>
            <div className="cml-title">🔎 기존 고객·메모 불러오기</div>
            <div className="cml-sub">고객명 · 전화번호 · 제목 · 메모 내용으로 전체 기간을 검색합니다</div>
          </div>
          <button type="button" className="cml-close" onClick={() => onClose?.()} aria-label="닫기">✕</button>
        </div>

        <div className="cml-search-row">
          <span className="cml-search-icon">🔍</span>
          <input
            ref={inputRef}
            className="cml-search-input"
            type="text"
            placeholder="고객명, 전화번호, 제목, 메모 내용 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="cml-search-clear" onClick={() => setQuery('')}>✕</button>
          )}
        </div>

        {error && <div className="cml-error" role="alert">{error}</div>}

        <div className="cml-body">
          {!query.trim() ? (
            <div className="cml-empty">검색어를 입력해주세요.</div>
          ) : searching ? (
            <div className="cml-empty">검색 중...</div>
          ) : results.length === 0 ? (
            <div className="cml-empty">일치하는 결과가 없습니다.</div>
          ) : (
            results.map((row) => (
              <button
                type="button"
                key={row.id}
                className="cml-result-row"
                onClick={() => handlePick(row)}
                disabled={linkingId === row.id}
              >
                <div className="cml-result-top">
                  <span className="cml-result-title">{row.title || '(제목 미입력)'}</span>
                  <span className="cml-result-date">{formatDate(row.date)}</span>
                </div>
                <div className="cml-result-meta">
                  <span>👤 {row.customer_name || '미입력'}</span>
                  <span>📞 {row.customer_phone || '미입력'}</span>
                </div>
                <div className="cml-result-content">{snippet(row.content)}</div>
                {linkingId === row.id && <div className="cml-result-linking">연결 중...</div>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
