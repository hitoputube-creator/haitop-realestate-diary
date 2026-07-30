import { useEffect, useRef, useState } from 'react'
import { searchCustomers } from '../lib/customers'
import './CustomerSearchPanel.css'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/*
 * 고객명/업체명/연락처(하이픈 유무 무관)로 고객을 검색해
 * 바로 메모를 추가하거나 전체 기록을 볼 수 있는 패널.
 */
export default function CustomerSearchPanel({ onAddMemo, onViewTimeline }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

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
        const rows = await searchCustomers(q)
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

  return (
    <section className="wd-panel csp-panel" aria-label="고객 검색">
      <div className="wd-panel-header">
        <div className="wd-panel-title">고객 검색</div>
        <div className="wd-panel-sub">이름 · 업체명 · 연락처</div>
      </div>

      <div className="csp-search-row">
        <span className="csp-search-icon">🔍</span>
        <input
          className="csp-search-input"
          type="text"
          placeholder="고객명 또는 연락처 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="csp-search-clear" onClick={() => setQuery('')}>✕</button>
        )}
      </div>

      {error && <div className="csp-error" role="alert">{error}</div>}

      {query.trim() && (
        <div className="csp-results">
          {searching ? (
            <div className="csp-empty">검색 중...</div>
          ) : results.length === 0 ? (
            <div className="csp-empty">일치하는 고객이 없습니다.</div>
          ) : (
            results.map((c) => (
              <div key={c.id} className="csp-result-row">
                <div className="csp-result-info">
                  <div className="csp-result-name">{c.name || '(이름 미입력)'}</div>
                  <div className="csp-result-meta">
                    {c.phone && <span>📞 {c.phone}</span>}
                    <span>
                      {c.lastMemoDate ? `최근 메모 ${formatDate(c.lastMemoDate)}` : '메모 없음'}
                    </span>
                  </div>
                </div>
                <div className="csp-result-actions">
                  <button type="button" className="csp-btn csp-btn-primary" onClick={() => onAddMemo?.(c)}>
                    메모 추가
                  </button>
                  <button type="button" className="csp-btn" onClick={() => onViewTimeline?.(c.id)}>
                    전체 기록 보기
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
