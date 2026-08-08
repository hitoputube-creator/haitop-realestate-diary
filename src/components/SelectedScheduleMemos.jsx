import { useState } from 'react'
import DetailModal from './DetailModal'
import { STICKER_META } from './DiaryList'
import './SelectedScheduleMemos.css'

// 업무일지 메모의 스티커 옵션과 동일한 목록(값/라벨) — 색상은 STICKER_META를 그대로 재사용한다.
const STICKER_OPTIONS = [
  { value: null,   label: '없음' },
  { value: '계약', label: '계약' },
  { value: '잔금', label: '잔금' },
  { value: '약속', label: '약속' },
]

function formatTitleDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatFullDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function formatSavedTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const h = date.getHours()
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`
}

/* ===== 스티커 선택 바 (일정 작성/수정 공용) ===== */
function StickerPicker({ value, onChange, disabled }) {
  return (
    <div className="wd-sticker-bar wd-card-sticker-edit">
      <span className="wd-sticker-bar-label">스티커</span>
      {STICKER_OPTIONS.map((opt) => {
        const isActive = value === opt.value
        const meta = opt.value ? STICKER_META[opt.value] : null
        return (
          <button
            key={opt.value ?? 'none'}
            type="button"
            className={`wd-sticker-btn ${isActive ? 'active' : ''}`}
            style={
              meta
                ? isActive
                  ? { background: meta.color, borderColor: meta.color, color: '#fff' }
                  : { borderColor: `${meta.color}88`, color: meta.color }
                : {}
            }
            disabled={disabled}
            onClick={() => onChange(isActive && opt.value !== null ? null : opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function StickerBadge({ sticker }) {
  if (!sticker) return null
  const meta = STICKER_META[sticker]
  if (!meta) return null
  return (
    <span className="wd-sticker-badge ssm-sticker-badge" style={{ background: meta.color }}>
      {sticker}
    </span>
  )
}

export default function SelectedScheduleMemos({
  selectedDate,
  notes = [],
  loading = false,
  saving = false,
  error = '',
  onCreate,
  onUpdate,
  onDelete,
  onOpenAll,
  variant = 'full',
}) {
  const [writer, setWriter] = useState('주현희')
  const [content, setContent] = useState('')
  const [sticker, setSticker] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editWriter, setEditWriter] = useState('주현희')
  const [editContent, setEditContent] = useState('')
  const [editSticker, setEditSticker] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [detailNoteId, setDetailNoteId] = useState(null)

  function resetComposer() {
    setContent('')
    setSticker(null)
  }

  async function handleSubmit() {
    const text = content.trim()
    if (!text || saving) return
    await onCreate?.({ writer, content: text, sticker })
    resetComposer()
    setComposerOpen(false)
  }

  function startEdit(note) {
    setEditingId(note.id)
    setEditWriter(note.writer || '주현희')
    setEditContent(note.content || '')
    setEditSticker(note.sticker || null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
    setEditSticker(null)
  }

  async function saveEdit(noteId) {
    const text = editContent.trim()
    if (!text || saving) return
    await onUpdate?.(noteId, { writer: editWriter, content: text, sticker: editSticker })
    cancelEdit()
  }

  const detailNote = notes.find((note) => note.id === detailNoteId) || null

  if (variant === 'compact') {
    return (
      <section className="wd-panel ssm-panel ssm-panel--compact" aria-label="선택 날짜 일정 메모">
        <div className="wd-panel-header ssm-compact-header">
          <div>
            <div className="wd-panel-title">{formatTitleDate(selectedDate)}</div>
            <div className="ssm-sub">작성자별 그날 스케줄 공유</div>
          </div>
          <div className="ssm-compact-header-actions">
            <span className="wd-panel-sub">{notes.length}건</span>
            <button type="button" className="ssm-add-btn" onClick={() => setComposerOpen((open) => !open)}>
              {composerOpen ? '닫기' : '일정 추가'}
            </button>
          </div>
        </div>

        {composerOpen && (
          <div className="ssm-composer ssm-composer--compact">
            <select className="ssm-writer-select" value={writer} onChange={(event) => setWriter(event.target.value)} disabled={saving} aria-label="일정 작성자">
              <option value="주현희">주현희</option>
              <option value="김정현">김정현</option>
            </select>
            <textarea className="ssm-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder="그날 스케줄을 적어주세요." rows={3} disabled={saving} />
            <StickerPicker value={sticker} onChange={setSticker} disabled={saving} />
            <div className="ssm-composer-actions">
              <button type="button" className="wd-action-btn" onClick={() => { resetComposer(); setComposerOpen(false) }} disabled={saving}>취소</button>
              <button type="button" className="ssm-save-btn" onClick={handleSubmit} disabled={saving || !content.trim()}>일정 메모 저장</button>
            </div>
          </div>
        )}

        {error && <div className="ssm-error">{error}</div>}
        <div className="ssm-list ssm-list--compact">
          {loading ? (
            <div className="ssm-empty">확인 중...</div>
          ) : notes.length === 0 ? (
            <div className="ssm-empty">작성된 일정 메모가 없습니다.</div>
          ) : (
            notes.map((note) => {
              const title = (note.content || '').split('\n')[0].trim() || '(내용 없음)'
              return (
                <button key={note.id} type="button" className="ssm-compact-item" onClick={() => setDetailNoteId(note.id)}>
                  <span className="ssm-compact-title">{title}</span>
                  <span className="ssm-compact-meta">
                    <StickerBadge sticker={note.sticker} /> {note.writer || '주현희'} · {formatSavedTime(note.updated_at || note.created_at)}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {detailNote && (
          <DetailModal
            title="선택 날짜 일정 상세"
            onClose={() => { cancelEdit(); setDetailNoteId(null) }}
            className="ssm-detail-dialog"
          >
            <div className="ssm-detail-date">{formatTitleDate(selectedDate)}</div>
            {editingId === detailNote.id ? (
              <>
                <select className="ssm-writer-select" value={editWriter} onChange={(event) => setEditWriter(event.target.value)} disabled={saving} aria-label="일정 작성자 수정">
                  <option value="주현희">주현희</option>
                  <option value="김정현">김정현</option>
                </select>
                <textarea className="ssm-input ssm-edit-input" value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={5} disabled={saving} />
                <StickerPicker value={editSticker} onChange={setEditSticker} disabled={saving} />
                <div className="ssm-actions">
                  <button type="button" onClick={cancelEdit} disabled={saving}>취소</button>
                  <button type="button" onClick={() => saveEdit(detailNote.id)} disabled={saving || !editContent.trim()}>저장</button>
                </div>
              </>
            ) : (
              <>
                <div className="ssm-detail-meta">
                  <span className="ssm-writer">{detailNote.writer || '주현희'}</span>
                  <StickerBadge sticker={detailNote.sticker} />
                  <span className="ssm-time">{formatSavedTime(detailNote.updated_at || detailNote.created_at)}</span>
                </div>
                <div className="ssm-detail-content">{detailNote.content}</div>
                <div className="ssm-actions">
                  <button type="button" onClick={() => startEdit(detailNote)}>수정</button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (window.confirm('이 일정 메모를 삭제할까요?')) {
                        onDelete?.(detailNote.id)
                        setDetailNoteId(null)
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </DetailModal>
        )}
      </section>
    )
  }

  return (
    <section className="wd-panel ssm-panel" aria-label="선택 날짜 일정 메모">
      <div className="wd-panel-header">
        <div>
          <div className="wd-panel-title">오늘 일정</div>
          <div className="ssm-sub">{formatTitleDate(selectedDate)} · {notes.length}건</div>
        </div>
        <button
          type="button"
          className="ssm-add-btn"
          onClick={() => setComposerOpen((value) => !value)}
          disabled={saving}
        >
          일정 추가
        </button>
      </div>

      {composerOpen && (
        <div className="ssm-composer">
          <select
            className="ssm-writer-select"
            value={writer}
            onChange={(event) => setWriter(event.target.value)}
            disabled={saving}
            aria-label="일정 작성자"
          >
            <option value="주현희">주현희</option>
            <option value="김정현">김정현</option>
          </select>
          <textarea
            className="ssm-input"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="그날 스케줄을 적어주세요."
            rows={3}
            disabled={saving}
          />
          <StickerPicker value={sticker} onChange={setSticker} disabled={saving} />
          <div className="ssm-composer-actions">
            <button type="button" onClick={() => { resetComposer(); setComposerOpen(false) }} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="ssm-save-btn"
              onClick={handleSubmit}
              disabled={saving || !content.trim()}
            >
              저장
            </button>
          </div>
        </div>
      )}

      {error && <div className="ssm-error">{error}</div>}

      <div className="ssm-list">
        {loading ? (
          <div className="ssm-empty">확인 중...</div>
        ) : notes.length === 0 ? (
          <div className="ssm-empty">작성된 일정 메모가 없습니다.</div>
        ) : (
          notes.map((note) => (
            <article key={note.id} className="ssm-item">
              {editingId === note.id ? (
                <>
                  <div className="ssm-edit-row">
                    <select
                      className="ssm-writer-select"
                      value={editWriter}
                      onChange={(event) => setEditWriter(event.target.value)}
                      disabled={saving}
                      aria-label="일정 작성자 수정"
                    >
                      <option value="주현희">주현희</option>
                      <option value="김정현">김정현</option>
                    </select>
                  </div>
                  <textarea
                    className="ssm-input ssm-edit-input"
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={4}
                    disabled={saving}
                  />
                  <StickerPicker value={editSticker} onChange={setEditSticker} disabled={saving} />
                  <div className="ssm-actions">
                    <button type="button" onClick={cancelEdit} disabled={saving}>취소</button>
                    <button type="button" onClick={() => saveEdit(note.id)} disabled={saving || !editContent.trim()}>저장</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ssm-item-head">
                    <span className="ssm-item-head-left">
                      <span className="ssm-writer">{note.writer || '주현희'}</span>
                      <StickerBadge sticker={note.sticker} />
                    </span>
                    <span className="ssm-time">{formatSavedTime(note.updated_at || note.created_at)}</span>
                  </div>
                  <div className="ssm-content">{note.content}</div>
                  <div className="ssm-actions">
                    <button type="button" onClick={() => startEdit(note)}>수정</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (window.confirm('이 일정 메모를 삭제할까요?')) onDelete?.(note.id)
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </article>
          ))
        )}
      </div>
      <div className="ssm-footer">
        <button type="button" className="ssm-all-btn" onClick={() => onOpenAll?.()}>전체 일정 보기</button>
      </div>
    </section>
  )
}

/* ===== 전체 일정 보기 (모든 날짜의 일정을 한 번에) ===== */
export function AllSchedulesModal({ notes = [], loading = false, saving = false, error = '', onUpdate, onDelete, onClose }) {
  const [editingId, setEditingId] = useState(null)
  const [editWriter, setEditWriter] = useState('주현희')
  const [editContent, setEditContent] = useState('')
  const [editSticker, setEditSticker] = useState(null)

  function startEdit(note) {
    setEditingId(note.id)
    setEditWriter(note.writer || '주현희')
    setEditContent(note.content || '')
    setEditSticker(note.sticker || null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
    setEditSticker(null)
  }

  async function saveEdit(noteId) {
    const text = editContent.trim()
    if (!text || saving) return
    await onUpdate?.(noteId, { writer: editWriter, content: text, sticker: editSticker })
    cancelEdit()
  }

  return (
    <DetailModal title="전체 일정" onClose={onClose} className="ssm-all-dialog">
      {error && <div className="ssm-error">{error}</div>}
      <div className="ssm-list ssm-list--all">
        {loading ? (
          <div className="ssm-empty">확인 중...</div>
        ) : notes.length === 0 ? (
          <div className="ssm-empty">작성된 일정이 없습니다.</div>
        ) : (
          notes.map((note) => (
            <article key={note.id} className="ssm-item">
              {editingId === note.id ? (
                <>
                  <div className="ssm-edit-row">
                    <span className="ssm-time">{formatFullDate(note.date)}</span>
                    <select
                      className="ssm-writer-select"
                      value={editWriter}
                      onChange={(event) => setEditWriter(event.target.value)}
                      disabled={saving}
                      aria-label="일정 작성자 수정"
                    >
                      <option value="주현희">주현희</option>
                      <option value="김정현">김정현</option>
                    </select>
                  </div>
                  <textarea
                    className="ssm-input ssm-edit-input"
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={4}
                    disabled={saving}
                  />
                  <StickerPicker value={editSticker} onChange={setEditSticker} disabled={saving} />
                  <div className="ssm-actions">
                    <button type="button" onClick={cancelEdit} disabled={saving}>취소</button>
                    <button type="button" onClick={() => saveEdit(note.id)} disabled={saving || !editContent.trim()}>저장</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ssm-item-head">
                    <span className="ssm-item-head-left">
                      <span className="ssm-time">{formatFullDate(note.date)}</span>
                      <span className="ssm-writer">{note.writer || '주현희'}</span>
                      <StickerBadge sticker={note.sticker} />
                    </span>
                    <span className="ssm-time">{formatSavedTime(note.updated_at || note.created_at)}</span>
                  </div>
                  <div className="ssm-content ssm-content--full">{note.content}</div>
                  <div className="ssm-actions">
                    <button type="button" onClick={() => startEdit(note)}>수정</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (window.confirm('이 일정 메모를 삭제할까요?')) onDelete?.(note.id)
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </article>
          ))
        )}
      </div>
    </DetailModal>
  )
}
