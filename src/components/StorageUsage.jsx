import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import './StorageUsage.css'

const STORAGE_PLAN_OPTIONS = [
  { key: 'free', label: 'Free', bytes: 1024 ** 3 },
  { key: 'pro', label: 'Pro', bytes: 100 * 1024 ** 3 },
  { key: 'custom', label: '직접입력', bytes: null },
]

const DB_PLAN_OPTIONS = [
  { key: 'free', label: 'Free', bytes: 500 * 1024 ** 2 },
  { key: 'pro', label: 'Pro', bytes: 8 * 1024 ** 3 },
  { key: 'custom', label: '직접입력', bytes: null },
]

const SETTINGS_KEY = 'hitop_storage_usage_settings'
const TRACKED_BUCKETS = [
  { bucket_id: 'crm-attachments', label: '업무일지 사진' },
  { bucket_id: 'listing-images', label: '매물관리 사진' },
]

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 설정 저장 실패는 화면 사용을 막지 않는다.
  }
}

function bytesToMb(bytes) {
  return Number(bytes || 0) / 1024 / 1024
}

function bytesToGb(bytes) {
  return Number(bytes || 0) / 1024 / 1024 / 1024
}

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (value >= 1024 ** 3) return `${bytesToGb(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} GB`
  if (value >= 1024 ** 2) return `${bytesToMb(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} MB`
  if (value >= 1024) return `${(value / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} KB`
  return `${value.toLocaleString('ko-KR')} B`
}

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function usageStatus(percent) {
  if (percent >= 95) return { key: 'danger', label: '위험' }
  if (percent >= 80) return { key: 'warn', label: '주의' }
  return { key: 'ok', label: '여유' }
}

function getLimitBytes(planKey, customGb, options) {
  if (planKey === 'custom') return Math.max(0, Number(customGb || 0)) * 1024 ** 3
  return options.find((option) => option.key === planKey)?.bytes || 0
}

function getObjectSize(row) {
  const raw = row?.metadata?.size
  const size = Number(raw || 0)
  return Number.isFinite(size) ? size : 0
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms)
    }),
  ])
}

async function fetchStorageObjectsFallback() {
  const pageSize = 1000
  let from = 0
  let rows = []

  while (true) {
    const { data, error } = await withTimeout(
      supabase
        .schema('storage')
        .from('objects')
        .select('bucket_id, name, metadata, created_at')
        .in('bucket_id', TRACKED_BUCKETS.map((bucket) => bucket.bucket_id))
        .range(from, from + pageSize - 1),
      12000,
      'Supabase 사진 저장소 조회 시간이 초과되었습니다.'
    )

    if (error) throw error
    const batch = data || []
    rows = rows.concat(batch)
    if (batch.length < pageSize) break
    from += pageSize
  }

  const buckets = TRACKED_BUCKETS.map((bucket) => {
    const bucketRows = rows.filter((row) => row.bucket_id === bucket.bucket_id)
    return {
      ...bucket,
      file_count: bucketRows.length,
      total_bytes: bucketRows.reduce((sum, row) => sum + getObjectSize(row), 0),
      last_uploaded_at: bucketRows
        .map((row) => row.created_at)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    }
  })

  const largeFiles = rows
    .map((row) => ({
      bucket_id: row.bucket_id,
      name: row.name,
      size_bytes: getObjectSize(row),
      created_at: row.created_at,
    }))
    .sort((a, b) => b.size_bytes - a.size_bytes)
    .slice(0, 20)

  return {
    generated_at: new Date().toISOString(),
    storage: {
      total_bytes: buckets.reduce((sum, bucket) => sum + bucket.total_bytes, 0),
      total_file_count: buckets.reduce((sum, bucket) => sum + bucket.file_count, 0),
      buckets,
      large_files: largeFiles,
    },
    database: {
      total_bytes: 0,
      tables: [],
    },
    fallback_mode: true,
  }
}

function MetricCard({ title, used, limit, note, unavailable = false }) {
  const percent = limit > 0 ? Math.min(999, (Number(used || 0) / limit) * 100) : 0
  const remaining = Math.max(0, limit - Number(used || 0))
  const status = usageStatus(percent)

  return (
    <section className={`su-metric-card ${unavailable ? 'muted' : status.key}`}>
      <div className="su-metric-top">
        <div>
          <div className="su-card-label">{title}</div>
          <div className="su-metric-main">{unavailable ? '확인 필요' : formatBytes(remaining)}</div>
        </div>
        <span className="su-status-badge">{unavailable ? '대기' : status.label}</span>
      </div>
      <div className="su-progress" aria-label={`${title} 사용률`}>
        <span style={{ width: `${unavailable ? 0 : Math.min(100, percent)}%` }} />
      </div>
      <div className="su-metric-sub">
        {unavailable ? `기준 ${formatBytes(limit)} · SQL 적용 후 자동 계산` : `사용 ${formatBytes(used)} / 기준 ${formatBytes(limit)} · ${percent.toFixed(1)}%`}
      </div>
      {note && <div className="su-note">{note}</div>}
    </section>
  )
}

