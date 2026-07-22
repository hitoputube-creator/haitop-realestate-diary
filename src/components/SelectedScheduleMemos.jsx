import { useState } from 'react'
import './SelectedScheduleMemos.css'

function formatTitleDate(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 일정`
}

function formatSavedTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const h = date.getHours()
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`
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
}) {
  const [writer, setWriter] = useState('주현희')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editWriter, setEditWriter] = useState('주현희')
  const [editContent, setEditContent] = useState('')

  async function handleSubmit() {
    const text = content.trim()
    if (!text || saving) return
    await onCreate?.({ writer, content: text })
    setContent('')
  }

  function startEdit(note) {
    setEditingId(note.id)
    setEditWriter(note.writer || '주현희')
    setEditContent(note.content || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
  }

  async function saveEdit(noteId) {
    const text = editContent.trim()
    if (!text || saving) return
    await onUpdate?.(noteId, { writer: editWriter, content: text })
    cancelEdit()
  }

  return (
    <section className="wd-panel ssm-panel" aria-label="선택 날짜 일정 메모">
      <div className="wd-panel-header">
        <div>
          <div className="wd-panel-title">{formatTitleDate(selectedDate)}</div>
          <div className="ssm-sub">작성자별 그날 스케줄 공유</div>
        </div>
        <div className="wd-panel-sub">{notes.length}건</div>
      </div>

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
          rows={4}
          disabled={saving}
        />
        <button
          type="button"
          className="ssm-save-btn"
          onClick={handleSubmit}
          disabled={saving || !content.trim()}
        >
          일정 메모 저장
        </button>
      </div>

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
                  <div className="ssm-actions">
                    <button type="button" onClick={cancelEdit} disabled={saving}>취소</button>
                    <button type="button" onClick={() => saveEdit(note.id)} disabled={saving || !editContent.trim()}>저장</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ssm-item-head">
                    <span className="ssm-writer">{note.writer || '주현희'}</span>
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
    </section>
  )
}
