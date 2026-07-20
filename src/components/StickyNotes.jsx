import { useState } from 'react'
import { STICKER_META } from './DiaryList'
import './StickyNotes.css'

/* 포스트잇 표시 제목 결정 */
function getTitle(memo) {
  if (!memo) return '(메모 없음)'
  if (memo.link_key) return memo.link_key
  const firstLine = (memo.content || '').split('\n')[0].trim()
  return firstLine.length > 28 ? firstLine.slice(0, 28) + '…' : (firstLine || '(내용 없음)')
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

function fmtTime(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  const h = dt.getHours()
  const min = String(dt.getMinutes()).padStart(2, '0')
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${min}`
}

/* ===== 원본 메모 상세 모달 ===== */
function DetailModal({ item, onUnpin, onClose, onLinkKeyClick }) {
  const { sticky, memo } = item

  if (!memo) {
    return (
      <div className="wsn-backdrop" onClick={onClose}>
        <div className="wsn-detail-modal" onClick={(e) => e.stopPropagation()}>
          <div className="wsn-detail-header">
            <span className="wsn-detail-title">포스트잇 메모</span>
            <button type="button" className="wsn-modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="wsn-detail-body">
            <p style={{ color: 'var(--color-on-surface-faint)', fontSize: 13 }}>
              원본 메모를 불러올 수 없습니다.
            </p>
          </div>
          <div className="wsn-detail-footer">
            <button
              type="button"
              className="wsn-btn-down"
              onClick={() => { onUnpin(sticky.diary_id); onClose() }}
            >
              포스트잇 내리기
            </button>
            <span className="wsn-footer-spacer" />
            <button type="button" className="wsn-modal-cancel" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    )
  }

  const stickerMeta = memo.sticker ? STICKER_META[memo.sticker] : null

  return (
    <div className="wsn-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="wsn-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wsn-detail-header">
          <span className="wsn-detail-title">포스트잇 메모</span>
          <button type="button" className="wsn-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="wsn-detail-body">
          {/* 메타 정보 */}
          <div className="wsn-detail-meta">
            <span className="wsn-detail-date">{fmtDate(memo.date)}</span>
            <span className="wsn-detail-time">{fmtTime(memo.created_at)}</span>
            <span className="wsn-detail-writer">· {memo.writer || '주현희'}</span>
            {stickerMeta && (
              <span
                className="wsn-detail-sticker"
                style={{ background: stickerMeta.color }}
              >
                {memo.sticker}
              </span>
            )}
          </div>

          {/* 연결태그 */}
          {memo.link_key && (
            <button
              type="button"
              className="wsn-detail-link-badge"
              onClick={() => { onLinkKeyClick && onLinkKeyClick(memo.link_key); onClose() }}
            >
              🔗 {memo.link_key}
            </button>
          )}

          {/* 메모 전체 내용 */}
          <div className="wsn-detail-content">{memo.content}</div>
        </div>

        <div className="wsn-detail-footer">
          <button
            type="button"
            className="wsn-btn-down"
            onClick={() => { onUnpin(sticky.diary_id); onClose() }}
          >
            포스트잇 내리기
          </button>
          <span className="wsn-footer-spacer" />
          <button type="button" className="wsn-modal-cancel" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ===== 메인 컴포넌트 ===== */
export default function StickyNotes({ stickyData, loading, onUnpin, onLinkKeyClick }) {
  const [selected, setSelected] = useState(null)

  return (
    <section className="wsn-section" aria-label="진행중 포스트잇">
      <div className="wsn-header">
        <div className="wsn-title">📌 진행중 포스트잇</div>
        <div className="wsn-sub">중요한 메모를 고정해두는 공간입니다.</div>
      </div>

      {loading ? (
        <div className="wsn-loading">불러오는 중...</div>
      ) : !stickyData || stickyData.length === 0 ? (
        <div className="wsn-empty">고정된 포스트잇이 없습니다.</div>
      ) : (
        <div className="wsn-list">
          {stickyData.map((item) => (
            <button
              key={item.sticky.id}
              type="button"
              className="wsn-chip"
              onClick={() => setSelected(item)}
              title="클릭하면 원본 메모를 볼 수 있습니다"
            >
              <span className="wsn-chip-pin" aria-hidden="true">📌</span>
              <span className="wsn-chip-title">{getTitle(item.memo)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <DetailModal
          item={selected}
          onUnpin={onUnpin}
          onClose={() => setSelected(null)}
          onLinkKeyClick={onLinkKeyClick}
        />
      )}
    </section>
  )
}
