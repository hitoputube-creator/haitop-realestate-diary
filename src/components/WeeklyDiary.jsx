import { useEffect, useMemo, useState } from 'react'
import { toDateKey } from './Calendar'
import { STICKER_META } from './DiaryList'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function WeeklyDiary({ days, memos, loading, filterWriter, photoMap, fileMap, pinnedDiaryIds, onPrevWeek, onThisWeek, onNextWeek, onUpdateMemo, onAddMemo }) {
  const [selectedMemoId, setSelectedMemoId] = useState(null)
  const todayKey = toDateKey(new Date())
  const visibleMemos = useMemo(
    () => filterWriter === 'all' ? memos : memos.filter((memo) => (memo.writer || '주현희') === filterWriter),
    [filterWriter, memos]
  )
  const selectedMemo = selectedMemoId ? visibleMemos.find((memo) => memo.id === selectedMemoId) : null
  const first = days[0]
  const last = days[6]

  useEffect(() => {
    if (selectedMemoId && !selectedMemo) setSelectedMemoId(null)
  }, [selectedMemoId, selectedMemo])

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
                    <button key={memo.id} type="button" className="wd-week-memo" onClick={() => setSelectedMemoId(memo.id)}>
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
      {selectedMemo && (
        <WeeklyMemoDetail
          memo={selectedMemo}
          onClose={() => setSelectedMemoId(null)}
          onSave={onUpdateMemo}
        />
      )}
    </section>
  )
}

function WeeklyMemoDetail({ memo, onClose, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(memo.title || '')
  const [draftName, setDraftName] = useState(memo.customer_name || '')
  const [draftPhone, setDraftPhone] = useState(memo.customer_phone || '')
  const [draftLinkKey, setDraftLinkKey] = useState(memo.link_key || '')
  const [draftContent, setDraftContent] = useState(memo.content || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setEditing(false)
    setDraftTitle(memo.title || '')
    setDraftName(memo.customer_name || '')
    setDraftPhone(memo.customer_phone || '')
    setDraftLinkKey(memo.link_key || '')
    setDraftContent(memo.content || '')
    setError('')
  }, [memo])

  const stickerColor = memo.sticker ? STICKER_META[memo.sticker]?.color : null

  async function handleSave() {
    const content = draftContent.trim()
    if (!content || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave?.(memo.id, content, {
        title: draftTitle.trim() || null,
        customer_name: draftName.trim() || null,
        customer_phone: draftPhone.trim() || null,
        link_key: draftLinkKey.trim(),
      })
      setEditing(false)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wd-week-detail-overlay" role="dialog" aria-modal="true" aria-label="주간 메모 상세">
      <div className="wd-week-detail-card">
        <header className="wd-week-detail-header">
          <div>
            <div className="wd-week-detail-date">{memo.date}</div>
            <div className="wd-week-detail-meta">{memo.writer || '주현희'}</div>
          </div>
          <button type="button" className="wd-week-detail-close" onClick={onClose} aria-label="닫기">×</button>
        </header>

        {!editing ? (
          <>
            <div className="wd-week-detail-fields">
              <div>
                <span>제목</span>
                <strong>{memo.title || '(제목 미입력)'}</strong>
              </div>
              <div>
                <span>이름</span>
                <strong>{memo.customer_name || '미입력'}</strong>
              </div>
              <div>
                <span>연락처</span>
                <strong>{memo.customer_phone || '미입력'}</strong>
              </div>
              <div>
                <span>스티커</span>
                <strong style={stickerColor ? { color: stickerColor } : undefined}>{memo.sticker || '없음'}</strong>
              </div>
              <div className="wd-week-detail-wide">
                <span>연결태그</span>
                <strong>{memo.link_key || '미입력'}</strong>
              </div>
            </div>
            <div className="wd-week-detail-content">{memo.content}</div>
            <div className="wd-week-detail-actions">
              <button type="button" className="wd-action-btn active" onClick={() => setEditing(true)}>수정</button>
            </div>
          </>
        ) : (
          <>
            <div className="wd-week-detail-edit-grid">
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="제목" />
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="이름" />
              <input value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="연락처" />
              <input value={draftLinkKey} onChange={(e) => setDraftLinkKey(e.target.value)} placeholder="연결태그" />
            </div>
            <textarea
              className="wd-week-detail-edit-content"
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="메모 내용"
            />
            {error && <div className="wd-error" role="alert">{error}</div>}
            <div className="wd-week-detail-actions">
              <button type="button" className="wd-action-btn" onClick={() => setEditing(false)} disabled={saving}>취소</button>
              <button type="button" className="wd-action-btn active" onClick={handleSave} disabled={saving || !draftContent.trim()}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
