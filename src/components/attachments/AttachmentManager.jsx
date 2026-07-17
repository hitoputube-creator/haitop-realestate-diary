import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ATTACHMENT_ACCEPT,
  createAttachmentSignedUrl,
  deleteAttachment,
  formatFileSize,
  isImageAttachment,
  isMissingAttachmentSetupError,
  isPdfAttachment,
  listAttachmentsForCustomer,
  uploadAttachmentFiles,
  validateAttachmentFiles,
} from '../../lib/attachments'
import './AttachmentManager.css'

function AttachmentIcon({ attachment }) {
  if (isImageAttachment(attachment)) return <span aria-hidden="true">IMG</span>
  if (isPdfAttachment(attachment)) return <span aria-hidden="true">PDF</span>
  return <span aria-hidden="true">FILE</span>
}

function setupMessage(error) {
  return isMissingAttachmentSetupError(error)
    ? '첨부파일 저장소 또는 권한 정책이 아직 적용되지 않았습니다. 008_create_crm_attachments.sql과 private Storage 정책 적용이 필요합니다.'
    : error.message || String(error)
}

export function AttachmentUploader({
  customerId,
  workDiaryId,
  uploadedBy,
  buttonLabel = '파일 추가',
  autoUpload = true,
  onUploaded,
  onPendingChange,
  disabled,
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState([])
  const [errors, setErrors] = useState([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    if (!autoUpload) onPendingChange?.(selected)
  }, [autoUpload, onPendingChange, selected])

  function addFiles(fileList) {
    const next = [...selected, ...Array.from(fileList || [])]
    const { validFiles, errors: validationErrors } = validateAttachmentFiles(next)
    setSelected(validFiles)
    setErrors(validationErrors)
    setResults([])
    setOpen(true)
  }

  function removeFile(index) {
    setSelected((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  async function handleUpload(filesOverride = null) {
    const files = filesOverride || selected
    if (uploading || files.length === 0) return []
    setUploading(true)
    setResults([])
    try {
      const uploadResults = await uploadAttachmentFiles({
        files,
        customerId,
        workDiaryId,
        uploadedBy,
      })
      setResults(uploadResults)
      const successful = uploadResults.filter((result) => result.status === 'success').map((result) => result.attachment)
      const failedFiles = uploadResults
        .filter((result) => result.status === 'failed' && result.file)
        .map((result) => result.file)
      if (successful.length > 0) {
        onUploaded?.(successful)
        setSelected(failedFiles)
        if (inputRef.current) inputRef.current.value = ''
      }
      return uploadResults
    } finally {
      setUploading(false)
    }
  }

  const totalSize = useMemo(
    () => selected.reduce((sum, file) => sum + file.size, 0),
    [selected]
  )

  return (
    <div className="att-uploader">
      <button
        type="button"
        className="att-button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled || uploading}
      >
        {buttonLabel}
      </button>
      {open && (
        <div className="att-upload-box">
          <label className="att-file-pick">
            <span>사진·파일 선택</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              disabled={disabled || uploading}
              onChange={(event) => addFiles(event.target.files)}
            />
          </label>
          {errors.length > 0 && (
            <div className="att-error" role="alert">
              {errors.map((error) => <div key={error}>{error}</div>)}
            </div>
          )}
          {selected.length > 0 && (
            <div className="att-selected">
              <div className="att-selected-head">
                <strong>선택한 파일 {selected.length}개</strong>
                <span>{formatFileSize(totalSize)}</span>
                <button type="button" onClick={() => setSelected([])} disabled={uploading}>전체 취소</button>
              </div>
              {selected.map((file, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`} className="att-selected-row">
                  {file.type.startsWith('image/') ? (
                    <img src={URL.createObjectURL(file)} alt="" />
                  ) : (
                    <div className="att-file-icon">{file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'FILE'}</div>
                  )}
                  <div>
                    <strong title={file.name}>{file.name}</strong>
                    <span>{formatFileSize(file.size)}</span>
                  </div>
                  <button type="button" onClick={() => removeFile(index)} disabled={uploading}>취소</button>
                </div>
              ))}
            </div>
          )}
          {autoUpload && selected.length > 0 && (
            <button type="button" className="att-primary" onClick={() => handleUpload()} disabled={uploading || disabled}>
              {uploading ? '업로드 중...' : '업로드'}
            </button>
          )}
          {results.length > 0 && (
            <div className="att-results">
              {results.map((result, index) => (
                <div key={index} className={result.status === 'success' ? 'success' : 'failed'}>
                  {result.status === 'success'
                    ? `${result.file.name} 업로드 완료`
                    : `${result.file?.name || '파일'} 실패: ${result.setupError ? setupMessage(result.error) : result.error}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PendingAttachmentPicker({ onFilesChange, disabled }) {
  return (
    <AttachmentUploader
      autoUpload={false}
      buttonLabel="사진·파일 추가"
      disabled={disabled}
      onPendingChange={onFilesChange}
    />
  )
}

export function AttachmentList({ attachments, compact = false, onDeleted, emptyText = '첨부파일이 없습니다.' }) {
  const [preview, setPreview] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  async function openAttachment(attachment, previewMode = false) {
    setError('')
    setBusyId(attachment.id)
    try {
      const url = await createAttachmentSignedUrl(attachment)
      if (previewMode && isImageAttachment(attachment)) {
        setPreview({ attachment, url })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (openError) {
      setError(`파일 열기 실패: ${setupMessage(openError)}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(attachment) {
    if (!window.confirm(`첨부파일 "${attachment.original_name}"을 삭제할까요?`)) return
    setError('')
    setBusyId(attachment.id)
    try {
      await deleteAttachment(attachment)
      onDeleted?.(attachment)
    } catch (deleteError) {
      setError(`파일 삭제 실패: ${setupMessage(deleteError)}`)
    } finally {
      setBusyId(null)
    }
  }

  if (!attachments?.length) {
    return <div className="att-empty">{emptyText}</div>
  }

  return (
    <div className={`att-list ${compact ? 'compact' : ''}`}>
      {error && <div className="att-error" role="alert">{error}</div>}
      {attachments.map((attachment) => (
        <article key={attachment.id} className="att-item">
          <button
            type="button"
            className="att-thumb"
            onClick={() => openAttachment(attachment, isImageAttachment(attachment))}
            disabled={busyId === attachment.id}
            title={attachment.original_name}
          >
            {isImageAttachment(attachment) ? 'IMG' : <AttachmentIcon attachment={attachment} />}
          </button>
          <div className="att-meta">
            <strong title={attachment.original_name}>{attachment.original_name}</strong>
            <span>
              {formatFileSize(attachment.file_size)}
              {attachment.uploaded_by ? ` · ${attachment.uploaded_by}` : ''}
            </span>
          </div>
          <div className="att-actions">
            <button type="button" onClick={() => openAttachment(attachment, isImageAttachment(attachment))} disabled={busyId === attachment.id}>
              {isImageAttachment(attachment) ? '미리보기' : '열기'}
            </button>
            <button type="button" onClick={() => handleDelete(attachment)} disabled={busyId === attachment.id}>
              삭제
            </button>
          </div>
        </article>
      ))}
      {preview && (
        <div className="att-preview" role="dialog" aria-modal="true" aria-label="이미지 미리보기">
          <div className="att-preview-panel">
            <div className="att-preview-head">
              <strong>{preview.attachment.original_name}</strong>
              <button type="button" onClick={() => setPreview(null)}>닫기</button>
            </div>
            <img src={preview.url} alt={preview.attachment.original_name} />
          </div>
        </div>
      )}
    </div>
  )
}

export function CustomerAttachments({ customer, uploadedBy, refreshKey = 0 }) {
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      if (!customer?.id) {
        if (!cancelled) setAttachments([])
        return
      }
      setLoading(true)
      setError('')
      try {
        const rows = await listAttachmentsForCustomer(customer.id, 20)
        if (!cancelled) setAttachments(rows)
      } catch (loadError) {
        if (!cancelled) {
          setAttachments([])
          setError(`첨부파일 조회 실패: ${setupMessage(loadError)}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [customer?.id, refreshKey])

  if (!customer?.id) return null

  return (
    <section className="att-customer-panel">
      <div className="att-panel-head">
        <div>
          <h3>첨부파일 {attachments.length}개</h3>
          <span>최근 업로드순</span>
        </div>
        <AttachmentUploader
          customerId={customer.id}
          uploadedBy={uploadedBy || customer.manager}
          buttonLabel="파일 추가"
          onUploaded={(rows) => setAttachments((prev) => [...rows, ...prev])}
        />
      </div>
      {loading ? <div className="att-empty">첨부파일을 불러오는 중...</div> : null}
      {error ? <div className="att-error" role="alert">{error}</div> : null}
      <AttachmentList
        attachments={attachments}
        onDeleted={(deleted) => setAttachments((prev) => prev.filter((row) => row.id !== deleted.id))}
      />
    </section>
  )
}
