import { useRef, useState } from 'react'
import {
  FILE_ACCEPT,
  MAX_DIARY_FILES,
  formatPhotoSize,
  validateDiaryFiles,
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

export function DiaryFileList({ files }) {
  if (!files?.length) return null

  return (
    <div className="wd-file-list" aria-label="첨부 파일">
      {files.map((file) => (
        <a
          className="wd-file-item"
          href={file.public_url}
          target="_blank"
          rel="noopener noreferrer"
          download={file.original_name || undefined}
          key={file.id || file.storage_path}
          title={`${file.original_name || '첨부 파일'} 열기`}
        >
          <span className="wd-file-icon" aria-hidden="true">{getExtension(file.original_name)}</span>
          <span className="wd-file-meta">
            <strong>{file.original_name || '첨부 파일'}</strong>
            <span>{formatPhotoSize(file.file_size)} · 열기/다운로드</span>
          </span>
        </a>
      ))}
    </div>
  )
}
