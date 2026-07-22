import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './StorageAdmin.css'

const GENERIC_LOGIN_ERROR = '로그인에 실패했습니다. 이메일 또는 비밀번호를 확인해주세요.'
const NOT_ADMIN_ERROR = '관리자 권한이 없는 계정입니다.'
const GENERIC_DATA_ERROR = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
const SESSION_EXPIRED_ERROR = '세션이 만료되었습니다. 다시 로그인해주세요.'

function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n
  let unitIndex = -1
  do {
    value /= 1024
    unitIndex += 1
  } while (value >= 1024 && unitIndex < units.length - 1)
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

function isJwtError(err) {
  return err?.code === 'PGRST301' || /jwt/i.test(err?.message || '')
}

export default function StorageAdmin({ onBack }) {
  /* undefined = 세션 확인 중, null = 비로그인, 객체 = 로그인됨 */
  const [session, setSession] = useState(undefined)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [buckets, setBuckets] = useState([])
  const [tables, setTables] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session || null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return undefined
    let ignore = false

    async function run() {
      setDataLoading(true)
      setDataError('')
      try {
        const [storageRes, dbRes] = await Promise.all([
          supabase.rpc('get_storage_usage'),
          supabase.rpc('get_db_table_sizes'),
        ])
        if (storageRes.error) throw storageRes.error
        if (dbRes.error) throw dbRes.error
        if (ignore) return
        setBuckets(storageRes.data || [])
        setTables(dbRes.data || [])
      } catch (err) {
        if (ignore) return
        if (err?.code === '42501') {
          setDataError(NOT_ADMIN_ERROR)
        } else if (isJwtError(err)) {
          setDataError(SESSION_EXPIRED_ERROR)
          supabase.auth.signOut()
        } else {
          setDataError(GENERIC_DATA_ERROR)
        }
        setBuckets([])
        setTables([])
      } finally {
        if (!ignore) setDataLoading(false)
      }
    }

    run()
    return () => {
      ignore = true
    }
  }, [session])

  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setPassword('')
    } catch {
      setLoginError(GENERIC_LOGIN_ERROR)
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const totalBytes = buckets.reduce((sum, b) => sum + Number(b.total_bytes || 0), 0)
  const totalFiles = buckets.reduce((sum, b) => sum + Number(b.file_count || 0), 0)

  return (
    <div className="sa-app">
      <header className="sa-header">
        <div className="sa-brand">
          <div className="sa-brand-mark">💾</div>
          <div>
            <div className="sa-brand-title">저장공간 관리</div>
            <div className="sa-brand-sub">버킷별 파일 사용량 · DB 테이블 용량 (관리자 전용)</div>
          </div>
        </div>
        <div className="sa-header-right">
          {session ? (
            <button type="button" className="sa-logout-btn" onClick={handleLogout}>로그아웃</button>
          ) : null}
          <button type="button" className="sa-back-btn" onClick={onBack}>← 업무일지로 돌아가기</button>
        </div>
      </header>

      <div className="sa-body">
        {session === undefined && <div className="sa-loading">확인 중...</div>}

        {session === null && (
          <form className="sa-login-form" onSubmit={handleLogin}>
            <div className="sa-login-title">관리자 로그인</div>
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {loginError && <div className="sa-login-error">{loginError}</div>}
            <button type="submit" disabled={loginLoading}>
              {loginLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        )}

        {session && (
          <>
            {dataError && (
              <div className="sa-err">
                <span>{dataError}</span>
                <button type="button" className="sa-err-close" onClick={() => setDataError('')}>✕</button>
              </div>
            )}

            {dataLoading && <div className="sa-loading">불러오는 중...</div>}

            {!dataLoading && !dataError && (
              <>
                <section className="sa-section">
                  <div className="sa-section-title">
                    저장공간 (Storage) — 총 {totalFiles.toLocaleString()}개 파일 · {formatBytes(totalBytes)}
                  </div>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>버킷</th>
                        <th>파일 개수</th>
                        <th>총 용량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buckets.map((b) => (
                        <tr key={b.bucket_id}>
                          <td>{b.bucket_id}</td>
                          <td>{Number(b.file_count).toLocaleString()}</td>
                          <td>{formatBytes(b.total_bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="sa-section">
                  <div className="sa-section-title">DB 테이블 용량 (public 스키마)</div>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>테이블</th>
                        <th>용량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.map((t) => (
                        <tr key={t.table_name}>
                          <td>{t.table_name}</td>
                          <td>{t.pretty_size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
