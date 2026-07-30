import { useRef, useState } from 'react'
import {
  FILE_ACCEPT,
  MAX_DIARY_FILES,
  formatPhotoSize,
  validateDiaryFiles,
  downloadAttachment,
} from '../lib/attachments'

function getExtension(name = '') {
  const parts = String(name).split('.')
  if (parts.length < 2) return 'FILE'
  return parts.pop().toUpperCase().slice(0, 5)
}

export function DiaryFileUploader({ files, onChange, disabled, busy }) {
  const inputRef = useRef(null)
  const [errors, setErrors] = useState([])

  function addFiles(fileList) {
    const next = [...files, ...Array.from(fileList || [])]
    const { validFiles, errors: validationErrors } = validateDiaryFiles(next)
    setErrors(validationErrors)
    onChange(validFiles)
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeFile(index) {
    setErrors([])
    onChange(files.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <div className="wd-file-uploader">
      <div className="wd-file-uploader-row">
        <label className="wd-file-add-btn">
          <span aria-hidden="true">파일</span>
          <span>파일 추가</span>
          <input
            ref={inputRef}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            disabled={disabled || busy}
            onChange={(event) => addFiles(event.target.files)}
          />
        </label>
        <span className="wd-file-help">
          PDF·한글·워드·엑셀·PPT·텍스트·압축파일, 최대 {MAX_DIARY_FILES}개
        </span>
      </div>

      {errors.length > 0 && (
        <div className="wd-photo-error" role="alert">
          {errors.map((error) => <div key={error}>{error}</div>)}
        </div>
      )}

      {files.length > 0 && (
        <div className="wd-file-preview-list">
          {files.map((file, index) => (
            <div className="wd-file-preview" key={`${file.name}-${file.lastModified}-${index}`}>
              <span className="wd-file-icon" aria-hidden="true">{getExtension(file.name)}</span>
              <div className="wd-file-meta">
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

// 첨부파일 1개 — 비공개 버킷이므로 클릭할 때마다 새 signed URL을 받아 fetch+blob으로 저장한다.
// cross-origin <a download>는 브라우저가 무시할 수 있어 쓰지 않는다.
function FileDownloadItem({ file }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    if (downloading) return
    setDownloading(true)
    setError('')
    try {
      await downloadAttachment(file)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="wd-file-item-wrap">
      <button
        type="button"
        className="wd-file-item"
        onClick={handleClick}
        disabled={downloading}
        title={`${file.original_name || '첨부 파일'} 다운로드`}
      >
        <span className="wd-file-icon" aria-hidden="true">{getExtension(file.original_name)}</span>
        <span className="wd-file-meta">
          <strong>{file.original_name || '첨부 파일'}</strong>
          <span>{formatPhotoSize(file.file_size)} · {downloading ? '다운로드 중...' : '다운로드'}</span>
        </span>
      </button>
      {error && <div className="wd-file-item-error" role="alert">{error}</div>}
    </div>
  )
}

export function DiaryFileList({ files }) {
  if (!files?.length) return null

  return (
    <div className="wd-file-list" aria-label="첨부 파일">
      {files.map((file) => (
        <FileDownloadItem key={file.id || file.storage_path} file={file} />
      ))}
    </div>
  )
}
