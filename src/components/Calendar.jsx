import { useMemo } from 'react'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function pad(n) {
  return String(n).padStart(2, '0')
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function Calendar({
  viewYear,
  viewMonth, // 0~11
  selectedDate, // Date
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onJumpToday,
  notedDateKeys = {},
  filterWriter = 'all',
}) {
  const todayKey = toDateKey(new Date())
  const selectedKey = toDateKey(selectedDate)

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1)
    const startWeekday = firstOfMonth.getDay() // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()

    const result = []

    // 이전 달 끝부분
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, daysInPrevMonth - i)
      result.push({ date: d, otherMonth: true })
    }

    // 이번 달
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ date: new Date(viewYear, viewMonth, d), otherMonth: false })
    }

    // 다음 달 시작 부분 (6주 = 42칸 채우기)
    const remaining = 42 - result.length
    for (let d = 1; d <= remaining; d++) {
      result.push({
        date: new Date(viewYear, viewMonth + 1, d),
        otherMonth: true,
      })
    }

    return result
  }, [viewYear, viewMonth])

  return (
    <section className="wd-panel" aria-label="달력">
      <header className="wd-cal-nav">
        <div>
          <span className="wd-cal-month">{viewMonth + 1}월</span>
          <span className="wd-cal-month-year">{viewYear}</span>
          <button
            type="button"
            className="wd-cal-today-btn"
            onClick={onJumpToday}
            aria-label="오늘로 이동"
          >
            오늘
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="wd-cal-nav-btn"
            onClick={onPrevMonth}
            aria-label="이전 달"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className="wd-cal-nav-btn"
            onClick={onNextMonth}
            aria-label="다음 달"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="wd-cal-grid">
        <div className="wd-cal-weekdays">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`wd-cal-weekday ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="wd-cal-days" role="grid">
          {cells.map(({ date, otherMonth }, idx) => {
            const key = toDateKey(date)
            const isToday = key === todayKey
            const isSelected = key === selectedKey
            const writers = notedDateKeys[key] || []
            const showJoo = (filterWriter === 'all' || filterWriter === '주현희') && writers.includes('주현희')
            const showKim = (filterWriter === 'all' || filterWriter === '김정현') && writers.includes('김정현')
            const hasNote = showJoo || showKim
            const weekday = date.getDay()

            const cls = [
              'wd-cal-day',
              otherMonth && 'other-month',
              isToday && 'today',
              isSelected && 'selected',
              weekday === 0 && 'sun',
              weekday === 6 && 'sat',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                type="button"
                key={`${key}-${idx}`}
                className={cls}
                onClick={() => onSelectDate(date)}
                aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일${hasNote ? ', 메모 있음' : ''}`}
                aria-pressed={isSelected}
              >
                <span>{date.getDate()}</span>
                {hasNote && (
                  <div className="wd-cal-day-dots" aria-hidden="true">
                    {showJoo && <span className="wd-cal-day-dot dot-joo" />}
                    {showKim && <span className="wd-cal-day-dot dot-kim" />}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
