import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './PrivateNotes.css'

/* ── 상수 ── */
const CAT_OPTIONS = ['유튜브', '블로그', 'AI공부', '수익화', '개인생각', '아이디어', '기타']
const CAT_ALL     = ['전체', ...CAT_OPTIONS]

const CAT_COLOR = {
  유튜브:   '#ef4444',
  블로그:   '#22c55e',
  AI공부:   '#a855f7',
  수익화:   '#f59e0b',
  개인생각: '#3b82f6',
  아이디어: '#6b7280',
  기타:     '#9ca3af',
}

const WEEK_NAMES = ['일', '월', '화', '수', '목', '금', '토']

/* ── 작성자 목록 ── */
const OWNERS = ['주현희', '김정현']

/* ── 날짜 헬퍼 ── */
function isoToDate(iso) { return iso ? iso.slice(0, 10) : null }
function fmtShort(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${y}.${m}.${d}`
}
function fmtKo(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

function todayStr() { return isoToDate(new Date().toISOString()) }

const EMPTY_FORM = { title: '', category: '유튜브', memo: '', memo_date: todayStr() }

/* ══════════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════════ */
export default function PrivateNotes({ onBack, initialOwner = '주현희' }) {
  /* 작성자 선택 (인증 없음) */
  const [owner, setOwner] = useState(initialOwner)

  /* 데이터 */
  const [notes,       setNotes]       = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataErr,     setDataErr]     = useState('')

  /* 검색/필터 */
  const [searchQ,    setSearchQ]    = useState('')
  const [catFilter,  setCatFilter]  = useState('전체')

  /* 달력 & 선택 날짜 */
  const [calYear,    setCalYear]    = useState(new Date().getFullYear())
  const [calMonth,   setCalMonth]   = useState(new Date().getMonth())
  const [calSelDate, setCalSelDate] = useState(todayStr())

  /* 작성폼 */
  const [form,     setForm]     = useState({ ...EMPTY_FORM, memo_date: todayStr() })
  const [editId,   setEditId]   = useState(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const formTitleRef = useRef(null)

  /* ── 메모 불러오기 ── */
  const loadNotes = useCallback(async () => {
    setDataLoading(true)
    setDataErr('')
    try {
      const { data, error } = await supabase
        .from('private_notes')
        .select('id, title, category, memo, due_date, created_at, updated_at, writer_name')
        .eq('writer_name', owner)
        .order('created_at', { ascending: false })
      if (error) throw error
      setNotes(data || [])
    } catch (e) {
      setDataErr(`불러오기 실패: ${e.message}`)
    } finally {
      setDataLoading(false)
    }
  }, [owner])

  /* 작성자 바뀌면 목록 새로고침 + 필터/폼 초기화 */
  useEffect(() => {
    loadNotes()
    setSearchQ('')
    setCatFilter('전체')
    setEditId(null)
    setForm({ ...EMPTY_FORM, memo_date: calSelDate || todayStr() })
  }, [owner, loadNotes])

  /* ── 폼 초기화 ── */
  function resetForm() {
    setEditId(null)
    setForm({ ...EMPTY_FORM, memo_date: calSelDate || todayStr() })
    setTimeout(() => {
      formTitleRef.current?.focus()
    }, 50)
  }

  /* ── 편집 폼 열기 ── */
  function openEditForm(note) {
    setEditId(note.id)
    setForm({
      title:     note.title     || '',
      category:  note.category  || '유튜브',
      memo:      note.memo      || '',
      memo_date: note.due_date  || isoToDate(note.created_at) || todayStr(),
    })
    if (note.due_date) {
      setCalSelDate(note.due_date)
      const [y, m] = note.due_date.split('-')
      setCalYear(Number(y))
      setCalMonth(Number(m) - 1)
    }
    setTimeout(() => {
      formTitleRef.current?.focus()
      formTitleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  /* ── 저장 ── */
  async function saveNote(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaveBusy(true)
    try {
      const payload = {
        title:       form.title.trim(),
        category:    form.category,
        memo:        form.memo.trim() || null,
        updated_at:  new Date().toISOString(),
        due_date:    form.memo_date || null,
        status:      '예정',
        priority:    '보통',
        next_action: null,
      }
      if (editId) {
        const { error } = await supabase.from('private_notes').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        payload.writer_name = owner   // 현재 선택된 작성자로 저장
        const { error } = await supabase.from('private_notes').insert(payload)
        if (error) throw error
      }
      if (form.memo_date) {
        setCalSelDate(form.memo_date)
        const [y, m] = form.memo_date.split('-')
        setCalYear(Number(y))
        setCalMonth(Number(m) - 1)
      }
      resetForm()
      await loadNotes()
    } catch (err) {
      setDataErr(`저장 실패: ${err.message}`)
    } finally {
      setSaveBusy(false)
    }
  }

  /* ── 삭제 ── */
  async function deleteNote(id) {
    if (!window.confirm('이 메모를 삭제할까요?')) return
    try {
      const { error } = await supabase.from('private_notes').delete().eq('id', id)
      if (error) throw error
      setNotes(prev => prev.filter(n => n.id !== id))
      if (editId === id) resetForm()
    } catch (err) {
      setDataErr(`삭제 실패: ${err.message}`)
    }
  }

  /* ── 필터링된 노트 ── */
  const filteredNotes = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return notes.filter(n => {
      if (catFilter !== '전체' && n.category !== catFilter) return false
      if (q && !(n.title||'').toLowerCase().includes(q) && !(n.memo||'').toLowerCase().includes(q)) return false
      return true
    })
  }, [notes, catFilter, searchQ])

  const calDateMap = useMemo(() => {
    const map = {}
    filteredNotes.forEach(n => {
      const d = n.due_date
      if (!d) return
      if (!map[d]) map[d] = []
      map[d].push(n)
    })
    return map
  }, [filteredNotes])

  const calSelNotes = calSelDate ? (calDateMap[calSelDate] || []) : []

  /* ── 달력 네비게이션 ── */
  function calMove(delta) {
    let m = calMonth + delta, y = calYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCalMonth(m); setCalYear(y)
  }

  function handleDateClick(dateStr) {
    setCalSelDate(dateStr)
    if (!editId) setForm(f => ({ ...f, memo_date: dateStr }))
  }

  /* ════════════ 렌더 ════════════ */
  return (
    <div className="pn-app">
      {/* 헤더 */}
      <header className="pn-header">
        <div className="pn-brand">
          <div className="pn-brand-mark">H</div>
          <div>
            <div className="pn-brand-title">{owner} 개인일지</div>
            <div className="pn-brand-sub">개인 달력 · 메모 작성 · 분류 관리</div>
          </div>
        </div>

        {/* 상단 필터/검색 */}
        <div className="pn-top-filters">
          <div className="pn-search-wrap">
            <span className="pn-search-icon">🔍</span>
            <input
              className="pn-search"
              type="text"
              placeholder="제목 또는 내용 검색"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
            {searchQ && (
              <button type="button" className="pn-search-clear" onClick={() => setSearchQ('')}>✕</button>
            )}
          </div>
          <div className="pn-cat-bar">
            {CAT_ALL.map(cat => (
              <button key={cat} type="button"
                className={`pn-cat-btn${catFilter === cat ? ' active' : ''}`}
                style={cat !== '전체' ? { '--cat-c': CAT_COLOR[cat] } : {}}
                onClick={() => setCatFilter(cat)}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="pn-header-right">
          <button type="button" className="pn-back-btn" onClick={onBack}>← 업무일지로 돌아가기</button>
        </div>
      </header>

      {/* 작성자 선택 탭 */}
      <div className="pn-owner-tabs">
        {OWNERS.map(name => (
          <button
            key={name}
            type="button"
            className={`pn-owner-tab${owner === name ? ' active' : ''}`}
            onClick={() => setOwner(name)}
          >
            👤 {name} 개인메모
          </button>
        ))}
        <span className="pn-owner-indicator">
          현재: <strong>{owner}</strong>의 메모 {!dataLoading && `(${notes.length}개)`}
        </span>
      </div>

      {/* 에러 */}
      {dataErr && (
        <div className="pn-err">
          {dataErr}
          <button type="button" className="pn-err-close" onClick={() => setDataErr('')}>✕</button>
        </div>
      )}

      {/* 3단 본문 레이아웃 */}
      <div className="pn-body-3col">
        {/* 1. 달력 영역 (왼쪽) */}
        <div className="pn-col-calendar">
          <div className="pn-cal-panel">
            <div className="pn-cal-header">
              <button type="button" className="pn-cal-nav-btn" onClick={() => calMove(-1)}>◀</button>
              <span className="pn-cal-title">{calYear}년 {calMonth + 1}월</span>
              <button type="button" className="pn-cal-nav-btn" onClick={() => calMove(1)}>▶</button>
            </div>
            <div className="pn-cal-grid">
              {WEEK_NAMES.map((n, i) => (
                <div key={n} className={`pn-cal-dname${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{n}</div>
              ))}
              <CalCells
                year={calYear} month={calMonth}
                calDateMap={calDateMap}
                selDate={calSelDate}
                onSelect={handleDateClick}
              />
            </div>
          </div>
        </div>

        {/* 2. 스티커 목록 영역 (가운데) */}
        <div className="pn-col-stickers">
          <div className="pn-stickers-head">
            <span className="pn-stickers-title">
              📅 {calSelDate ? fmtKo(calSelDate) + ' 메모' : '날짜를 선택하세요'}
            </span>
            {calSelDate && <span className="pn-stickers-count">{calSelNotes.length}개</span>}
          </div>

          <div className="pn-stickers-list">
            {dataLoading && <div className="pn-center-msg">불러오는 중...</div>}

            {!dataLoading && calSelDate && calSelNotes.length === 0 && (
              <div className="pn-empty-state">
                <div className="pn-empty-icon">📝</div>
                <div className="pn-empty-text">이 날짜에 작성된 메모가 없습니다.</div>
              </div>
            )}

            {!dataLoading && !calSelDate && (
              <div className="pn-empty-state">
                <div className="pn-empty-icon">👈</div>
                <div className="pn-empty-text">달력에서 날짜를 선택해주세요.</div>
              </div>
            )}

            {!dataLoading && calSelNotes.map(note => (
              <StickerCard
                key={note.id}
                note={note}
                isActive={editId === note.id}
                onEdit={() => openEditForm(note)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
          </div>
        </div>

        {/* 3. 메모 입력창 영역 (오른쪽) */}
        <div className="pn-col-editor">
          <div className="pn-editor-panel">
            <form className="pn-form" onSubmit={saveNote}>
              <div className="pn-form-head">
                <span className="pn-form-title">
                  {editId ? '✏️ 메모 수정' : `✏️ ${owner} 새 메모`}
                </span>
                <div className="pn-form-head-actions">
                  <button type="button" className="pn-new-reset-btn" onClick={resetForm}>
                    ✨ 새 메모
                  </button>
                </div>
              </div>

              <div className="pn-form-date-row">
                <label className="pn-date-label">기록 날짜</label>
                <input
                  className="pn-date-input"
                  type="date"
                  value={form.memo_date}
                  onChange={e => {
                    setForm(f => ({ ...f, memo_date: e.target.value }))
                    if (!editId) setCalSelDate(e.target.value)
                  }}
                />
              </div>

              <div className="pn-form-top-row">
                <input
                  ref={formTitleRef}
                  className="pn-title-input"
                  type="text"
                  placeholder="제목을 입력해주세요"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                />
                <select
                  className="pn-cat-select"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CAT_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <textarea
                className="pn-memo-input"
                placeholder="유튜브 아이디어, 블로그 초안, AI 공부 메모, 수익화 구상, 개인 생각 등을 자유롭게 적어주세요."
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              />

              <div className="pn-form-foot">
                {editId && (
                  <button type="button" className="pn-cancel-btn pn-del-btn" onClick={() => deleteNote(editId)}>
                    🗑 삭제
                  </button>
                )}
                <div style={{ flex: 1 }}></div>
                <button type="button" className="pn-cancel-btn" onClick={resetForm}>초기화</button>
                <button type="submit" className="pn-save-btn" disabled={saveBusy}>
                  {saveBusy ? '저장 중...' : (editId ? '💾 수정 저장' : '💾 새 메모 저장')}
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>{/* /pn-body-3col */}
    </div>
  )
}

/* ══════════════════════════════════════════════
   스티커 카드
══════════════════════════════════════════════ */
function StickerCard({ note, isActive, onEdit, onDelete }) {
  const color = CAT_COLOR[note.category] || '#9ca3af'
  const isEdited = note.updated_at && note.updated_at !== note.created_at

  return (
    <div className={`pn-sticker ${isActive ? 'active' : ''}`} style={{ '--cat-c': color }} onClick={onEdit}>
      <div className="pn-sticker-head">
        <span className="pn-sticker-cat" style={{ color, borderColor: color + '55', background: color + '15' }}>
          {note.category}
        </span>
        <div className="pn-sticker-actions" onClick={e => e.stopPropagation()}>
          <button type="button" className="pn-s-act" onClick={onEdit}>✏️</button>
          <button type="button" className="pn-s-act del" onClick={onDelete}>🗑</button>
        </div>
      </div>
      <div className="pn-sticker-title">{note.title}</div>
      {note.memo && (
        <div className="pn-sticker-body">
          {note.memo.length > 80 ? note.memo.slice(0, 80) + '...' : note.memo}
        </div>
      )}
      <div className="pn-sticker-foot">
        작성 {fmtShort(note.created_at)}
        {isEdited ? ` · 수정 ${fmtShort(note.updated_at)}` : ''}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   달력 셀
══════════════════════════════════════════════ */
function CalCells({ year, month, calDateMap, selDate, onSelect }) {
  const today     = todayStr()
  const firstDow  = new Date(year, month, 1).getDay()
  const daysInMon = new Date(year, month + 1, 0).getDate()
  const prevDays  = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: prevDays - i, cur: false })
  for (let d = 1; d <= daysInMon; d++)    cells.push({ day: d, cur: true })
  const remain = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= remain; d++)       cells.push({ day: d, cur: false })

  return cells.map((cell, i) => {
    const dow     = i % 7
    const dateStr = cell.cur
      ? `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
      : null
    const isToday  = dateStr === today
    const isSel    = dateStr === selDate
    const dayNotes = (cell.cur && dateStr && calDateMap[dateStr]) || []

    return (
      <div
        key={i}
        className={[
          'pn-cal-cell',
          !cell.cur ? 'other' : '',
          isToday   ? 'today' : '',
          isSel     ? 'selected' : '',
          cell.cur && dayNotes.length ? 'has-notes' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => cell.cur && dateStr && onSelect(dateStr)}
      >
        <span className={`pn-cal-num${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}`}>
          {cell.day}
        </span>
        {dayNotes.length > 0 && (
          <div className="pn-cal-sticker-badges">
            📝 {dayNotes.length}
          </div>
        )}
      </div>
    )
  })
}
