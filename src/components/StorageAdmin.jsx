import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './StorageAdmin.css'

const GENERIC_DATA_ERROR = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

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

export default function StorageAdmin({ onBack }) {
  const [buckets, setBuckets] = useState([])
  const [tables, setTables] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')

  useEffect(() => {
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
      } catch {
        if (ignore) return
        setDataError(GENERIC_DATA_ERROR)
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
  }, [])

  const totalBytes = buckets.reduce((sum, b) => sum + Number(b.total_bytes || 0), 0)
  const totalFiles = buckets.reduce((sum, b) => sum + Number(b.file_count || 0), 0)

  return (
    <div className="sa-app">
      <header className="sa-header">
        <div className="sa-brand">
          <div className="sa-brand-mark">💾</div>
          <div>
            <div className="sa-brand-title">저장공간 관리</div>
            <div className="sa-brand-sub">버킷별 파일 사용량 · DB 테이블 용량</div>
          </div>
        </div>
        <div className="sa-header-right">
          <button type="button" className="sa-back-btn" onClick={onBack}>← 업무일지로 돌아가기</button>
        </div>
      </header>

      <div className="sa-body">
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
      </div>
    </div>
  )
}
