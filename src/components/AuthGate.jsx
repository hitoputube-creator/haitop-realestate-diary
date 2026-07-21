import { useEffect, useRef, useState } from 'react'
import './AuthGate.css'

const PW = 'hitop2025'
const KEY = 'hitop_auth'

export default function AuthGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!unlocked) inputRef.current?.focus()
  }, [unlocked])

  function tryAuth() {
    if (value === PW) {
      sessionStorage.setItem(KEY, '1')
      setUnlocked(true)
      setError('')
    } else {
      setError('비밀번호가 틀렸습니다.')
      setValue('')
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(KEY)
    setUnlocked(false)
    setValue('')
    setError('')
  }

  if (!unlocked) {
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
          />
          <div className="auth-error">{error}</div>
          <button type="button" onClick={tryAuth}>확인</button>
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
