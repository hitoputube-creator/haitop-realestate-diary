import { toDateKey } from './Calendar'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function WeeklyDiary({ days, memos, loading, filterWriter, photoMap, fileMap, pinnedDiaryIds, onPrevWeek, onThisWeek, onNextWeek, onOpenMemo, onAddMemo }) {
  const todayKey = toDateKey(new Date())
  const visibleMemos = filterWriter === 'all' ? memos : memos.filter((memo) => (memo.writer || '주현희') === filterWriter)
  const first = days[0]
  const last = days[6]

  return (
    <section className="wd-panel wd-weekly" aria-label="주간 업무일지">
      <header className="wd-weekly-header">
        <div>
          <div className="wd-panel-title">주간 업무일지</div>
          <div className="wd-panel-sub">{first && last ? `${first.getFullYear()}.${first.getMonth() + 1}.${first.getDate()} - ${last.getFullYear()}.${last.getMonth() + 1}.${last.getDate()}` : ''}</div>
        </div>
        <div className="wd-weekly-nav">
          <button type="button" className="wd-action-btn" onClick={onPrevWeek}>이전 주</button>
          <button type="button" className="wd-action-btn active" onClick={onThisWeek}>이번 주</button>
          <button type="button" className="wd-action-btn" onClick={onNextWeek}>다음 주</button>
        </div>
      </header>
      {loading ? <div className="wd-loading">불러오는 중...</div> : (
        <div className="wd-week-grid">
          {days.map((day) => {
            const dateKey = toDateKey(day)
            const rows = visibleMemos.filter((memo) => memo.date === dateKey)
            return (
              <article key={dateKey} className={`wd-week-day ${dateKey === todayKey ? 'is-today' : ''}`}>
                <header className="wd-week-day-header">
                  <div><strong>{WEEKDAY_LABELS[day.getDay()]}요일</strong><span>{day.getMonth() + 1}.{day.getDate()}</span></div>
                  <button type="button" className="wd-week-add" onClick={() => onAddMemo(day)}>메모 추가</button>
                </header>
                <div className="wd-week-memos">
                  {rows.length === 0 ? <div className="wd-week-empty">메모 없음</div> : rows.map((memo) => (
                    <button key={memo.id} type="button" className="wd-week-memo" onClick={() => onOpenMemo(day, memo.id)}>
                      {memo.title && <strong>{memo.title}</strong>}
                      {memo.customer_name && <span className="wd-week-customer">{memo.customer_name}</span>}
                      <span className="wd-week-content">{memo.content}</span>
                      <span className="wd-week-meta">{memo.writer || ''}{((photoMap?.[memo.id] || []).length > 0 || (fileMap?.[memo.id] || []).length > 0) ? ' \u00B7 \uCCA8\uBD80' : ''}{pinnedDiaryIds?.has(memo.id) ? ' \u00B7 \uACE0\uC815' : ''}{memo.link_key ? ` \u00B7 ${memo.link_key}` : ''}</span>
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
