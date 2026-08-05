import { useEffect, useMemo, useState } from 'react'
import { toDateKey } from './Calendar'
import { STICKER_META } from './DiaryList'
import { DiaryPhotoStrip, DiaryPhotoUploader, PhotoGalleryModal } from './DiaryPhotos'
import { DiaryFileUploader, DiaryFileList } from './DiaryFiles'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function WeeklyDiary({ days, memos, loading, filterWriter, photoMap, fileMap, pinnedDiaryIds, onPrevWeek, onThisWeek, onNextWeek, onUpdateMemo, onAddPhotos, onAddFiles, onAddMemo }) {
  const [selectedMemoId, setSelectedMemoId] = useState(null)
  const [gallery, setGallery] = useState(null)
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
                      {memo.status === 'important' && <span className="wd-card-important-badge">★ 중요</span>}
                      <strong className={!memo.title ? 'is-empty' : ''}>{memo.title || '\u00a0'}</strong>
                      <span className={`wd-week-customer ${!memo.customer_name ? 'is-empty' : ''}`}>{memo.customer_name || '\u00a0'}</span>
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
          photos={photoMap?.[selectedMemo.id] || []}
          files={fileMap?.[selectedMemo.id] || []}
          onOpenPhotos={(photos, index) => setGallery({ photos, index })}
          onClose={() => setSelectedMemoId(null)}
          onSave={onUpdateMemo}
          onAddPhotos={onAddPhotos}
          onAddFiles={onAddFiles}
        />
      )}
      {gallery && (
        <PhotoGalleryModal
          photos={gallery.photos}
          startIndex={gallery.index}
          onClose={() => setGallery(null)}
        />
      )}
    </section>
  )
}

export function WeeklyMemoDetail({ memo, photos, files, onOpenPhotos, onClose, onSave, onAddPhotos, onAddFiles }) {
  const [editing, setEditing] = useState(false)
  const [photoAddOpen, setPhotoAddOpen] = useState(false)
  const [fileAddOpen, setFileAddOpen] = useState(false)
  const [photoFiles, setPhotoFiles] = useState([])
  const [diaryFiles, setDiaryFiles] = useState([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [fileError, setFileError] = useState('')
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
    setPhotoAddOpen(false)
    setFileAddOpen(false)
    setPhotoFiles([])
    setDiaryFiles([])
    setPhotoError('')
    setFileError('')
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

  async function handleAddPhotos() {
    if (!photoFiles.length || photoBusy) return
    setPhotoBusy(true)
    setPhotoError('')
    try {
      await onAddPhotos?.(memo.id, photoFiles, memo.writer)
      setPhotoFiles([])
      setPhotoAddOpen(false)
    } catch (err) {
      setPhotoError(err.message || String(err))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleAddFiles() {
    if (!diaryFiles.length || fileBusy) return
    setFileBusy(true)
    setFileError('')
    try {
      await onAddFiles?.(memo.id, diaryFiles, memo.writer)
      setDiaryFiles([])
      setFileAddOpen(false)
    } catch (err) {
      setFileError(err.message || String(err))
    } finally {
      setFileBusy(false)
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
            <div className="wd-week-detail-attachments">
              {photos?.length > 0 && <DiaryPhotoStrip photos={photos} onOpen={onOpenPhotos} />}
              {files?.length > 0 && <DiaryFileList files={files} />}
            </div>
            <div className="wd-week-detail-actions">
              <button
                type="button"
                className="wd-action-btn"
                onClick={() => {
                  setPhotoAddOpen((value) => !value)
                  setPhotoError('')
                }}
                disabled={photoBusy}
              >
                사진 추가
              </button>
              <button
                type="button"
                className="wd-action-btn"
                onClick={() => {
                  setFileAddOpen((value) => !value)
                  setFileError('')
                }}
                disabled={fileBusy}
              >
                파일 추가
              </button>
              <button type="button" className="wd-action-btn active" onClick={() => setEditing(true)}>수정</button>
            </div>
            {photoAddOpen && (
              <div className="wd-week-detail-upload">
                <DiaryPhotoUploader files={photoFiles} onChange={setPhotoFiles} disabled={photoBusy} busy={photoBusy} />
                {photoError && <div className="wd-photo-error" role="alert">{photoError}</div>}
                <div className="wd-photo-upload-actions">
                  <button
                    type="button"
                    className="wd-action-btn"
                    onClick={() => {
                      setPhotoFiles([])
                      setPhotoError('')
                      setPhotoAddOpen(false)
                    }}
                    disabled={photoBusy}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="wd-action-btn active"
                    onClick={handleAddPhotos}
                    disabled={photoBusy || photoFiles.length === 0}
                  >
                    {photoBusy ? '업로드 중...' : '업로드'}
                  </button>
                </div>
              </div>
            )}
            {fileAddOpen && (
              <div className="wd-week-detail-upload">
                <DiaryFileUploader files={diaryFiles} onChange={setDiaryFiles} disabled={fileBusy} busy={fileBusy} />
                {fileError && <div className="wd-photo-error" role="alert">{fileError}</div>}
                <div className="wd-photo-upload-actions">
                  <button
                    type="button"
                    className="wd-action-btn"
                    onClick={() => {
                      setDiaryFiles([])
                      setFileError('')
                      setFileAddOpen(false)
                    }}
                    disabled={fileBusy}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="wd-action-btn active"
                    onClick={handleAddFiles}
                    disabled={fileBusy || diaryFiles.length === 0}
                  >
                    {fileBusy ? '업로드 중...' : '업로드'}
                  </button>
                </div>
              </div>
            )}
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
