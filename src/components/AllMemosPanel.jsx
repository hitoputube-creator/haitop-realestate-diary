import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import './AllMemosPanel.css'

const TABLE = 'work_diary'
const NO_PHONE_KEY = '__no_phone__'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function normalizePhone(phone) {
  return (phone || '').replace(/[^0-9]/g, '')
}

function matchesQuery(memo, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    (memo.title || '').toLowerCase().includes(q) ||
    (memo.customer_name || '').toLowerCase().includes(q) ||
    (memo.customer_phone || '').toLowerCase().includes(q)
  )
}

/* ===== 개별 메모 행 (클릭하면 본문 아코디언으로 펼쳐짐) ===== */
function MemoRow({ memo, expanded, onToggle }) {
  return (
    <div className={`amp-row ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="amp-row-head" onClick={onToggle}>
        <span className="amp-row-date">{formatDate(memo.date)}</span>
        <span className="amp-row-title">{memo.title || '(제목 미입력)'}</span>
        <span className="amp-row-badge">👤 {memo.customer_name || '미입력'}</span>
        <span className="amp-row-badge">📞 {memo.customer_phone || '미입력'}</span>
        <span className="amp-row-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="amp-row-content">{memo.content}</div>
      )}
    </div>
  )
}

export default function AllMemosPanel({ refreshTrigger }) {
  const [allMemos, setAllMemos] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState('date') // 'date' | 'person'
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    setLoading(true)
    supabase
      .from(TABLE)
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setAllMemos(data || [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshTrigger])

  function toggleMemo(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = useMemo(
    () => allMemos.filter((m) => matchesQuery(m, query.trim())),
    [allMemos, query]
  )

  const groups = useMemo(() => {
    if (viewMode !== 'person') return []
    const map = new Map()
    filtered.forEach((m) => {
      const norm = normalizePhone(m.customer_phone)
      // 연락처가 없으면 이름 기준으로 묶고, 이름도 없을 때만 "미입력" 그룹으로 합친다
      // (그렇지 않으면 이름은 있고 연락처만 없는 사람이 완전히 무관한 익명 메모들과 뒤섞임)
      const key = norm || (m.customer_name ? `name:${m.customer_name}` : NO_PHONE_KEY)
      if (!map.has(key)) map.set(key, { key, phone: m.customer_phone || '', names: new Set(), memos: [] })
      const g = map.get(key)
      if (m.customer_name) g.names.add(m.customer_name)
      if (m.customer_phone && !g.phone) g.phone = m.customer_phone
      g.memos.push(m)
    })
    const list = Array.from(map.values())
    list.forEach((g) => {
      g.memos.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    })
    list.sort((a, b) => {
      const aDate = a.memos[0]?.date || ''
      const bDate = b.memos[0]?.date || ''
      return aDate < bDate ? 1 : aDate > bDate ? -1 : 0
    })
    return list
  }, [filtered, viewMode])

  return (
    <section className="wd-panel amp-panel" aria-label="전체 메모 리스트">
      <div className="wd-panel-header">
        <div className="wd-panel-title">전체 메모</div>
        <div className="wd-panel-sub">{filtered.length}건</div>
      </div>

      <div className="amp-toolbar">
        <div className="amp-view-toggle">
          <button
            type="button"
            className={`amp-view-btn ${viewMode === 'date' ? 'active' : ''}`}
            onClick={() => setViewMode('date')}
          >
            날짜순
          </button>
          <button
            type="button"
            className={`amp-view-btn ${viewMode === 'person' ? 'active' : ''}`}
            onClick={() => setViewMode('person')}
          >
            사람별
          </button>
        </div>
        <input
          className="amp-search-input"
          placeholder="제목·이름·연락처 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="amp-list">
        {loading ? (
          <div className="amp-empty">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="amp-empty">
            {query.trim() ? '검색 결과가 없습니다.' : '아직 메모가 없습니다.'}
          </div>
        ) : viewMode === 'date' ? (
          filtered.map((m) => (
            <MemoRow
              key={m.id}
              memo={m}
              expanded={expandedIds.has(m.id)}
              onToggle={() => toggleMemo(m.id)}
            />
          ))
        ) : (
          groups.map((g) => (
            <div key={g.key} className="amp-group">
              <button
                type="button"
                className="amp-group-head"
                onClick={() => toggleGroup(g.key)}
              >
                <span className="amp-group-name">
                  {g.names.size > 0 ? Array.from(g.names).join(' / ') : '이름 미입력'}
                </span>
                <span className="amp-group-phone">
                  📞 {g.phone || '연락처 미입력'}
                </span>
                <span className="amp-group-count">{g.memos.length}건</span>
                <span className="amp-row-caret" aria-hidden="true">
                  {expandedGroups.has(g.key) ? '▾' : '▸'}
                </span>
              </button>
              {expandedGroups.has(g.key) && (
                <div className="amp-group-body">
                  {g.memos.map((m) => (
                    <MemoRow
                      key={m.id}
                      memo={m}
                      expanded={expandedIds.has(m.id)}
                      onToggle={() => toggleMemo(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
