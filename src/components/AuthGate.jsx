import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './AuthGate.css'

// 이 앱의 유일한 관리자 계정 — Supabase Auth에 이미 등록되어 있음
// (haitop-realty-system / hitop-property-platform 등 같은 Supabase 프로젝트를
// 공유하는 다른 HITOP 앱과 동일 계정). 비밀번호 재설정은 haitop-realty-system의
// reset-password.html에서 처리하므로 이 앱에는 별도 재설정 화면을 두지 않는다.
const ADMIN_EMAIL = 'hh720403@gmail.com'

// session: undefined = 세션 확인 중, null = 로그인 필요, 객체 = 로그인됨
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        // 이 앱은 자체 비밀번호 재설정 화면이 없다 — 재설정 세션이 생겨도 잠금을 유지한다.
        setSession(null)
        return
      }
      setSession(newSession ?? null)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === null) inputRef.current?.focus()
  }, [session])

  async function tryAuth() {
    if (!value) return
    setError('')
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: value,
    })
    setLoading(false)
    if (signInError) {
      setError('비밀번호가 틀렸습니다.')
      setValue('')
      return
    }
    setValue('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (session === undefined) {
    // 세션 확인 중에는 화면을 아무것도 그리지 않는다(children 마운트 방지).
    return <div className="auth-overlay" />
  }

  if (session === null) {
    return (
      <div className="auth-overlay">
        <div className="auth-brand">
          <div className="auth-logo">🏢</div>
          <div className="auth-title">HITOP 부동산</div>
          <div className="auth-sub">파주/운정을 가장 잘 아는 상가·토지·오피스텔 전문</div>
        </div>
        <div className="auth-form">
          <input
            ref={inputRef}
            type="password"
            placeholder="비밀번호를 입력하세요"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') tryAuth() }}
            disabled={loading}
          />
          <div className="auth-error">{error}</div>
          <button type="button" onClick={tryAuth} disabled={loading}>
            {loading ? '확인 중...' : '확인'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="auth-topbar">
        <button type="button" className="auth-logout-btn" onClick={handleLogout}>로그아웃</button>
      </div>
      {children}
    </>
  )
}
