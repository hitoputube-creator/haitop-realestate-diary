import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatPhotoSize,
  MAX_PHOTO_FILES,
  PHOTO_ACCEPT,
  validatePhotoFiles,
  getAttachmentSignedUrl,
  downloadAttachment,
  downloadAttachmentsAsZip,
} from '../lib/attachments'

export function DiaryPhotoUploader({ files, onChange, disabled, busy }) {
  const inputRef = useRef(null)
  const [errors, setErrors] = useState([])
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  )

  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews])

  function addFiles(fileList) {
    const next = [...files, ...Array.from(fileList || [])]
    const { validFiles, errors: validationErrors } = validatePhotoFiles(next)
    setErrors(validationErrors)
    onChange(validFiles)
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeFile(index) {
    setErrors([])
    onChange(files.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <div className="wd-photo-uploader">
      <div className="wd-photo-uploader-row">
        <label className="wd-photo-add-btn">
          <span aria-hidden="true">사진</span>
          <span>사진 추가</span>
          <input
            ref={inputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            disabled={disabled || busy}
            onChange={(event) => addFiles(event.target.files)}
          />
        </label>
        <span className="wd-photo-help">
          jpg/png/webp/heic/heif, 최대 {MAX_PHOTO_FILES}장
        </span>
      </div>

      {errors.length > 0 && (
        <div className="wd-photo-error" role="alert">
          {errors.map((error) => <div key={error}>{error}</div>)}
        </div>
      )}

      {previews.length > 0 && (
        <div className="wd-photo-preview-list">
          {previews.map(({ file, url }, index) => (
            <div className="wd-photo-preview" key={`${file.name}-${file.lastModified}-${index}`}>
              <img src={url} alt={file.name} />
              <div className="wd-photo-preview-meta">
                <strong title={file.name}>{file.name}</strong>
                <span>{formatPhotoSize(file.size)}</span>
              </div>
              <button type="button" onClick={() => removeFile(index)} disabled={disabled || busy}>
                제거
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* 썸네일 1장 — 비공개 버킷이므로 마운트 시점에 signed URL을 새로 받아온다.
   HEIC 등 브라우저가 못 그리는 형식이거나 발급 실패 시 안내 아이콘으로 대체. */
function PhotoThumb({ photo, photos, index, onOpen, selectMode, selected, onToggleSelect }) {
  const [src, setSrc] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setSrc(null)
    getAttachmentSignedUrl(photo)
      .then((url) => {
        if (cancelled) return
        setSrc(url)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[DiaryPhotos] 썸네일 signed URL 실패:', photo.storage_path, err.message || err)
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [photo.id, photo.storage_path])

  return (
    <button
      type="button"
      className={`wd-photo-thumb${selectMode ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      onClick={() => (selectMode ? onToggleSelect?.() : onOpen?.(photos, index))}
      title={photo.original_name || '첨부 사진'}
      aria-pressed={selectMode ? selected : undefined}
    >
      {status === 'ready' && (
        <img
          src={src}
          alt={photo.original_name || '첨부 사진'}
          loading="lazy"
          onError={() => setStatus('error')}
        />
      )}
      {status === 'loading' && <span className="wd-photo-thumb-loading" aria-hidden="true" />}
      {status === 'error' && <span className="wd-photo-thumb-fallback" aria-hidden="true">🖼️</span>}
      {selectMode && (
        <span className={`wd-photo-thumb-check${selected ? ' checked' : ''}`} aria-hidden="true">
          {selected ? '✓' : ''}
        </span>
      )}
    </button>
  )
}

export function DiaryPhotoStrip({ photos, onOpen }) {
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total } | null
  const [error, setError] = useState('')

  if (!photos?.length) return null

  const keyOf = (photo) => photo.id || photo.storage_path

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
    setError('')
  }

  function toggleSelected(key) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === photos.length ? new Set() : new Set(photos.map(keyOf))))
  }

  async function handleDownloadSelected() {
    const targets = photos.filter((p) => selected.has(keyOf(p)))
    if (!targets.length || downloading) return
    setDownloading(true)
    setError('')
    setProgress({ done: 0, total: targets.length })
    try {
      if (targets.length === 1) {
        await downloadAttachment(targets[0])
      } else {
        await downloadAttachmentsAsZip(targets, {
          zipName: `업무일지사진_${targets.length}장.zip`,
          onProgress: (done, total) => setProgress({ done, total }),
        })
      }
      exitSelectMode()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setDownloading(false)
      setProgress(null)
    }
  }

  return (
    <div className="wd-photo-strip-wrap">
      <div className="wd-photo-strip" aria-label="첨부 사진">
        {(selectMode ? photos : photos.slice(0, 6)).map((photo, index) => (
          <PhotoThumb
            key={keyOf(photo)}
            photo={photo}
            photos={photos}
            index={index}
            onOpen={onOpen}
            selectMode={selectMode}
            selected={selected.has(keyOf(photo))}
            onToggleSelect={() => toggleSelected(keyOf(photo))}
          />
        ))}
        {!selectMode && photos.length > 6 && (
          <button type="button" className="wd-photo-more" onClick={() => onOpen?.(photos, 6)}>
            +{photos.length - 6}
          </button>
        )}
      </div>

      <div className="wd-photo-strip-actions">
        {!selectMode ? (
          <button type="button" className="wd-photo-select-toggle" onClick={() => setSelectMode(true)}>
            선택
          </button>
        ) : (
          <>
            <button type="button" className="wd-photo-select-all" onClick={toggleSelectAll} disabled={downloading}>
              {selected.size === photos.length ? '전체 해제' : '전체 선택'}
            </button>
            <span className="wd-photo-select-count">{selected.size}장 선택됨</span>
            <button
              type="button"
              className="wd-photo-download-selected"
              onClick={handleDownloadSelected}
              disabled={!selected.size || downloading}
            >
              {downloading
                ? (progress && progress.total > 1 ? `압축 중... (${progress.done}/${progress.total})` : '다운로드 중...')
                : '⬇ 선택 다운로드'}
            </button>
            <button type="button" className="wd-photo-select-cancel" onClick={exitSelectMode} disabled={downloading}>
              취소
            </button>
          </>
        )}
      </div>
      {error && <div className="wd-photo-strip-error" role="alert">{error}</div>}
    </div>
  )
}

const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 0.4

export function PhotoGalleryModal({ photos, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const current = photos?.[index]

  const [src, setSrc] = useState(null)
  const [imgStatus, setImgStatus] = useState('loading') // loading | ready | error
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  // PC용 확대/이동 — 모바일은 브라우저 자체 핀치줌을 그대로 쓰고,
  // 여기서는 마우스 휠/더블클릭/버튼/드래그로 데스크톱에서도 확대해서 볼 수 있게 한다.
  const [zoom, setZoom] = useState(ZOOM_MIN)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const bodyRef = useRef(null)
  const dragOrigin = useRef(null)

  useEffect(() => {
    setIndex(startIndex)
  }, [startIndex, photos])

  useEffect(() => {
    setZoom(ZOOM_MIN)
    setPan({ x: 0, y: 0 })
  }, [index])

  useEffect(() => {
    if (!current) return
    let cancelled = false
    setImgStatus('loading')
    setSrc(null)
    setDownloadError('')
    getAttachmentSignedUrl(current)
      .then((url) => {
        if (cancelled) return
        setSrc(url)
        setImgStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[DiaryPhotos] 원본 signed URL 실패:', current.storage_path, err.message || err)
        setImgStatus('error')
      })
    return () => { cancelled = true }
  }, [current?.id, current?.storage_path])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1))
      if (event.key === 'ArrowRight') setIndex((value) => Math.min((photos?.length || 1) - 1, value + 1))
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, photos?.length])

  // 휠로 확대/축소 — React의 합성 wheel 이벤트는 passive라 preventDefault가
  // 안 먹을 수 있어서 네이티브 리스너로 직접 등록한다.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    function onWheel(event) {
      if (imgStatus !== 'ready') return
      event.preventDefault()
      zoomTo(zoom + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, imgStatus])

  if (!current) return null

  function clampPan(nextPan, z) {
    const bounds = bodyRef.current?.getBoundingClientRect()
    if (!bounds || z <= ZOOM_MIN) return { x: 0, y: 0 }
    const maxX = (bounds.width * (z - 1)) / 2
    const maxY = (bounds.height * (z - 1)) / 2
    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y)),
    }
  }

  function zoomTo(nextZoomRaw) {
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(nextZoomRaw * 100) / 100))
    setZoom(nextZoom)
    setPan((prevPan) => clampPan(prevPan, nextZoom))
  }

  function resetZoom() {
    setZoom(ZOOM_MIN)
    setPan({ x: 0, y: 0 })
  }

  function handleDoubleClick() {
    if (zoom > ZOOM_MIN) resetZoom()
    else zoomTo(2)
  }

  function handlePointerDown(event) {
    if (zoom <= ZOOM_MIN) return
    setIsPanning(true)
    dragOrigin.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event) {
    if (!dragOrigin.current) return
    const dx = event.clientX - dragOrigin.current.x
    const dy = event.clientY - dragOrigin.current.y
    setPan(clampPan({ x: dragOrigin.current.panX + dx, y: dragOrigin.current.panY + dy }, zoom))
  }

  function handlePointerUp() {
    dragOrigin.current = null
    setIsPanning(false)
  }

  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    setDownloadError('')
    try {
      await downloadAttachment(current)
    } catch (err) {
      setDownloadError(err.message || String(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="wd-photo-modal" role="dialog" aria-modal="true" aria-label="첨부 사진 크게 보기">
      <button type="button" className="wd-photo-modal-backdrop" onClick={onClose} aria-label="닫기" />
      <div className="wd-photo-modal-panel">
        <div className="wd-photo-modal-head">
          <strong>{current.original_name || '첨부 사진'}</strong>
          <div className="wd-photo-modal-head-actions">
            {imgStatus === 'ready' && (
              <div className="wd-photo-zoom-controls">
                <button
                  type="button"
                  onClick={() => zoomTo(zoom - ZOOM_STEP)}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="축소"
                >
                  －
                </button>
                <span className="wd-photo-zoom-level">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => zoomTo(zoom + ZOOM_STEP)}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="확대"
                >
                  ＋
                </button>
                {zoom > ZOOM_MIN && (
                  <button type="button" className="wd-photo-zoom-reset" onClick={resetZoom}>
                    원본 크기
                  </button>
                )}
              </div>
            )}
            <span>{index + 1} / {photos.length}</span>
            <button
              type="button"
              className="wd-photo-download-btn"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? '다운로드 중...' : '⬇ 다운로드'}
            </button>
            <button type="button" onClick={onClose}>닫기</button>
          </div>
        </div>
        <div className="wd-photo-modal-body" ref={bodyRef}>
          {photos.length > 1 && (
            <button
              type="button"
              className="wd-photo-nav prev"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
              aria-label="이전 사진"
            >
              ‹
            </button>
          )}
          {imgStatus === 'ready' && (
            <img
              src={src}
              alt={current.original_name || '첨부 사진'}
              draggable={false}
              onError={() => setImgStatus('error')}
              onDoubleClick={handleDoubleClick}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={zoom > ZOOM_MIN ? 'wd-photo-zoomed' : ''}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isPanning ? 'none' : 'transform 0.12s ease',
                cursor: zoom > ZOOM_MIN ? (isPanning ? 'grabbing' : 'grab') : 'zoom-in',
              }}
            />
          )}
          {imgStatus === 'loading' && (
            <div className="wd-photo-modal-loading">불러오는 중...</div>
          )}
          {imgStatus === 'error' && (
            <div className="wd-photo-modal-fallback">
              <div className="wd-photo-modal-fallback-icon" aria-hidden="true">🖼️</div>
              <div>이 형식은 미리보기를 지원하지 않습니다.</div>
              <div>다운로드 버튼으로 원본을 받아 확인해주세요.</div>
            </div>
          )}
          {photos.length > 1 && (
            <button
              type="button"
              className="wd-photo-nav next"
              onClick={() => setIndex((value) => Math.min(photos.length - 1, value + 1))}
              disabled={index === photos.length - 1}
              aria-label="다음 사진"
            >
              ›
            </button>
          )}
        </div>
        {downloadError && (
          <div className="wd-photo-modal-error" role="alert">{downloadError}</div>
        )}
      </div>
    </div>
  )
}
