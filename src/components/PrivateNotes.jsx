import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './PrivateNotes.css'

const CATS = ['전체', '유튜브', '블로그', 'AI공부', '수익화', '개인생각', '아이디어', '기타']
const CAT_OPTIONS = CATS.slice(1) // 전체 제외, 입력 옵션용

const CAT_COLORS = {
  유튜브: '#ef4444',
  블로그: '#22c55e',
  AI공부: '#a855f7',
  수익화: '#f59e0b',
  개인생각: '#3b82f6',
  아이디어: '#6b7280',
  기타: '#9ca3af',
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY = { title: '', category: '유튜브', memo: '' }

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

  /* ── 입력폼 ── */
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const formRef = useRef(null)

  /* ── 검색/필터 ── */
  const [catFilter, setCatFilter] = useState('전체')
  const [searchQ, setSearchQ] = useState('')

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
    resetForm()
  }

  /* ── 저장 ── */
  async function saveNote(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaveBusy(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        title: form.title.trim(),
        category: form.category,
        memo: form.memo.trim() || null,
        updated_at: now,
        // 기존 컬럼 — 화면 미사용, DB NOT NULL 제약 충족용 기본값
        status: '메모',
        priority: '보통',
        due_date: null,
        next_action: null,
      }
      if (editId) {
        const { error } = await supabase.from('private_notes').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        payload.user_id = user.id
        payload.writer_name = user.email
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

  /* ── 수정 시작 ── */
  function startEdit(note) {
    setEditId(note.id)
    setForm({ title: note.title || '', category: note.category || '유튜브', memo: note.memo || '' })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ── 폼 초기화 ── */
  function resetForm() {
    setEditId(null)
    setForm(EMPTY)
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

  /* ── 필터링 ── */
  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return notes.filter(n => {
      if (catFilter !== '전체' && n.category !== catFilter) return false
      if (q && !(n.title || '').toLowerCase().includes(q) && !(n.memo || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [notes, catFilter, searchQ])

  /* ── 로딩 중 ── */
  if (authLoading) {
    return <div className="pn-app"><div className="pn-center-msg">세션 확인 중...</div></div>
  }

  /* ── 로그인 화면 ── */
  if (!user) {
    return (
      <div className="pn-app">
        <header className="pn-header">
          <div className="pn-brand">
            <div className="pn-brand-mark">H</div>
            <div className="pn-brand-title">비공개 개인 메모장 <span className="pn-lock-badge">🔒 비공개</span></div>
          </div>
          <button type="button" className="pn-back-btn" onClick={onBack}>← 업무일지로 돌아가기</button>
        </header>
        <div className="pn-login-wrap">
          <form className="pn-login-box" onSubmit={doLogin}>
            <div className="pn-login-icon">🔒</div>
            <h2 className="pn-login-title">비공개 메모장 로그인</h2>
            <p className="pn-login-desc">본인만 볼 수 있는 비공개 메모장입니다.<br />Supabase 계정으로 로그인해 주세요.</p>
            {loginErr && <div className="pn-login-err">{loginErr}</div>}
            <div className="pn-field">
              <label>이메일</label>
              <input type="email" placeholder="이메일" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} autoFocus />
            </div>
            <div className="pn-field">
              <label>비밀번호</label>
              <input type="password" placeholder="비밀번호" value={loginPw} onChange={e => setLoginPw(e.target.value)} />
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
            <div className="pn-brand-title">비공개 개인 메모장 <span className="pn-lock-badge">🔒 비공개</span></div>
            <div className="pn-brand-sub">유튜브 아이디어, 블로그 소재, AI 공부 내용, 수익화 구상, 개인 생각을 자유롭게 저장하는 비공개 메모장입니다.</div>
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
          <button type="button" onClick={() => setDataErr('')} className="pn-err-close">✕</button>
        </div>
      )}

      {/* 본문 */}
      <div className="pn-body">

        {/* ── 작성 영역 ── */}
        <div ref={formRef}>
          <form className="pn-write-panel" onSubmit={saveNote}>
            <div className="pn-write-header">
              <span className="pn-write-title">{editId ? '✏️ 메모 수정' : '✏️ 새 메모 작성'}</span>
              {editId && (
                <button type="button" className="pn-cancel-btn" onClick={resetForm}>취소</button>
              )}
            </div>

            {/* 제목 + 분류 한 줄 */}
            <div className="pn-top-row">
              <input
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
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
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

            <div className="pn-write-footer">
              <button type="submit" className="pn-save-btn" disabled={saveBusy}>
                {saveBusy ? '저장 중...' : '💾 저장'}
              </button>
            </div>
          </form>
        </div>

        {/* ── 저장된 메모 ── */}
        <div className="pn-list-section">
          {/* 검색 + 필터 */}
          <div className="pn-controls">
            <input
              className="pn-search"
              type="text"
              placeholder="🔍 제목 또는 내용 검색"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
            <div className="pn-cat-filter">
              {CATS.map(cat => (
                <button
                  key={cat}
                  type="button"
                  className={`pn-cat-btn${catFilter === cat ? ' active' : ''}`}
                  style={cat !== '전체' ? { '--cat-c': CAT_COLORS[cat] } : {}}
                  onClick={() => setCatFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 메모 수 */}
          <div className="pn-count">
            메모 {filtered.length}개{catFilter !== '전체' ? ` · ${catFilter}` : ''}{searchQ ? ` · "${searchQ}"` : ''}
          </div>

          {/* 카드 목록 */}
          {dataLoading && <div className="pn-center-msg">메모를 불러오는 중...</div>}
          {!dataLoading && filtered.length === 0 && (
            <div className="pn-center-msg">저장된 메모가 없습니다.</div>
          )}
          {!dataLoading && filtered.map(note => {
            const color = CAT_COLORS[note.category] || '#9ca3af'
            return (
              <div key={note.id} className="pn-card" style={{ '--cat-c': color }}>
                <div className="pn-card-head">
                  <span className="pn-card-cat" style={{ color, borderColor: color + '50' }}>{note.category}</span>
                  <span className="pn-card-title">{note.title}</span>
                </div>
                {note.memo && <div className="pn-card-body">{note.memo}</div>}
                <div className="pn-card-foot">
                  <span className="pn-card-date">
                    작성 {fmtDate(note.created_at)}
                    {note.updated_at && note.updated_at !== note.created_at
                      ? ` · 수정 ${fmtDate(note.updated_at)}` : ''}
                  </span>
                  <div className="pn-card-actions">
                    <button type="button" className="pn-act-btn" onClick={() => startEdit(note)}>✏️ 수정</button>
                    <button type="button" className="pn-act-btn pn-act-del" onClick={() => deleteNote(note.id)}>🗑 삭제</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

      </div>{/* /pn-body */}
    </div>
  )
}
