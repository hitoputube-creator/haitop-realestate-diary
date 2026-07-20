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

function toSortTime(item) {
  const value = item?.memo?.date || item?.memo?.created_at || item?.sticky?.created_at
  if (!value) return 0
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function formatSnippet(content) {
  const text = (content || '').trim().replace(/\s+/g, ' ')
  if (!text) return '(내용 없음)'
  return text.length > 46 ? `${text.slice(0, 46)}...` : text
}

function buildStickyCards(stickyData) {
  const groups = new Map()
  const cards = []

  ;(stickyData || []).forEach((item) => {
    const key = (item.memo?.link_key || '').trim()
    if (!key) {
      cards.push({
        id: `single-${item.sticky.id}`,
        type: 'single',
        title: getTitle(item.memo),
        items: [item],
        latest: toSortTime(item),
      })
      return
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  })

  groups.forEach((items, key) => {
    const sorted = [...items].sort((a, b) => toSortTime(a) - toSortTime(b))
    cards.push({
      id: `group-${key}`,
      type: 'group',
      title: key,
      items: sorted,
      latest: Math.max(...sorted.map(toSortTime)),
    })
  })

  return cards.sort((a, b) => b.latest - a.latest)
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
  const [openCardId, setOpenCardId] = useState(null)
  const cards = buildStickyCards(stickyData)

  return (
    <section className="wsn-section" aria-label="진행중 포스트잇">
      <div className="wsn-header">
        <div className="wsn-title">📌 진행중 포스트잇</div>
        <div className="wsn-sub">중요한 메모를 고정해두는 공간입니다.</div>
      </div>

      {loading ? (
        <div className="wsn-loading">불러오는 중...</div>
      ) : cards.length === 0 ? (
        <div className="wsn-empty">고정된 포스트잇이 없습니다.</div>
      ) : (
        <div className="wsn-list">
          {cards.map((card) => {
            const isOpen = openCardId === card.id
            const representative = card.items[card.items.length - 1]?.memo
            return (
              <article
                key={card.id}
                className={`wsn-postit ${card.type === 'group' ? 'is-group' : 'is-single'} ${isOpen ? 'open' : ''}`}
              >
                <button
                  type="button"
                  className="wsn-postit-card"
                  onClick={() => {
                    if (card.type === 'single') setSelected(card.items[0])
                    else setOpenCardId(isOpen ? null : card.id)
                  }}
                  aria-expanded={card.type === 'group' ? isOpen : undefined}
                  title={card.type === 'group' ? '클릭하면 묶인 메모를 펼칩니다' : '클릭하면 원본 메모를 볼 수 있습니다'}
                >
                  <span className="wsn-postit-pin" aria-hidden="true" />
                  <span className="wsn-postit-title">{card.title}</span>
                  <span className="wsn-postit-meta">
                    {card.type === 'group' ? `${card.items.length}건` : fmtDate(representative?.date)}
                  </span>
                </button>

                {card.type === 'group' && isOpen && (
                  <div className="wsn-postit-detail-list">
                    <div className="wsn-postit-group-head">
                      <span>날짜순 메모</span>
                      <button type="button" onClick={() => onLinkKeyClick?.(card.title)}>
                        연결태그 보기
                      </button>
                    </div>
                    {card.items.map((item) => {
                      const memo = item.memo
                      const stickerMeta = memo?.sticker ? STICKER_META[memo.sticker] : null
                      return (
                        <div key={item.sticky.id} className="wsn-postit-memo">
                          <button type="button" className="wsn-postit-memo-main" onClick={() => setSelected(item)}>
                            <span className="wsn-postit-memo-date">{fmtDate(memo?.date)}</span>
                            <span className="wsn-postit-memo-content">{formatSnippet(memo?.content)}</span>
                          </button>
                          <div className="wsn-postit-memo-actions">
                            {stickerMeta && (
                              <span className="wsn-postit-sticker" style={{ background: stickerMeta.color }}>
                                {memo.sticker}
                              </span>
                            )}
                            <button type="button" onClick={() => onUnpin(item.sticky.diary_id)}>
                              내리기
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </article>
            )
          })}
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
