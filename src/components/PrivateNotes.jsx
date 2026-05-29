import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './PrivateNotes.css'

/* ── 카테고리 컬러 맵 ── */
const CAT_COLORS = {
  유튜브: '#ef4444',
  블로그: '#22c55e',
  AI공부: '#a855f7',
  수익화: '#f59e0b',
  개인일정: '#3b82f6',
  아이디어: '#6b7280',
  기타: '#9ca3af',
}
const CATS = Object.keys(CAT_COLORS)
const STATUSES = ['예정', '진행중', '보류', '완료']
const PRIORITIES = ['높음', '보통', '낮음']

/* ── 날짜 헬퍼 ── */
function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function todayStr() { return toDateStr(new Date()) }
function thisWeekRange() {
  const now = new Date()
  const dow = now.getDay() // 0=일
  const mon = new Date(now)
  mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { start: toDateStr(mon), end: toDateStr(sun) }
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/* ── 빈 폼 기본값 ── */
const EMPTY_FORM = {
  title: '',
  category: '유튜브',
  status: '예정',
  priority: '보통',
  due_date: '',
  memo: '',
  next_action: '',
}

export default function PrivateNotes({ onBack }) {
  /* ── 인증 ── */
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  /* ── 데이터 ── */
  const [notes, setNotes] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataErr, setDataErr] = useState('')

  /* ── 폼 ── */
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const formRef = useRef(null)

  /* ── 필터/검색 ── */
  const [filter, setFilter] = useState('active') // active | today | week | done
  const [catFilter, setCatFilter] = useState('')
  const [searchQ, setSearchQ] = useState('')

  /* ── 캘린더 ── */
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())

  /* ════════════════════════════════
     세션 복원
  ════════════════════════════════ */
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

  /* ════════════════════════════════
     노트 로드
  ════════════════════════════════ */
  const loadNotes = useCallback(async () => {
    if (!user) return
    setDataLoading(true)
    setDataErr('')
    try {
      const { data, error } = await supabase
        .from('private_notes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setNotes(data || [])
    } catch (e) {
      setDataErr(`불러오기 실패: ${e.message}`)
    } finally {
      setDataLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) loadNotes()
  }, [user, loadNotes])

  /* ════════════════════════════════
     로그인 / 로그아웃
  ════════════════════════════════ */
  async function doLogin(e) {
    e.preventDefault()
    setLoginErr('')
    if (!loginEmail || !loginPw) { setLoginErr('이메일과 비밀번호를 입력해주세요.'); return }
    setLoginBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPw })
      if (error) throw error
    } catch (err) {
      setLoginErr(err.message || '로그인 실패: 이메일 또는 비밀번호를 확인해주세요.')
    } finally {
      setLoginBusy(false)
    }
  }

  async function doLogout() {
    await supabase.auth.signOut()
    setNotes([])
    setForm(EMPTY_FORM)
    setEditId(null)
  }

  /* ════════════════════════════════
     CRUD
  ════════════════════════════════ */
  async function saveNote(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaveBusy(true)
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        memo: form.memo.trim() || null,
        next_action: form.next_action.trim() || null,
        writer_name: user.email,
        updated_at: new Date().toISOString(),
      }
      if (editId) {
        const { error } = await supabase.from('private_notes').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        payload.user_id = user.id
        const { error } = await supabase.from('private_notes').insert(payload)
        if (error) throw error
      }
      resetForm()
      await loadNotes()
    } catch (err) {
      setDataErr(`저장 실패: ${err.message}`)
    } finally {
      setSaveBusy(false)
    }
  }

  async function markDone(id) {
    try {
      const { error } = await supabase
        .from('private_notes')
        .update({ status: '완료', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      setNotes(prev => prev.map(n => n.id === id ? { ...n, status: '완료' } : n))
    } catch (err) {
      setDataErr(`완료 처리 실패: ${err.message}`)
    }
  }

  async function deleteNote(id) {
    if (!window.confirm('이 노트를 삭제할까요?')) return
    try {
      const { error } = await supabase.from('private_notes').delete().eq('id', id)
      if (error) throw error
      setNotes(prev => prev.filter(n => n.id !== id))
    } catch (err) {
      setDataErr(`삭제 실패: ${err.message}`)
    }
  }

  function startEdit(note) {
    setEditId(note.id)
    setForm({
      title: note.title || '',
      category: note.category || '유튜브',
      status: note.status || '예정',
      priority: note.priority || '보통',
      due_date: note.due_date || '',
      memo: note.memo || '',
      next_action: note.next_action || '',
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function resetForm() {
    setEditId(null)
    setForm(EMPTY_FORM)
  }

  /* ════════════════════════════════
     필터링된 노트
  ════════════════════════════════ */
  const filteredNotes = useMemo(() => {
    const today = todayStr()
    const { start, end } = thisWeekRange()
    const q = searchQ.trim().toLowerCase()

    let list = [...notes]

    if (filter === 'today')  list = list.filter(n => n.due_date === today && n.status !== '완료')
    else if (filter === 'week') list = list.filter(n => n.due_date && n.due_date >= start && n.due_date <= end && n.status !== '완료')
    else if (filter === 'done') list = list.filter(n => n.status === '완료')
    else list = list.filter(n => n.status !== '완료') // active

    if (catFilter) list = list.filter(n => n.category === catFilter)
    if (q) list = list.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.memo || '').toLowerCase().includes(q) ||
      (n.next_action || '').toLowerCase().includes(q)
    )
    return list
  }, [notes, filter, catFilter, searchQ])

  /* ════════════════════════════════
     요약 수치
  ════════════════════════════════ */
  const summary = useMemo(() => {
    const today = todayStr()
    const { start, end } = thisWeekRange()
    return {
      today: notes.filter(n => n.due_date === today && n.status !== '완료').length,
      week: notes.filter(n => n.due_date && n.due_date >= start && n.due_date <= end && n.status !== '완료').length,
      active: notes.filter(n => n.status === '진행중').length,
      done: notes.filter(n => n.status === '완료').length,
    }
  }, [notes])

  /* ════════════════════════════════
     캘린더
  ════════════════════════════════ */
  const calData = useMemo(() => {
    const map = {}
    notes.forEach(n => {
      if (!n.due_date) return
      const [y, m] = n.due_date.split('-').map(Number)
      if (y !== calYear || m - 1 !== calMonth) return
      const day = parseInt(n.due_date.split('-')[2], 10)
      if (!map[day]) map[day] = []
      map[day].push(n)
    })
    return map
  }, [notes, calYear, calMonth])

  const usedCats = useMemo(() =>
    [...new Set(notes.filter(n => n.due_date).map(n => n.category))],
    [notes]
  )

  function calMove(delta) {
    let m = calMonth + delta
    let y = calYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCalMonth(m)
    setCalYear(y)
  }

  /* ════════════════════════════════
     로딩 중
  ════════════════════════════════ */
  if (authLoading) {
    return (
      <div className="pn-app">
        <div className="pn-auth-loading">세션 확인 중...</div>
      </div>
    )
  }

  /* ════════════════════════════════
     로그인 화면
  ════════════════════════════════ */
  if (!user) {
    return (
      <div className="pn-app">
        <header className="pn-header">
          <div className="pn-brand">
            <div className="pn-brand-mark">H</div>
            <div>
              <div className="pn-brand-title">비공개 개인업무 노트 <span className="pn-lock-badge">🔒 비공개</span></div>
              <div className="pn-brand-sub">하이탑 AI 업무센터 · 개인 전용</div>
            </div>
          </div>
          <button type="button" className="pn-back-btn" onClick={onBack}>
            ← 업무일지로 돌아가기
          </button>
        </header>

        <div className="pn-login-wrap">
          <form className="pn-login-box" onSubmit={doLogin}>
            <div className="pn-login-icon">🔒</div>
            <h2 className="pn-login-title">개인 노트 로그인</h2>
            <p className="pn-login-desc">
              이 공간은 본인만 볼 수 있는 비공개 노트입니다.<br />
              Supabase 계정으로 로그인해 주세요.
            </p>
            {loginErr && <div className="pn-login-err">{loginErr}</div>}
            <div className="pn-field">
              <label>이메일</label>
              <input
                type="email"
                placeholder="이메일 입력"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="pn-field">
              <label>비밀번호</label>
              <input
                type="password"
                placeholder="비밀번호 입력"
                value={loginPw}
                onChange={e => setLoginPw(e.target.value)}
              />
            </div>
            <button type="submit" className="pn-login-btn" disabled={loginBusy}>
              {loginBusy ? '로그인 중...' : '로그인'}
            </button>
            <p className="pn-login-note">
              Supabase RLS로 보호됩니다. 본인의 노트만 조회·수정·삭제 가능합니다.
            </p>
          </form>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════
     메인 화면 (로그인 후)
  ════════════════════════════════ */
  const today = todayStr()

  return (
    <div className="pn-app">
      {/* 헤더 */}
      <header className="pn-header">
        <div className="pn-brand">
          <div className="pn-brand-mark">H</div>
          <div>
            <div className="pn-brand-title">비공개 개인업무 노트 <span className="pn-lock-badge">🔒 비공개</span></div>
            <div className="pn-brand-sub">하이탑 AI 업무센터 · 개인 전용</div>
          </div>
        </div>
        <div className="pn-header-right">
          <span className="pn-user-info">🔒 {user.email}</span>
          <button type="button" className="pn-logout-btn" onClick={doLogout}>로그아웃</button>
          <button type="button" className="pn-back-btn" onClick={onBack}>← 업무일지로 돌아가기</button>
        </div>
      </header>

      {/* 요약 박스 */}
      <div className="pn-summary">
        <div className="pn-sbox"><div className="pn-sval">{summary.today}</div><div className="pn-slabel">오늘 마감</div></div>
        <div className="pn-sbox"><div className="pn-sval">{summary.week}</div><div className="pn-slabel">이번 주 마감</div></div>
        <div className="pn-sbox"><div className="pn-sval">{summary.active}</div><div className="pn-slabel">진행중</div></div>
        <div className="pn-sbox"><div className="pn-sval">{summary.done}</div><div className="pn-slabel">완료</div></div>
      </div>

      {/* 에러 */}
      {dataErr && <div className="pn-err">{dataErr}<button type="button" onClick={() => setDataErr('')} className="pn-err-close">✕</button></div>}

      {/* 메인 그리드 */}
      <div className="pn-main">
        {/* ── 좌측: 입력 폼 ── */}
        <div ref={formRef}>
          <form className="pn-form-panel" onSubmit={saveNote}>
            <div className="pn-form-title">{editId ? '✏️ 노트 수정' : '✏️ 새 노트 추가'}</div>

            <div className="pn-fg">
              <label>제목 *</label>
              <input
                type="text"
                placeholder="업무 제목"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            <div className="pn-fg-row">
              <div className="pn-fg">
                <label>카테고리</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="pn-fg">
                <label>상태</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="pn-fg-row">
              <div className="pn-fg">
                <label>우선순위</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="pn-fg">
                <label>마감일</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>

            <div className="pn-fg">
              <label>메모</label>
              <textarea
                rows={3}
                placeholder="업무 내용, 아이디어 등"
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              />
            </div>

            <div className="pn-fg">
              <label>다음 할 일</label>
              <input
                type="text"
                placeholder="다음에 해야 할 구체적인 액션"
                value={form.next_action}
                onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))}
              />
            </div>

            <div className="pn-form-actions">
              <button type="submit" className="pn-btn pn-btn-primary" disabled={saveBusy}>
                {saveBusy ? '저장 중...' : '💾 저장'}
              </button>
              {editId && (
                <button type="button" className="pn-btn pn-btn-ghost" onClick={resetForm}>
                  취소
                </button>
              )}
            </div>
          </form>
        </div>

        {/* ── 우측: 필터 + 카드 + 캘린더 ── */}
        <div className="pn-right">
          {/* 필터 바 */}
          <div className="pn-filter-bar">
            {[['active','전체'], ['today','📅 오늘할일'], ['week','📆 이번주'], ['done','✅ 완료']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`pn-filter-btn${filter === key ? ' active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
            <input
              className="pn-search"
              type="text"
              placeholder="🔍 검색 (제목/메모/다음할일)"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
          </div>

          {/* 카테고리 필터 */}
          <div className="pn-cat-filter">
            {CATS.map(cat => (
              <button
                key={cat}
                type="button"
                className={`pn-cat-btn${catFilter === cat ? ' active' : ''}`}
                style={{
                  '--cat-c': CAT_COLORS[cat],
                }}
                onClick={() => setCatFilter(catFilter === cat ? '' : cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 카드 목록 */}
          <div className="pn-cards">
            {dataLoading && <div className="pn-empty">노트를 불러오는 중...</div>}
            {!dataLoading && filteredNotes.length === 0 && (
              <div className="pn-empty">해당하는 노트가 없습니다.</div>
            )}
            {!dataLoading && filteredNotes.map(note => {
              const color = CAT_COLORS[note.category] || '#9ca3af'
              const isDone = note.status === '완료'
              const isOverdue = note.due_date && note.due_date < today && !isDone
              return (
                <div
                  key={note.id}
                  className={`pn-card${isDone ? ' done' : ''}`}
                  style={{ '--cat-c': color }}
                >
                  <div className="pn-card-top">
                    <div className="pn-card-title">{note.title}</div>
                    <div className="pn-card-badges">
                      <span className="pn-badge pn-badge-cat" style={{ color, borderColor: color + '60' }}>{note.category}</span>
                      <span className={`pn-badge pn-badge-status pn-s-${note.status}`}>{note.status}</span>
                      <span className={`pn-badge pn-badge-pri pn-p-${note.priority}`}>{note.priority}</span>
                    </div>
                  </div>
                  <div className="pn-card-meta">
                    {note.due_date && (
                      <span style={isOverdue ? { color: '#fca5a5', fontWeight: 700 } : {}}>
                        📅 {note.due_date}{isOverdue ? ' ⚠️ 마감초과' : ''}
                      </span>
                    )}
                    <span className="pn-card-date">{fmtDate(note.created_at)}</span>
                  </div>
                  {note.memo && <div className="pn-card-memo">{note.memo}</div>}
                  {note.next_action && (
                    <div className="pn-card-next"><span className="pn-next-label">▶ 다음:</span> {note.next_action}</div>
                  )}
                  <div className="pn-card-actions">
                    <button type="button" className="pn-act-btn" onClick={() => startEdit(note)}>✏️ 수정</button>
                    {!isDone && (
                      <button type="button" className="pn-act-btn pn-act-done" onClick={() => markDone(note.id)}>✅ 완료</button>
                    )}
                    <button type="button" className="pn-act-btn pn-act-del" onClick={() => deleteNote(note.id)}>🗑 삭제</button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 캘린더 */}
          <div className="pn-cal-panel">
            <div className="pn-cal-header">
              <span className="pn-cal-title">{calYear}년 {calMonth + 1}월</span>
              <div className="pn-cal-nav">
                <button type="button" onClick={() => calMove(-1)}>◀</button>
                <button type="button" onClick={() => calMove(1)}>▶</button>
              </div>
            </div>
            <CalendarGrid year={calYear} month={calMonth} calData={calData} />
            {usedCats.length > 0 && (
              <div className="pn-cal-legend">
                {usedCats.map(cat => (
                  <div key={cat} className="pn-leg-item">
                    <span className="pn-leg-dot" style={{ background: CAT_COLORS[cat] }} />
                    {cat}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 캘린더 그리드 서브컴포넌트 ── */
function CalendarGrid({ year, month, calData }) {
  const today = todayStr()
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()

  const cells = []

  // 이전 달
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, cur: false })
  }
  // 이번 달
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, cur: true })
  }
  // 다음 달
  const remain = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= remain; d++) {
    cells.push({ day: d, cur: false })
  }

  return (
    <div className="pn-cal-grid">
      {dayNames.map((n, i) => (
        <div key={n} className={`pn-cal-dname${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{n}</div>
      ))}
      {cells.map((cell, i) => {
        const dow = i % 7
        const dateStr = cell.cur
          ? `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
          : null
        const isToday = dateStr === today
        const notes = (cell.cur && calData[cell.day]) || []
        return (
          <div
            key={i}
            className={`pn-cal-cell${!cell.cur ? ' other' : ''}${isToday ? ' today' : ''}`}
          >
            <span className={`pn-cal-num${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}`}>{cell.day}</span>
            {notes.length > 0 && (
              <div className="pn-cal-dots">
                {notes.slice(0, 4).map((n, j) => (
                  <span
                    key={j}
                    className="pn-cal-dot"
                    style={{ background: CAT_COLORS[n.category] || '#9ca3af' }}
                    title={n.title}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