function PlanSelector({ title, options, plan, customGb, onPlanChange, onCustomChange }) {
  return (
    <section className="su-card">
      <div className="su-card-label">{title}</div>
      <div className="su-plan-row">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`su-plan-btn ${plan === option.key ? 'active' : ''}`}
            onClick={() => onPlanChange(option.key)}
          >
            {option.label}
          </button>
        ))}
        {plan === 'custom' && (
          <label className="su-custom-limit">
            <input
              type="number"
              min="0"
              step="0.1"
              value={customGb}
              onChange={(e) => onCustomChange(e.target.value)}
            />
            GB
          </label>
        )}
      </div>
    </section>
  )
}

function EmptyState({ children }) {
  return <div className="su-empty">{children}</div>
}

export default function StorageUsage({ onBack }) {
  const initial = useMemo(loadSettings, [])
  const [storagePlan, setStoragePlan] = useState(initial.storagePlan || 'free')
  const [dbPlan, setDbPlan] = useState(initial.dbPlan || 'free')
  const [customStorageGb, setCustomStorageGb] = useState(initial.customStorageGb || '1')
  const [customDbGb, setCustomDbGb] = useState(initial.customDbGb || '0.5')
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const storageLimit = getLimitBytes(storagePlan, customStorageGb, STORAGE_PLAN_OPTIONS)
  const dbLimit = getLimitBytes(dbPlan, customDbGb, DB_PLAN_OPTIONS)
  const storageUsed = Number(usage?.storage?.total_bytes || 0)
  const dbUsed = Number(usage?.database?.total_bytes || 0)

  useEffect(() => {
    saveSettings({ storagePlan, dbPlan, customStorageGb, customDbGb })
  }, [storagePlan, dbPlan, customStorageGb, customDbGb])

  const loadUsage = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase 연결 설정이 없습니다.')
      const { data, error: rpcError } = await withTimeout(
        supabase.rpc('get_hitop_storage_usage'),
        12000,
        'Supabase 사용량 조회 시간이 초과되었습니다.'
      )
      if (rpcError) throw rpcError
      setUsage(data)
    } catch (e) {
      try {
        const fallbackUsage = await fetchStorageObjectsFallback()
        setUsage(fallbackUsage)
        setError(
          `사진 저장공간은 직접 조회했습니다. DB 용량까지 보려면 Supabase SQL Editor에서 010_create_storage_usage_rpc.sql을 적용해주세요. 원인: ${e?.message || e}`
        )
      } catch (fallbackError) {
        setUsage(null)
        setError(fallbackError?.message || e?.message || String(e))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsage()
  }, [loadUsage])

  const buckets = usage?.storage?.buckets || []
  const largeFiles = usage?.storage?.large_files || []
  const tables = usage?.database?.tables || []
  const generatedAt = usage?.generated_at ? new Date(usage.generated_at).toLocaleString('ko-KR') : ''

  return (
    <div className="su-app">
      <header className="su-header">
        <div className="su-brand">
          <div className="su-brand-mark">H</div>
          <div>
            <div className="su-brand-title">저장공간 관리</div>
            <div className="su-brand-sub">업무일지 · 매물관리 용량 확인</div>
          </div>
        </div>
        <div className="su-header-actions">
          <button type="button" className="su-btn ghost" onClick={loadUsage} disabled={loading}>
            {loading ? '확인 중' : '새로고침'}
          </button>
          <button type="button" className="su-btn" onClick={onBack}>
            업무일지로 돌아가기
          </button>
        </div>
      </header>

      <main className="su-main">
        <section className="su-intro">
          <div>
            <h1>현재 남은 저장공간</h1>
            <p>업무일지 사진, 매물 사진, Supabase DB 용량을 한 화면에서 확인합니다.</p>
          </div>
          <div className="su-updated">
            <span>조회 기준</span>
            <strong>{generatedAt || (loading ? '조회 중' : '-')}</strong>
          </div>
        </section>

        <div className="su-settings-grid">
          <PlanSelector
            title="파일 Storage 기준"
            options={STORAGE_PLAN_OPTIONS}
            plan={storagePlan}
            customGb={customStorageGb}
            onPlanChange={setStoragePlan}
            onCustomChange={setCustomStorageGb}
          />
          <PlanSelector
            title="Database 기준"
            options={DB_PLAN_OPTIONS}
            plan={dbPlan}
            customGb={customDbGb}
            onPlanChange={setDbPlan}
            onCustomChange={setCustomDbGb}
          />
        </div>

        {error && (
          <section className="su-alert">
            <strong>사용량을 불러오지 못했습니다.</strong>
            <span>{error}</span>
            <p>
              네트워크 연결을 확인해주세요. SQL 함수가 아직 없다면 Supabase SQL Editor에서
              <code>supabase/migrations/010_create_storage_usage_rpc.sql</code>을 적용하면 DB 용량까지 불러올 수 있습니다.
            </p>
          </section>
        )}

        <div className="su-metric-grid">
          <MetricCard
            title="파일 저장공간 남은 용량"
            used={storageUsed}
            limit={storageLimit}
            note="업무일지 사진과 매물관리 사진 버킷 기준입니다."
            unavailable={!usage}
          />
          <MetricCard
            title="Database 남은 용량"
            used={dbUsed}
            limit={dbLimit}
            note={usage?.fallback_mode ? 'SQL 적용 전에는 DB 용량을 계산할 수 없습니다.' : '업무일지, 메모, 매물 데이터와 인덱스를 포함합니다.'}
            unavailable={usage?.fallback_mode}
          />
        </div>

        <section className="su-section">
          <div className="su-section-title">
            <h2>사진 저장소별 사용량</h2>
            <span>{formatBytes(storageUsed)} · {usage?.storage?.total_file_count || 0}개 파일</span>
          </div>
          {buckets.length ? (
            <div className="su-bucket-grid">
              {buckets.map((bucket) => {
                const percent = storageLimit > 0 ? (Number(bucket.total_bytes || 0) / storageLimit) * 100 : 0
                return (
                  <article key={bucket.bucket_id} className="su-bucket-card">
                    <div>
                      <div className="su-bucket-title">{bucket.label}</div>
                      <div className="su-bucket-id">{bucket.bucket_id}</div>
                    </div>
                    <div className="su-bucket-size">{formatBytes(bucket.total_bytes)}</div>
                    <div className="su-progress small"><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
                    <div className="su-bucket-meta">
                      <span>{bucket.file_count || 0}개 파일</span>
                      <span>최근 {formatDate(bucket.last_uploaded_at)}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyState>조회된 사진 저장소가 없습니다.</EmptyState>
          )}
        </section>

        <section className="su-section">
          <div className="su-section-title">
            <h2>큰 이미지 파일</h2>
            <span>상위 20개</span>
          </div>
          {largeFiles.length ? (
            <div className="su-table-wrap">
              <table className="su-table">
                <thead>
                  <tr>
                    <th>저장소</th>
                    <th>파일</th>
                    <th>크기</th>
                    <th>업로드</th>
                  </tr>
                </thead>
                <tbody>
                  {largeFiles.map((file) => (
                    <tr key={`${file.bucket_id}/${file.name}`}>
                      <td>{file.bucket_id}</td>
                      <td className="su-file-name">{file.name}</td>
                      <td>{formatBytes(file.size_bytes)}</td>
                      <td>{formatDate(file.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>큰 파일 목록이 없습니다.</EmptyState>
          )}
        </section>

        <section className="su-section">
          <div className="su-section-title">
            <h2>Database 테이블별 사용량</h2>
            <span>{formatBytes(dbUsed)}</span>
          </div>
          {tables.length ? (
            <div className="su-table-wrap">
              <table className="su-table">
                <thead>
                  <tr>
                    <th>테이블</th>
                    <th>크기</th>
                    <th>비율</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((table) => {
                    const percent = dbUsed > 0 ? (Number(table.total_bytes || 0) / dbUsed) * 100 : 0
                    return (
                      <tr key={table.table_name}>
                        <td>{table.table_name}</td>
                        <td>{formatBytes(table.total_bytes)}</td>
                        <td>
                          <div className="su-inline-bar">
                            <span style={{ width: `${Math.min(100, percent)}%` }} />
                            <b>{percent.toFixed(1)}%</b>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>테이블 사용량이 없습니다.</EmptyState>
          )}
        </section>
      </main>
    </div>
  )
}
