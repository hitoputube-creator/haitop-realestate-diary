import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatPhotoSize,
  MAX_PHOTO_FILES,
  PHOTO_ACCEPT,
  validatePhotoFiles,
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
          jpg/png/webp, 최대 {MAX_PHOTO_FILES}장
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

export function DiaryPhotoStrip({ photos, onOpen }) {
  if (!photos?.length) return null

  return (
    <div className="wd-photo-strip" aria-label="첨부 사진">
      {photos.slice(0, 6).map((photo, index) => (
        <button
          type="button"
          className="wd-photo-thumb"
          key={photo.id || photo.storage_path}
          onClick={() => onOpen?.(photos, index)}
          title={photo.original_name || '첨부 사진'}
        >
          <img src={photo.public_url} alt={photo.original_name || '첨부 사진'} loading="lazy" />
        </button>
      ))}
      {photos.length > 6 && (
        <button type="button" className="wd-photo-more" onClick={() => onOpen?.(photos, 6)}>
          +{photos.length - 6}
        </button>
      )}
    </div>
  )
}

export function PhotoGalleryModal({ photos, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const current = photos?.[index]

  useEffect(() => {
    setIndex(startIndex)
  }, [startIndex, photos])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1))
      if (event.key === 'ArrowRight') setIndex((value) => Math.min((photos?.length || 1) - 1, value + 1))
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, photos?.length])

  if (!current) return null

  return (
    <div className="wd-photo-modal" role="dialog" aria-modal="true" aria-label="첨부 사진 크게 보기">
      <button type="button" className="wd-photo-modal-backdrop" onClick={onClose} aria-label="닫기" />
      <div className="wd-photo-modal-panel">
        <div className="wd-photo-modal-head">
          <strong>{current.original_name || '첨부 사진'}</strong>
          <span>{index + 1} / {photos.length}</span>
          <button type="button" onClick={onClose}>닫기</button>
        </div>
        <div className="wd-photo-modal-body">
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
          <img src={current.public_url} alt={current.original_name || '첨부 사진'} />
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
      </div>
    </div>
  )
}
