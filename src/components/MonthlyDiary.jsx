import { useMemo, useState } from 'react'
import { toDateKey } from './Calendar'
import { WeeklyMemoDetail } from './WeeklyDiary'
import { PhotoGalleryModal } from './DiaryPhotos'

export default function MonthlyDiary({
  calendar,
  selectedDate,
  memos,
  loading,
  onOpenToday,
  photoMap,
  fileMap,
  onUpdateMemo,
  onAddPhotos,
  onAddFiles,
}) {
  const selectedDateKey = toDateKey(selectedDate)
  const [selectedMemoRef, setSelectedMemoRef] = useState(null)
  const [gallery, setGallery] = useState(null)
  const selectedMemo = useMemo(
    () => selectedMemoRef?.dateKey === selectedDateKey
      ? memos.find((memo) => memo.id === selectedMemoRef.id)
      : null,
    [memos, selectedDateKey, selectedMemoRef]
  )

  return (
    <section className="wd-month-layout" aria-label="Monthly diary overview">
      <div className="wd-month-calendar">{calendar}</div>
      <div className="wd-panel wd-month-memos">
        <header className="wd-month-memos-header">
          <div>
            <div className="wd-panel-title">선택 날짜 메모 요약</div>
            <div className="wd-panel-sub">{selectedDateKey} &middot; {memos.length}건</div>
          </div>
          <button type="button" className="wd-action-btn active" onClick={() => onOpenToday(selectedDate)}>오늘 화면에서 열기</button>
        </header>
        {loading ? (
          <div className="wd-loading">불러오는 중...</div>
        ) : memos.length === 0 ? (
          <div className="wd-week-empty">선택한 날짜에 메모가 없습니다.</div>
        ) : (
          <div className="wd-month-memo-list">
            {memos.map((memo) => (
              <button
                key={memo.id}
                type="button"
                className="wd-month-memo-card"
                onClick={() => setSelectedMemoRef({ id: memo.id, dateKey: selectedDateKey })}
              >
                {memo.status === 'important' && <span className="wd-card-important-badge">★ 중요</span>}
                <span className="wd-month-memo-title">{memo.title || memo.customer_name || '업무 메모'}</span>
                <span className="wd-month-memo-name">{memo.customer_name || '이름 미입력'}</span>
                {memo.customer_phone && <span className="wd-month-memo-phone">{memo.customer_phone}</span>}
                <span className="wd-month-memo-content">{memo.content || '내용 없음'}</span>
                <span className="wd-month-memo-meta">
                  {memo.writer || ''}
                  {memo.sticker ? ` · ${memo.sticker}` : ''}
                  {memo.link_key ? ` · ${memo.link_key}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedMemo && (
        <WeeklyMemoDetail
          memo={selectedMemo}
          photos={photoMap?.[selectedMemo.id] || []}
          files={fileMap?.[selectedMemo.id] || []}
          onOpenPhotos={(photos, index) => setGallery({ photos, index })}
          onClose={() => setSelectedMemoRef(null)}
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
