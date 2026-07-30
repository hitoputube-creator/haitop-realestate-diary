import { useCallback, useEffect, useState } from 'react'
import { getCustomerTimeline } from '../lib/customers'
import { DiaryPhotoStrip, PhotoGalleryModal } from './DiaryPhotos'
import { DiaryFileList } from './DiaryFiles'
import './CustomerTimelineModal.css'

function formatDateFull(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${weekday})`
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}:${m}`
}

/*
 * 고객별 전체 메모 타임라인 모달.
 * customerId 하나로만 조회하므로 다른 고객의 메모가 섞일 수 없음.
 */
export default function CustomerTimelineModal({
  customerId,
  onClose,
  onNavigate,
  onAddMemoRequested,
  onUpdateMemo,
  onDeleteMemo,
  reloadSignal,
}) {
  const [customer, setCustomer] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [editDate, setEditDate] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [gallery, setGallery] = useState(null)

  const load = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    setError('')
    try {
      const { customer: c, entries: list } = await getCustomerTimeline(customerId)
      setCustomer(c)
      setEntries(list)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    load()
  }, [load, reloadSignal])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!customerId) return null

  const displayedEntries = sortAsc ? [...entries].slice().reverse() : entries

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditContent(entry.content || '')
    setEditDate(entry.date || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
    setEditDate('')
  }

  async function saveEdit(entry) {
    const nextContent = editContent.trim()
    if (!nextContent || busyId) return
    setBusyId(entry.id)
    try {
      await onUpdateMemo?.(entry.id, { content: nextContent, date: editDate || entry.date })
      cancelEdit()
      await load()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(entry) {
    if (busyId) return
    if (!window.confirm('이 메모를 삭제하시겠어요?')) return
    setBusyId(entry.id)
    try {
      await onDeleteMemo?.(entry.id)
      await load()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="ctm-overlay" role="dialog" aria-modal="true" aria-label="고객 전체 메모">
      <div className="ctm-panel">
        <div className="ctm-header">
          <div className="ctm-header-info">
            <div className="ctm-title">
              {customer ? (customer.name || '(이름 미입력)') : '고객 정보를 찾을 수 없음'}
            </div>
            {customer?.phone && (
              <div className="ctm-phone">
                <a href={`tel:${customer.phone}`} className="ctm-phone-link">📞 {customer.phone}</a>
              </div>
            )}
            <div className="ctm-sub">{entries.length}건 · {sortAsc ? '오래된순' : '최신순'}</div>
          </div>
          <div className="ctm-header-actions">
            {customer && (
              <button
                type="button"
                className="ctm-add-btn"
                onClick={() => onAddMemoRequested?.(customer)}
              >
                ✏️ 메모 추가
              </button>
            )}
            <button type="button" className="ctm-close" onClick={() => onClose?.()} aria-label="닫기">✕</button>
          </div>
        </div>

        <div className="ctm-toolbar">
          <button
            type="button"
            className={`ctm-sort-btn ${!sortAsc ? 'active' : ''}`}
            onClick={() => setSortAsc(false)}
          >
            최신순
          </button>
          <button
            type="button"
            className={`ctm-sort-btn ${sortAsc ? 'active' : ''}`}
            onClick={() => setSortAsc(true)}
          >
            오래된순
          </button>
        </div>

        {error && <div className="ctm-error" role="alert">{error}</div>}

        <div className="ctm-body">
          {loading ? (
            <div className="ctm-empty">불러오는 중...</div>
          ) : !customer ? (
            <div className="ctm-empty">
              고객 정보를 찾을 수 없습니다. 삭제되었거나 존재하지 않는 고객일 수 있습니다.
            </div>
          ) : entries.length === 0 ? (
            <div className="ctm-empty">아직 이 고객과 관련된 메모가 없습니다.</div>
          ) : (
            displayedEntries.map((entry) => (
              <div
                key={entry.id}
                className={`ctm-entry ${entry.kind === 'registration' ? 'registration' : ''}`}
              >
                <div className="ctm-entry-head">
                  <span className="ctm-entry-date">{formatDateFull(entry.date)}</span>
                  {entry.createdAt && <span className="ctm-entry-time">{formatTime(entry.createdAt)}</span>}
                  {entry.kind === 'registration' && (
                    <span className="ctm-reg-badge">고객 등록 시 작성한 기본 메모</span>
                  )}
                  {entry.kind === 'memo' && entry.writer && (
                    <span className="ctm-entry-writer">{entry.writer}</span>
                  )}
                  {entry.kind === 'memo' && (
                    <button
                      type="button"
                      className="ctm-goto-btn"
                      onClick={() => onNavigate?.(entry.date, entry.id)}
                      title="업무일지에서 이 메모 보기"
                    >
                      업무일지에서 보기
                    </button>
                  )}
                </div>

                {editingId === entry.id ? (
                  <div className="ctm-edit-wrap">
                    <textarea
                      className="ctm-edit-textarea"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      disabled={busyId === entry.id}
                    />
                    <input
                      type="date"
                      className="ctm-edit-date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      disabled={busyId === entry.id}
                    />
                    <div className="ctm-edit-actions">
                      <button type="button" className="ctm-btn" onClick={cancelEdit} disabled={busyId === entry.id}>
                        취소
                      </button>
                      <button
                        type="button"
                        className="ctm-btn ctm-btn-primary"
                        onClick={() => saveEdit(entry)}
                        disabled={busyId === entry.id || !editContent.trim()}
                      >
                        {busyId === entry.id ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ctm-entry-content">{entry.content}</div>
                    {(entry.photos?.length > 0) && (
                      <DiaryPhotoStrip
                        photos={entry.photos}
                        onOpen={(photos, index) => setGallery({ photos, index })}
                      />
                    )}
                    {(entry.files?.length > 0) && <DiaryFileList files={entry.files} />}
                    {entry.kind === 'memo' && (
                      <div className="ctm-entry-actions">
                        <button type="button" className="ctm-btn" onClick={() => startEdit(entry)}>
                          수정
                        </button>
                        <button
                          type="button"
                          className="ctm-btn ctm-btn-danger"
                          onClick={() => handleDelete(entry)}
                          disabled={busyId === entry.id}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {gallery && (
        <PhotoGalleryModal
          photos={gallery.photos}
          startIndex={gallery.index}
          onClose={() => setGallery(null)}
        />
      )}
    </div>
  )
}
