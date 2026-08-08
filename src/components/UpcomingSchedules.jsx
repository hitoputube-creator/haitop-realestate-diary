import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { toDateKey } from './Calendar'
import { STICKER_META } from './DiaryList'
import DetailModal from './DetailModal'
import './UpcomingSchedules.css'

const TARGET_STICKERS = ['계약', '잔금', '약속']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return dateStr
  return `${date.getMonth() + 1}/${date.getDate()} ${WEEKDAYS[date.getDay()]}`
}

function getMemoTitle(memo) {
  const title = (memo.title || '').trim()
  if (title) return title

  const firstLine = (memo.content || '').split('\n')[0].trim()
  if (!firstLine) return '(내용 없음)'
  return firstLine.length > 34 ? firstLine.slice(0, 34) + '...' : firstLine
}

export default function UpcomingSchedules({ filterWriter = 'all', refreshKey = 0, onNavigate, variant = 'full' }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)

  const loadItems = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setItems([])
      return
    }

    setLoading(true)
    try {
      const today = new Date()
      const startStr = toDateKey(today)
      const endStr = toDateKey(addDays(today, 6))

      // 일정일(schedule_date)이 있으면 그 날짜를, 없으면 작성일(date)을 기준으로 "다가오는 일정"을 판단한다.
      let query = supabase
        .from('work_diary')
        .select('id, date, schedule_date, sticker, title, content, writer, created_at')
        .in('sticker', TARGET_STICKERS)
        .or(`and(schedule_date.gte.${startStr},schedule_date.lte.${endStr}),and(schedule_date.is.null,date.gte.${startStr},date.lte.${endStr})`)

      if (filterWriter !== 'all') {
        query = query.eq('writer', filterWriter)
      }

      const { data, error } = await query
      if (error) throw error
      const rows = (data || []).slice().sort((a, b) => {
        const da = a.schedule_date || a.date
        const db = b.schedule_date || b.date
        if (da !== db) return da < db ? -1 : 1
        return (a.created_at || '').localeCompare(b.created_at || '')
      })
      setItems(rows)
    } catch (err) {
      console.warn('[UpcomingSchedules] load failed:', err.message || err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filterWriter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadItems()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadItems, refreshKey])

  return (
    <section className="usw-section" aria-label="다가오는 일정">
      <div className="usw-header">
        <div className="usw-title">다가오는 일정</div>
      </div>

      {loading ? (
        <div className="usw-loading">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="usw-empty">
          <span className="usw-empty-icon" aria-hidden="true">▣</span>
          <span>등록된 다가오는 일정이 없습니다.</span>
        </div>
      ) : (
        <div className="usw-list">
          {(variant === 'compact' ? items.slice(0, 5) : items).map((item) => {
            const stickerMeta = STICKER_META[item.sticker] || {}
            const effectiveDate = item.schedule_date || item.date
            return (
              <button
                key={item.id}
                type="button"
                className="usw-item"
                onClick={() => variant === 'compact' ? setSelectedItem(item) : onNavigate?.(effectiveDate, item.id)}
                title="클릭하면 해당 날짜의 메모로 이동합니다"
              >
                <span className="usw-date">{formatShortDate(effectiveDate)}</span>
                <span
                  className="usw-sticker"
                  style={{ background: stickerMeta.color || 'var(--color-primary-container)' }}
                >
                  {item.sticker}
                </span>
                <span className="usw-memo-title">{getMemoTitle(item)}</span>
                <span className="usw-writer">{item.writer || '주현희'}</span>
              </button>
            )
          })}
        </div>
      )}

      {selectedItem && (
        <DetailModal title="&#51068;&#51221; &#49345;&#49464;&#48372;&#44592;" onClose={() => setSelectedItem(null)} className="usw-detail-dialog">
          <div className="usw-detail-meta">
            <span>{formatShortDate(selectedItem.schedule_date || selectedItem.date)}</span>
            <span className="usw-sticker" style={{ background: STICKER_META[selectedItem.sticker]?.color || 'var(--color-primary-container)' }}>
              {selectedItem.sticker}
            </span>
            <span>{selectedItem.writer || '\uC8FC\uD604\uD76C'}</span>
          </div>
          <h3 className="usw-detail-title">{getMemoTitle(selectedItem)}</h3>
          <div className="usw-detail-content">{selectedItem.content}</div>
          <div className="usw-detail-actions">
            <button type="button" className="wd-action-btn" onClick={() => setSelectedItem(null)}>&#45803;&#44592;</button>
            <button
              type="button"
              className="wd-action-btn active"
              onClick={() => {
                onNavigate?.(selectedItem.schedule_date || selectedItem.date, selectedItem.id)
                setSelectedItem(null)
              }}
            >
              &#50724;&#45720; &#54868;&#47732;&#50640;&#49436; &#50676;&#44592;
            </button>
          </div>
        </DetailModal>
      )}
    </section>
  )
}
