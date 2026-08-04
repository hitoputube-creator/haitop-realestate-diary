import { toDateKey } from './Calendar'

export default function MonthlyDiary({ calendar, selectedDate, memos, loading, onOpenToday }) {
  return (
    <section className="wd-month-layout" aria-label="Monthly diary overview">
      <div className="wd-month-calendar">{calendar}</div>
      <div className="wd-panel wd-month-memos">
        <header className="wd-month-memos-header">
          <div>
            <div className="wd-panel-title">&#49440;&#53469; &#45216;&#51676; &#47700;&#47784; &#50836;&#50557;</div>
            <div className="wd-panel-sub">{toDateKey(selectedDate)} &middot; {memos.length}&#44148;</div>
          </div>
          <button type="button" className="wd-action-btn active" onClick={() => onOpenToday(selectedDate)}>&#50724;&#45720; &#54868;&#47732;&#50640;&#49436; &#50676;&#44592;</button>
        </header>
        {loading ? (
          <div className="wd-loading">&#48520;&#47084;&#50724;&#45716; &#51473;...</div>
        ) : memos.length === 0 ? (
          <div className="wd-week-empty">&#49440;&#53469;&#54620; &#45216;&#51676;&#50640; &#47700;&#47784;&#44032; &#50630;&#49845;&#45768;&#45796;.</div>
        ) : (
          <div className="wd-month-memo-list">
            {memos.map((memo) => (
              <article key={memo.id} className="wd-month-memo-card">
                <strong>{memo.title || memo.customer_name || '\uC5C5\uBB34 \uBA54\uBAA8'}</strong>
                {memo.customer_name && memo.title && <span>{memo.customer_name}</span>}
                <p>{memo.content}</p>
                <button type="button" className="wd-action-btn" onClick={() => onOpenToday(selectedDate, memo.id)}>&#50724;&#45720; &#54868;&#47732;&#50640;&#49436; &#50676;&#44592;</button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}