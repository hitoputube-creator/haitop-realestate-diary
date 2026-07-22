import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { toDateKey } from './Calendar'
import { STICKER_META } from './DiaryList'
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

export default function UpcomingSchedules({ filterWriter = 'all', refreshKey = 0, onNavigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

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

      let query = supabase
        .from('work_diary')
        .select('id, date, sticker, title, content, writer, created_at')
        .gte('date', startStr)
        .lte('date', endStr)
        .in('sticker', TARGET_STICKERS)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })

      if (filterWriter !== 'all') {
        query = query.eq('writer', filterWriter)
      }

      const { data, error } = await query
      if (error) throw error
      setItems(data || [])
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
        <div className="usw-sub">오늘부터 7일 이내 계약·잔금·약속 메모</div>
      </div>

      {loading ? (
        <div className="usw-loading">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="usw-empty">예정된 일정이 없습니다.</div>
      ) : (
        <div className="usw-list">
          {items.map((item) => {
            const stickerMeta = STICKER_META[item.sticker] || {}
            return (
              <button
                key={item.id}
                type="button"
                className="usw-item"
                onClick={() => onNavigate?.(item.date, item.id)}
                title="클릭하면 해당 날짜의 메모로 이동합니다"
              >
                <span className="usw-date">{formatShortDate(item.date)}</span>
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
    </section>
  )
}
