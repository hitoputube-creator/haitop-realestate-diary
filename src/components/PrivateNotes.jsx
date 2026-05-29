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

/* ── 날짜 헬퍼 ── */
function isoToDate(iso) { return iso ? iso.slice(0, 10) : null }
function fmtShort(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${y}.${m}.${d}`
}
function fmtKo(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/* ── 빈 폼 ── */
const EMPTY_FORM = { title: '', category: '유튜브', memo: '' }

/* ══════════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════════ */
export default function PrivateNotes({ onBack }) {
  /* 인증 */
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginEmail,  setLoginEmail]  = useState('')
  const [loginPw,     setLoginPw]     = useState('')
  const [loginErr,    setLoginErr]    = useState('')
  const [loginBusy,   setLoginBusy]   = useState(false)

  /* 데이터 */
  const [notes,       setNotes]       = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataErr,     setDataErr]     = useState('')

  /* 보기 */
  const [view,        setView]        = useState('list')   // 'list' | 'calendar'

  /* 검색/필터 */
  const [searchQ,     setSearchQ]     = useState('')
  const [catFilter,   setCatFilter]   = useState('전체')

  /* 작성폼 */
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [editId,      setEditId]      = useState(null)
  const [saveBusy,    setSaveBusy]    = useState(false)
  const formRef = useRef(null)

  /* 달력 */
  const [calYear,   setCalYear]   = useState(new Date().getFullYear())
  const [calMonth,  setCalMonth]  = useState(new Date().getMonth())
  const [calSelDate, setCalSelDate] = useState(null) // 'YYYY-MM-DD' | null

  /* ── 세션 복원 ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  /* ── 메모 불러오기 ── */
  const loadNotes = useCallback(async () => {
    if (!user) return
    setDataLoading(true)
    setDataErr('')
    try {
      const { data, error } = await supabase
        .from('private_notes')
        .select('id, title, category, memo, created_at, updated_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      setNotes(data || [])
    } catch (e) {
      setDataErr(`불러오기 실패: ${e.message}`)
    } finally {
      setDataLoading(false)
    }
  }, [user])

  useEffect(() => { if (user) loadNotes() }, [user, loadNotes])

  /* ── 로그인 ── */
  async function doLogin(e) {
    e.preventDefault()
    setLoginErr('')
    if (!loginEmail || !loginPw) { setLoginErr('이메일과 비밀번호를 입력해주세요.'); return }
    setLoginBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPw })
      if (error) throw error
    } catch (err) {
      setLoginErr(err.message || '이메일 또는 비밀번호를 확인해주세요.')
    } finally {
      setLoginBusy(false)
    }
  }

  /* ── 로그아웃 ── */
  async function doLogout() {
    await supabase.auth.signOut()
    setNotes([])
    closeForm()
  }

  /* ── 폼 열기/닫기 ── */
  function openNewForm() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    // 약간 delay 후 폼으로 스크롤
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  function openEditForm(note) {
    setEditId(note.id)
    setForm({ title: note.title || '', category: note.category || '유튜브', memo: note.memo || '' })
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_FORM)
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
        // DB NOT NULL 제약 충족 — 화면에는 표시 안 함
        status:      '메모',
        priority:    '보통',
        due_date:    null,
        next_action: null,
      }
      if (editId) {
        const { error } = await supabase.from('private_notes').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        payload.user_id     = user.id
        payload.writer_name = user.email
        const { error } = await supabase.from('private_notes').insert(payload)
        if (error) throw error
      }
      closeForm()
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
    } catch (err) {
      setDataErr(`삭제 실패: ${err.message}`)
    }
  }

  /* ── 필터링된 목록 ── */
  const filteredNotes = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return notes.filter(n => {
      if (catFilter !== '전체' && n.category !== catFilter) return false
      if (q && !(n.title||'').toLowerCase().includes(q) && !(n.memo||'').toLowerCase().includes(q)) return false
      return true
    })
  }, [notes, catFilter, searchQ])

  /* ── 달력용 날짜 맵 (created_at 기준) ── */
  const calDateMap = useMemo(() => {
    const map = {}
    notes.forEach(n => {
      const d = isoToDate(n.created_at)
      if (!d) return
      if (!map[d]) map[d] = []
      map[d].push(n)
    })
    return map
  }, [notes])

  /* ── 달력 이동 ── */
  function calMove(delta) {
    let m = calMonth + delta, y = calYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCalMonth(m); setCalYear(y)
    setCalSelDate(null)
  }

  /* ── 달력 날짜 클릭 ── */
  function onCalDateClick(dateStr) {
    setCalSelDate(prev => prev === dateStr ? null : dateStr)
  }

  /* ── 선택된 달력 날짜의 메모 ── */
  const calSelNotes = calSelDate ? (calDateMap[calSelDate] || []) : []

  /* ════════════ 렌더 분기 ════════════ */
  if (authLoading) {
    return <div className="pn-app"><div className="pn-center-msg">세션 확인 중...</div></div>
  }

  /* ── 로그인 화면 ── */
  if (!user) {
    return (
      <div className="pn-app">
        <PnHeader onBack={onBack} />
        <div className="pn-login-wrap">
          <form className="pn-login-box" onSubmit={doLogin}>
            <div className="pn-login-icon">🔒</div>
            <h2 className="pn-login-title">비공개 메모장 로그인</h2>
            <p className="pn-login-desc">본인만 볼 수 있는 비공개 메모장입니다.<br />Supabase 계정으로 로그인해 주세요.</p>
            {loginErr && <div className="pn-login-err">{loginErr}</div>}
            <div className="pn-field">
              <label>이메일</label>
              <input type="email" placeholder="이메일" value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)} autoFocus />
            </div>
            <div className="pn-field">
              <label>비밀번호</label>
              <input type="password" placeholder="비밀번호" value={loginPw}
                onChange={e => setLoginPw(e.target.value)} />
            </div>
            <button type="submit" className="pn-login-btn" disabled={loginBusy}>
              {loginBusy ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  /* ── 메인 화면 ── */
  return (
    <div className="pn-app">
      {/* 헤더 */}
      <header className="pn-header">
        <div className="pn-brand">
          <div className="pn-brand-mark">H</div>
          <div>
            <div className="pn-brand-title">
              비공개 개인 메모장&nbsp;<span className="pn-lock-badge">🔒 비공개</span>
            </div>
            <div className="pn-brand-sub">유튜브 아이디어 · 블로그 소재 · AI 공부 · 수익화 구상 · 개인 생각</div>
          </div>
        </div>
        <div className="pn-header-right">
          <span className="pn-user-chip">🔒 {user.email}</span>
          <button type="button" className="pn-logout-btn" onClick={doLogout}>로그아웃</button>
          <button type="button" className="pn-back-btn" onClick={onBack}>← 업무일지로 돌아가기</button>
        </div>
      </header>

      {/* 에러 */}
      {dataErr && (
        <div className="pn-err">
          {dataErr}
          <button type="button" className="pn-err-close" onClick={() => setDataErr('')}>✕</button>
        </div>
      )}

      {/* 툴바 */}
      <div className="pn-toolbar">
        <div className="pn-toolbar-left">
          {/* 검색 */}
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
          {/* 보기 전환 */}
          <div className="pn-view-tabs">
            <button type="button"
              className={`pn-view-tab${view === 'list' ? ' active' : ''}`}
              onClick={() => { setView('list'); setCalSelDate(null) }}>
              ☰ 목록
            </button>
            <button type="button"
              className={`pn-view-tab${view === 'calendar' ? ' active' : ''}`}
              onClick={() => { setView('calendar'); closeForm() }}>
              📅 달력
            </button>
          </div>
        </div>
        {/* 새 메모 작성 버튼 */}
        {!showForm && (
          <button type="button" className="pn-new-btn" onClick={openNewForm}>
            + 새 메모 작성
          </button>
        )}
      </div>

      {/* 분류 필터 (목록 보기일 때만) */}
      {view === 'list' && (
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
      )}

      {/* 본문 */}
      <div className="pn-body">

        {/* ═══ 작성폼 (열렸을 때만) ═══ */}
        {showForm && (
          <div ref={formRef} className="pn-form-wrap">
            <form className="pn-form" onSubmit={saveNote}>
              <div className="pn-form-head">
                <span className="pn-form-title">{editId ? '✏️ 메모 수정' : '✏️ 새 메모 작성'}</span>
                <button type="button" className="pn-cancel-btn" onClick={closeForm}>✕ 닫기</button>
              </div>

              {/* 제목 + 분류 */}
              <div className="pn-form-top-row">
                <input
                  className="pn-title-input"
                  type="text"
                  placeholder="제목을 입력해주세요"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                  autoFocus
                />
                <select
                  className="pn-cat-select"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CAT_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* 메모 내용 */}
              <textarea
                className="pn-memo-input"
                placeholder="유튜브 아이디어, 블로그 초안, AI 공부 메모, 수익화 구상, 개인 생각 등을 자유롭게 적어주세요."
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              />

              <div className="pn-form-foot">
                <button type="button" className="pn-cancel-btn" onClick={closeForm}>취소</button>
                <button type="submit" className="pn-save-btn" disabled={saveBusy}>
                  {saveBusy ? '저장 중...' : '💾 저장'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ═══ 목록 보기 ═══ */}
        {view === 'list' && (
          <div className="pn-list">
            {/* 결과 요약 */}
            <div className="pn-list-info">
              메모 {filteredNotes.length}개
              {catFilter !== '전체' ? ` · ${catFilter}` : ''}
              {searchQ ? ` · "${searchQ}"` : ''}
            </div>

            {dataLoading && <div className="pn-center-msg">메모를 불러오는 중...</div>}

            {!dataLoading && filteredNotes.length === 0 && (
              <div className="pn-empty-state">
                <div className="pn-empty-icon">📝</div>
                <div className="pn-empty-text">
                  {searchQ || catFilter !== '전체'
                    ? '검색 결과가 없습니다.'
                    : '아직 저장된 메모가 없습니다.'}
                </div>
                {!searchQ && catFilter === '전체' && (
                  <button type="button" className="pn-new-btn" onClick={openNewForm}>
                    + 새 메모 작성
                  </button>
                )}
              </div>
            )}

            {!dataLoading && filteredNotes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => openEditForm(note)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
          </div>
        )}

        {/* ═══ 달력 보기 ═══ */}
        {view === 'calendar' && (
          <div className="pn-cal-view">
            {/* 달력 */}
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
                  onSelect={onCalDateClick}
                />
              </div>

              {/* 범례 */}
              <div className="pn-cal-legend">
                {CAT_OPTIONS.filter(c => notes.some(n => isoToDate(n.created_at)?.startsWith(`${calYear}-${String(calMonth+1).padStart(2,'0')}`) && n.category === c))
                  .map(cat => (
                    <span key={cat} className="pn-leg-item">
                      <span className="pn-leg-dot" style={{ background: CAT_COLOR[cat] }} />
                      {cat}
                    </span>
                  ))}
              </div>
            </div>

            {/* 선택된 날짜 메모 */}
            {calSelDate ? (
              <div className="pn-cal-day-notes">
                <div className="pn-cal-day-title">
                  📅 {fmtKo(calSelDate)} 작성 메모
                  <span className="pn-cal-day-count">{calSelNotes.length}개</span>
                </div>
                {calSelNotes.length === 0 ? (
                  <div className="pn-center-msg" style={{ minHeight: '80px' }}>
                    이 날짜에 작성한 메모가 없습니다.
                  </div>
                ) : (
                  calSelNotes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onEdit={() => { openEditForm(note); setView('list') }}
                      onDelete={() => deleteNote(note.id)}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="pn-cal-hint">날짜를 클릭하면 해당 날짜에 작성한 메모를 볼 수 있습니다.</div>
            )}
          </div>
        )}

      </div>{/* /pn-body */}
    </div>
  )
}

/* ══════════════════════════════════════════════
   헤더 (로그인 전용 단순 버전)
══════════════════════════════════════════════ */
function PnHeader({ onBack }) {
  return (
    <header className="pn-header">
      <div className="pn-brand">
        <div className="pn-brand-mark">H</div>
        <div className="pn-brand-title">
          비공개 개인 메모장&nbsp;<span className="pn-lock-badge">🔒 비공개</span>
        </div>
      </div>
      <button type="button" className="pn-back-btn" onClick={onBack}>← 업무일지로 돌아가기</button>
    </header>
  )
}

/* ══════════════════════════════════════════════
   메모 카드
══════════════════════════════════════════════ */
function NoteCard({ note, onEdit, onDelete }) {
  const color = CAT_COLOR[note.category] || '#9ca3af'
  const isEdited = note.updated_at && note.updated_at !== note.created_at
  return (
    <div className="pn-card" style={{ '--cat-c': color }}>
      <div className="pn-card-head">
        <span className="pn-card-cat" style={{ color, borderColor: color + '55' }}>
          {note.category}
        </span>
        <span className="pn-card-title">{note.title}</span>
      </div>
      {note.memo && <div className="pn-card-body">{note.memo}</div>}
      <div className="pn-card-foot">
        <span className="pn-card-date">
          작성 {fmtShort(note.created_at)}
          {isEdited ? ` · 수정 ${fmtShort(note.updated_at)}` : ''}
        </span>
        <div className="pn-card-actions">
          <button type="button" className="pn-act-btn" onClick={onEdit}>✏️ 수정</button>
          <button type="button" className="pn-act-btn pn-act-del" onClick={onDelete}>🗑 삭제</button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   달력 셀
══════════════════════════════════════════════ */
function CalCells({ year, month, calDateMap, selDate, onSelect }) {
  const todayStr   = isoToDate(new Date().toISOString())
  const firstDow   = new Date(year, month, 1).getDay()
  const daysInMon  = new Date(year, month + 1, 0).getDate()
  const prevDays   = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: prevDays - i, cur: false })
  for (let d = 1; d <= daysInMon; d++)     cells.push({ day: d, cur: true })
  const remain = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= remain; d++)        cells.push({ day: d, cur: false })

  return cells.map((cell, i) => {
    const dow     = i % 7
    const dateStr = cell.cur
      ? `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
      : null
    const isToday = dateStr === todayStr
    const isSel   = dateStr === selDate
    const dayNotes = (cell.cur && dateStr && calDateMap[dateStr]) || []

    // 분류별 유니크 색상 점 (최대 4개)
    const dotColors = [...new Set(dayNotes.map(n => CAT_COLOR[n.category] || '#9ca3af'))].slice(0, 4)

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
        {dotColors.length > 0 && (
          <div className="pn-cal-dots">
            {dotColors.map((c, j) => (
              <span key={j} className="pn-cal-dot" style={{ background: c }} />
            ))}
          </div>
        )}
        {dayNotes.length > 0 && (
          <span className="pn-cal-count">{dayNotes.length}</span>
        )}
      </div>
    )
  })
}
