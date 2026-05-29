import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import Calendar, { toDateKey } from './Calendar'
import DiaryList, { extractTags } from './DiaryList'
import SearchBar from './SearchBar'
import './WorkDiary.css'

const TABLE = 'work_diary'

export default function WorkDiary({ onOpenPrivateNotes }) {
  const today = useMemo(() => new Date(), [])

  const [selectedDate, setSelectedDate] = useState(today)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const [memos, setMemos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [notedDateKeys, setNotedDateKeys] = useState({})

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)

  const searchMode = searchQuery.trim().length > 0
  const [filterWriter, setFilterWriter] = useState('all')

  /* ===== 선택 날짜의 메모 로드 ===== */
  const loadMemosForSelected = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMemos([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dateStr = toDateKey(selectedDate)
      const { data, error: e } = await supabase
        .from(TABLE)
        .select('*')
        .eq('date', dateStr)
        .order('created_at', { ascending: true })
      if (e) throw e
      setMemos(data || [])
    } catch (err) {
      setError(`메모를 불러오지 못했습니다: ${err.message || err}`)
      setMemos([])
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadMemosForSelected()
  }, [loadMemosForSelected])

  /* ===== 표시 중인 달의 메모 있는 날짜 마킹 ===== */
  const loadMonthDots = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setNotedDateKeys({})
      return
    }
    try {
      const start = new Date(viewYear, viewMonth, 1)
      const end = new Date(viewYear, viewMonth + 1, 0)
      const startStr = toDateKey(start)
      const endStr = toDateKey(end)
      const { data, error: e } = await supabase
        .from(TABLE)
        .select('date, writer, sticker')
        .gte('date', startStr)
        .lte('date', endStr)
      if (e) throw e

      // { [dateKey]: [{ writer, sticker }] }
      const dotsMap = {}
      if (data) {
        data.forEach((r) => {
          const dateKey = r.date
          if (!dotsMap[dateKey]) dotsMap[dateKey] = []
          dotsMap[dateKey].push({
            writer: r.writer || '주현희',
            sticker: r.sticker || null,
          })
        })
      }
      setNotedDateKeys(dotsMap)
    } catch (err) {
      // 도트는 실패해도 무시 (UI 차단 X)
      // eslint-disable-next-line no-console
      console.warn('[WorkDiary] month dots load failed:', err)
    }
  }, [viewYear, viewMonth])

  useEffect(() => {
    loadMonthDots()
  }, [loadMonthDots])

  /* ===== 검색 ===== */
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    if (!isSupabaseConfigured) {
      setSearchResults([])
      return
    }

    let cancelled = false
    setSearchLoading(true)
    ;(async () => {
      try {
        // #으로 시작하면 태그 검색, 아니면 컨텐츠 + 태그 모두 검색
        const isTagSearch = q.startsWith('#')
        const tagTerm = isTagSearch ? q.slice(1) : q

        // content ilike 또는 태그 array contains
        const orFilter = isTagSearch
          ? `tags.cs.{${tagTerm}}`
          : `content.ilike.%${q}%,tags.cs.{${tagTerm}}`

        const { data, error: e } = await supabase
          .from(TABLE)
          .select('*')
          .or(orFilter)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100)
        if (e) throw e
        if (!cancelled) setSearchResults(data || [])
      } catch (err) {
        if (!cancelled) {
          setError(`검색 실패: ${err.message || err}`)
          setSearchResults([])
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchQuery])

  /* ===== CRUD 핸들러 ===== */
  const handleCreate = useCallback(
    async (content, writer = '주현희', sticker = null) => {
      if (!isSupabaseConfigured) {
        setError('Supabase 연결이 설정되지 않았습니다. .env에 VITE_SUPABASE_URL 및 VITE_SUPABASE_ANON_KEY를 추가해주세요.')
        return
      }
      try {
        const tags = extractTags(content)
        const dateStr = toDateKey(selectedDate)
        const { data, error: e } = await supabase
          .from(TABLE)
          .insert({
            content,
            tags,
            status: 'normal',
            date: dateStr,
            writer,
            sticker: sticker || null,
          })
          .select()
          .single()
        if (e) throw e
        setMemos((prev) => [...prev, data])
        setNotedDateKeys((prev) => {
          const next = { ...prev }
          if (!next[dateStr]) next[dateStr] = []
          next[dateStr] = [...next[dateStr], { writer, sticker: sticker || null }]
          return next
        })
        setError(null)
      } catch (err) {
        setError(`저장 실패: ${err.message || err}`)
        throw err
      }
    },
    [selectedDate]
  )

  const filteredMemos = useMemo(() => {
    const raw = searchMode ? searchResults : memos
    if (filterWriter === 'all') return raw
    return raw.filter((m) => (m.writer || '주현희') === filterWriter)
  }, [searchMode, searchResults, memos, filterWriter])

  const handleChangeStatus = useCallback(async (id, nextStatus) => {
    if (!isSupabaseConfigured) return
    // 낙관적 업데이트
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, status: nextStatus } : m)))
    setSearchResults((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: nextStatus } : m))
    )
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .update({ status: nextStatus })
        .eq('id', id)
      if (e) throw e
    } catch (err) {
      setError(`상태 변경 실패: ${err.message || err}`)
      // 실패 시 원본 다시 로드
      loadMemosForSelected()
    }
  }, [loadMemosForSelected])

  const handleDelete = useCallback(
    async (id) => {
      if (!isSupabaseConfigured) return
      const prevList = memos
      const prevSearch = searchResults
      setMemos((prev) => prev.filter((m) => m.id !== id))
      setSearchResults((prev) => prev.filter((m) => m.id !== id))
      try {
        const { error: e } = await supabase.from(TABLE).delete().eq('id', id)
        if (e) throw e
        // 해당 날짜에 메모가 더 이상 없으면 도트 제거
        loadMonthDots()
      } catch (err) {
        setError(`삭제 실패: ${err.message || err}`)
        setMemos(prevList)
        setSearchResults(prevSearch)
      }
    },
    [memos, searchResults, loadMonthDots]
  )

  const handleUpdateContent = useCallback(async (id, content) => {
    if (!isSupabaseConfigured) return
    const tags = extractTags(content)
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, tags } : m))
    )
    setSearchResults((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, tags } : m))
    )
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .update({ content, tags })
        .eq('id', id)
      if (e) throw e
    } catch (err) {
      setError(`수정 실패: ${err.message || err}`)
      loadMemosForSelected()
    }
  }, [loadMemosForSelected])

  /* ===== 달력 네비게이션 ===== */
  function handlePrevMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }
  function handleNextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }
  function handleJumpToday() {
    const t = new Date()
    setViewYear(t.getFullYear())
    setViewMonth(t.getMonth())
    setSelectedDate(t)
  }
  function handleSelectDate(d) {
    setSelectedDate(d)
    if (d.getMonth() !== viewMonth || d.getFullYear() !== viewYear) {
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }

  return (
    <div className="wd-app">
      <header className="wd-header">
        <div className="wd-brand">
          <div className="wd-brand-mark">H</div>
          <div>
            <div className="wd-brand-title">하이탑 업무일지</div>
            <div className="wd-brand-sub">Work Diary</div>
          </div>
        </div>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        {onOpenPrivateNotes && (
          <button
            type="button"
            className="wd-btn-private-notes"
            onClick={onOpenPrivateNotes}
          >
            🔒 비공개 개인노트
          </button>
        )}
      </header>

      <div className="wd-filter-tabs">
        <button
          type="button"
          className={`wd-filter-tab ${filterWriter === 'all' ? 'active' : ''}`}
          onClick={() => setFilterWriter('all')}
        >
          전체
        </button>
        <button
          type="button"
          className={`wd-filter-tab ${filterWriter === '주현희' ? 'active' : ''}`}
          onClick={() => setFilterWriter('주현희')}
        >
          주현희
        </button>
        <button
          type="button"
          className={`wd-filter-tab ${filterWriter === '김정현' ? 'active' : ''}`}
          onClick={() => setFilterWriter('김정현')}
        >
          김정현
        </button>
      </div>

      {!isSupabaseConfigured && (
        <div className="wd-notice">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Supabase 연결 미설정.</strong> 프로젝트 루트에 <code>.env</code> 파일을 만들고
            <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>를 설정한 뒤
            개발 서버를 재시작해주세요. 그 전까지는 메모 저장/조회가 동작하지 않습니다.
          </div>
        </div>
      )}

      <main className="wd-main">
        <Calendar
          viewYear={viewYear}
          viewMonth={viewMonth}
          selectedDate={selectedDate}
          notedDateKeys={notedDateKeys}
          filterWriter={filterWriter}
          onSelectDate={handleSelectDate}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onJumpToday={handleJumpToday}
        />

        <DiaryList
          selectedDate={selectedDate}
          memos={filteredMemos}
          loading={searchMode ? searchLoading : loading}
          error={error}
          searchMode={searchMode}
          onCreate={handleCreate}
          onChangeStatus={handleChangeStatus}
          onDelete={handleDelete}
          onUpdateContent={handleUpdateContent}
          composerDisabled={!isSupabaseConfigured}
        />
      </main>
    </div>
  )
}
