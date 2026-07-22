import { STICKER_META } from './DiaryList'
import './SelectedScheduleMemos.css'

const SCHEDULE_STICKERS = ['계약', '잔금', '약속']

function formatTitleDate(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 일정`
}

function getMemoTitle(memo) {
  const title = (memo.title || '').trim()
  if (title) return title

  const firstLine = (memo.content || '').split('\n')[0].trim()
  if (!firstLine) return '(내용 없음)'
  return firstLine.length > 48 ? firstLine.slice(0, 48) + '...' : firstLine
}

function getMemoSnippet(memo) {
  const text = (memo.content || '').trim()
  if (!text) return ''
  return text.length > 84 ? text.slice(0, 84) + '...' : text
}

export default function SelectedScheduleMemos({ selectedDate, memos = [], loading = false, onNavigate }) {
  const scheduleMemos = memos.filter((memo) => SCHEDULE_STICKERS.includes(memo.sticker))

  return (
    <section className="wd-panel ssm-panel" aria-label="선택 날짜 일정 메모">
      <div className="wd-panel-header">
        <div>
          <div className="wd-panel-title">{formatTitleDate(selectedDate)}</div>
          <div className="ssm-sub">계약·잔금·약속 스티커 메모</div>
        </div>
        <div className="wd-panel-sub">{scheduleMemos.length}건</div>
      </div>

      <div className="ssm-list">
        {loading ? (
          <div className="ssm-empty">불러오는 중...</div>
        ) : scheduleMemos.length === 0 ? (
          <div className="ssm-empty">등록된 일정 메모가 없습니다.</div>
        ) : (
          scheduleMemos.map((memo) => {
            const stickerMeta = STICKER_META[memo.sticker] || {}
            return (
              <button
                key={memo.id}
                type="button"
                className="ssm-item"
                onClick={() => onNavigate?.(memo.date, memo.id)}
                title="클릭하면 해당 메모로 이동합니다"
              >
                <div className="ssm-item-head">
                  <span
                    className="ssm-sticker"
                    style={{ background: stickerMeta.color || 'var(--color-primary-container)' }}
                  >
                    {memo.sticker}
                  </span>
                  <span className="ssm-writer">{memo.writer || '주현희'}</span>
                </div>
                <div className="ssm-title">{getMemoTitle(memo)}</div>
                {getMemoSnippet(memo) && <div className="ssm-snippet">{getMemoSnippet(memo)}</div>}
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
