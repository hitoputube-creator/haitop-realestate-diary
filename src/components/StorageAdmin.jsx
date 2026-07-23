import { useEffect, useMemo, useState } from 'react'
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import { supabase } from '../lib/supabase'
import './StorageAdmin.css'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip)

const GENERIC_DATA_ERROR = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

// 앱의 실제 카드 배경(#16254a, 다크 네이비)에 대해 dataviz 스킬 validator로 검증 통과한
// 4색(파랑/주황/아쿠아/노랑, 카테고리컬 순서 고정 — 절대 임의로 뒤섞지 않는다).
// 버킷이 4개를 넘어가면 5번째부터는 이 회색을 재사용한다(새 색을 즉석에서 만들지 않는다).
const DONUT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500']
const DONUT_OVERFLOW_COLOR = '#5b6b8c'
const DONUT_ZERO_COLOR = '#33406b'
// DB 테이블 막대는 크기(magnitude) 하나만 보여주는 단일 시리즈라 카테고리컬이 아닌
// sequential 블루 한 톤만 쓴다(막대마다 색을 바꾸지 않음).
const BAR_COLOR = '#3987e5'
const TABLE_TOP_N = 10

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

// 막대 끝에 용량을 직접 라벨로 그린다 — 마우스오버 없이도 값을 읽을 수 있게(다이렉트 라벨).
const barValueLabelPlugin = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    const labels = chart.data.datasets[0]?.prettyLabels || []
    meta.data.forEach((bar, index) => {
      ctx.save()
      ctx.fillStyle = 'rgba(225, 227, 228, 0.85)'
      ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(labels[index] || '', bar.x + 6, bar.y)
      ctx.restore()
    })
  },
}

export default function StorageAdmin({ onBack }) {
  const [buckets, setBuckets] = useState([])
  const [tables, setTables] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [showAllTables, setShowAllTables] = useState(false)

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

  const sortedBuckets = useMemo(
    () => [...buckets].sort((a, b) => Number(b.total_bytes || 0) - Number(a.total_bytes || 0)),
    [buckets]
  )
  const nonZeroBuckets = useMemo(() => sortedBuckets.filter((b) => Number(b.total_bytes) > 0), [sortedBuckets])

  const bucketColorOf = (bucketId) => {
    const i = nonZeroBuckets.findIndex((b) => b.bucket_id === bucketId)
    if (i === -1) return DONUT_ZERO_COLOR
    return DONUT_COLORS[i] || DONUT_OVERFLOW_COLOR
  }

  const donutData = {
    labels: nonZeroBuckets.map((b) => b.bucket_id),
    datasets: [
      {
        data: nonZeroBuckets.map((b) => Number(b.total_bytes)),
        backgroundColor: nonZeroBuckets.map((b) => bucketColorOf(b.bucket_id)),
        borderColor: '#16254a',
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  }

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '62%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0a1530',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        titleColor: '#e1e3e4',
        bodyColor: '#e1e3e4',
        padding: 10,
        callbacks: {
          label(ctx) {
            const value = Number(ctx.raw)
            const pct = totalBytes > 0 ? ((value / totalBytes) * 100).toFixed(1) : '0.0'
            return `${formatBytes(value)} (${pct}%)`
          },
        },
      },
    },
  }

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => Number(b.total_bytes || 0) - Number(a.total_bytes || 0)),
    [tables]
  )
  const topTables = sortedTables.slice(0, TABLE_TOP_N)
  const restTables = sortedTables.slice(TABLE_TOP_N)

  const barData = {
    labels: topTables.map((t) => t.table_name),
    datasets: [
      {
        data: topTables.map((t) => Number(t.total_bytes)),
        prettyLabels: topTables.map((t) => t.pretty_size),
        backgroundColor: BAR_COLOR,
        borderRadius: 4,
        barThickness: 16,
      },
    ],
  }

  const barOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: 56 } },
    scales: {
      x: {
        display: false,
        grid: { display: false },
      },
      y: {
        grid: { display: false },
        ticks: { color: 'rgba(225, 227, 228, 0.7)', font: { size: 12 } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0a1530',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        titleColor: '#e1e3e4',
        bodyColor: '#e1e3e4',
        padding: 10,
        callbacks: {
          label(ctx) {
            return topTables[ctx.dataIndex]?.pretty_size || ''
          },
        },
      },
    },
  }

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
            <div className="sa-stat-row">
              <div className="sa-stat-card">
                <div className="sa-stat-label">총 파일 개수</div>
                <div className="sa-stat-value">{totalFiles.toLocaleString()}<span className="sa-stat-unit">개</span></div>
              </div>
              <div className="sa-stat-card">
                <div className="sa-stat-label">총 저장 용량</div>
                <div className="sa-stat-value">{formatBytes(totalBytes)}</div>
              </div>
            </div>

            <section className="sa-section">
              <div className="sa-section-title">
                저장공간 (Storage) — 총 {totalFiles.toLocaleString()}개 파일 · {formatBytes(totalBytes)}
              </div>
              <div className="sa-donut-row">
                <div className="sa-donut-wrap">
                  <Doughnut data={donutData} options={donutOptions} />
                </div>
                <ul className="sa-legend">
                  {sortedBuckets.map((b) => (
                    <li key={b.bucket_id} className="sa-legend-item">
                      <span
                        className="sa-legend-swatch"
                        style={{ background: bucketColorOf(b.bucket_id) }}
                      />
                      <span className="sa-legend-name">{b.bucket_id}</span>
                      <span className="sa-legend-meta">
                        {formatBytes(b.total_bytes)} · {Number(b.file_count).toLocaleString()}개
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="sa-section">
              <div className="sa-section-title">DB 테이블 용량 (public 스키마)</div>
              <div className="sa-bar-wrap" style={{ height: Math.max(topTables.length * 30, 60) }}>
                <Bar data={barData} options={barOptions} plugins={[barValueLabelPlugin]} />
              </div>

              {restTables.length > 0 && (
                <>
                  <button
                    type="button"
                    className="sa-more-btn"
                    onClick={() => setShowAllTables((v) => !v)}
                  >
                    {showAllTables ? '접기' : `더보기 (${restTables.length}개)`}
                  </button>
                  {showAllTables && (
                    <table className="sa-table sa-table-more">
                      <thead>
                        <tr>
                          <th>테이블</th>
                          <th>용량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {restTables.map((t) => (
                          <tr key={t.table_name}>
                            <td>{t.table_name}</td>
                            <td>{t.pretty_size}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
