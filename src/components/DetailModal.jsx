import { useEffect, useId, useRef } from 'react'

export default function DetailModal({ title, onClose, children, className = '' }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [])

  function handleKeyDown(event) {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
    if (dialogs[dialogs.length - 1] !== dialogRef.current) return

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="wd-detail-overlay"
      data-detail-modal-root="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className={`wd-detail-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <header className="wd-detail-header">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} type="button" className="wd-detail-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="wd-detail-body">{children}</div>
      </section>
    </div>
  )
}
