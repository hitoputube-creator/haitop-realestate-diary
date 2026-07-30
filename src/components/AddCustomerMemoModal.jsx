import { useEffect, useRef, useState } from 'react'
import './AddCustomerMemoModal.css'

/*
 * 고객에게 후속 메모를 빠르게 추가하는 작은 모달.
 * 고객은 항상 부모(WorkDiary)에서 확정되어 전달됨 — 이 컴포넌트 안에서
 * 고객을 바꾸지 않으므로 "고객 선택 없이 메모 저장" 상황이 생기지 않는다.
 */
export default function AddCustomerMemoModal({ customer, defaultDate, defaultWriter = '주현희', onClose, onSave }) {
  const [content, setContent] = useState('')
  const [date, setDate] = useState(defaultDate || '')
  const [writer, setWriter] = useState(defaultWriter)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const taRef = useRef(null)

  useEffect(() => {
    taRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !submitting) onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [submitting, onClose])

  if (!customer?.id) return null

  async function handleSave() {
    const trimmed = content.trim()
    if (!trimmed || !date || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await onSave({ customer, date, content: trimmed, writer })
      onClose?.()
    } catch (err) {
      setError(err.message || String(err))
      // 실패 시 입력 내용은 그대로 유지 (content/date 초기화하지 않음)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="acm-overlay" role="dialog" aria-modal="true" aria-label="메모 추가">
      <div className="acm-panel">
        <div className="acm-header">
          <div>
            <div className="acm-title">✏️ 메모 추가</div>
            <div className="acm-customer-line">
              <span className="acm-customer-name">{customer.name || '(이름 미입력)'}</span>
              {customer.phone && <span className="acm-customer-phone">📞 {customer.phone}</span>}
            </div>
          </div>
          <button type="button" className="acm-close" onClick={() => !submitting && onClose?.()} aria-label="닫기">✕</button>
        </div>

        <div className="acm-body">
          <textarea
            ref={taRef}
            className="acm-textarea"
            placeholder="이 고객에게 남길 메모 내용을 입력해주세요."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={submitting}
          />

          <div className="acm-row">
            <label className="acm-label">
              기록 날짜
              <input
                type="date"
                className="acm-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="acm-label">
              작성자
              <select
                className="acm-input"
                value={writer}
                onChange={(e) => setWriter(e.target.value)}
                disabled={submitting}
              >
                <option value="주현희">주현희</option>
                <option value="김정현">김정현</option>
              </select>
            </label>
          </div>

          {error && <div className="acm-error" role="alert">{error}</div>}
        </div>

        <div className="acm-footer">
          <button type="button" className="acm-btn" onClick={() => !submitting && onClose?.()} disabled={submitting}>
            취소
          </button>
          <button
            type="button"
            className="acm-btn acm-btn-primary"
            onClick={handleSave}
            disabled={submitting || !content.trim() || !date}
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
