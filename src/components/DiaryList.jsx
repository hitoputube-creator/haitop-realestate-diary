import { useEffect, useRef, useState } from 'react'

/* ===== 헬퍼 ===== */
const TAG_REGEX = /#[\w가-힣]+/g

export function extractTags(text) {
  if (!text) return []
  const matches = text.match(TAG_REGEX) || []
  // # 제외, 중복 제거
  return Array.from(new Set(matches.map((t) => t.slice(1))))
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

function formatDateLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/* ===== 상태 배지 ===== */
const STATUS_META = {
  normal: { label: '일반', icon: null },
  important: { label: '중요', icon: '★' },
  later: { label: '나중에', icon: '◉' },
  done: { label: '완료', icon: '✓' },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.normal
  if (status === 'normal') return null // 일반은 배지 숨김
  return (
    <span className={`wd-badge ${status}`}>
      {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
      {meta.label}
    </span>
  )
}

/* ===== 메모 카드 ===== */
function MemoCard({ memo, onChangeStatus, onDelete, onUpdateContent, showDate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(memo.content)
  const taRef = useRef(null)

  function autoResize(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(150, el.scrollHeight)}px`
  }

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      taRef.current.setSelectionRange(draft.length, draft.length)
      autoResize(taRef.current)
    }
  }, [editing])

  useEffect(() => {
    setDraft(memo.content)
  }, [memo.content])

  const tags = memo.tags && memo.tags.length ? memo.tags : extractTags(memo.content)

  const cls = ['wd-card', `status-${memo.status || 'normal'}`, editing && 'editing']
    .filter(Boolean)
    .join(' ')

  function saveEdit() {
    const next = draft.trim()
    if (!next) return
    if (next === memo.content) {
      setEditing(false)
      return
    }
    onUpdateContent(memo.id, next)
    setEditing(false)
  }

  return (
    <article className={cls} aria-label="메모">
      <div className="wd-card-top">
        <div className="wd-card-meta">
          <span className="wd-card-time">{formatTime(memo.created_at)}</span>
          <span className="wd-card-writer" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
            · {memo.writer || '주현희'}
          </span>
          {showDate && <span className="wd-card-date">· {formatDateLabel(memo.date)}</span>}
        </div>
        <StatusBadge status={memo.status || 'normal'} />
      </div>

      <div className="wd-card-content">{memo.content}</div>

      {editing && (
        <textarea
          ref={taRef}
          className="wd-card-edit"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            autoResize(e.target)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(memo.content)
              setEditing(false)
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              saveEdit()
            }
          }}
        />
      )}

      {tags.length > 0 && !editing && (
        <div className="wd-card-tags">
          {tags.map((t) => (
            <span key={t} className="wd-tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="wd-card-actions">
        {!editing ? (
          <>
            <button
              type="button"
              className={`wd-action-btn ${memo.status === 'important' ? 'active' : ''}`}
              onClick={() =>
                onChangeStatus(memo.id, memo.status === 'important' ? 'normal' : 'important')
              }
              aria-pressed={memo.status === 'important'}
            >
              <span aria-hidden="true">★</span> 중요
            </button>
            <button
              type="button"
              className={`wd-action-btn later ${memo.status === 'later' ? 'active later' : ''}`}
              onClick={() =>
                onChangeStatus(memo.id, memo.status === 'later' ? 'normal' : 'later')
              }
              aria-pressed={memo.status === 'later'}
            >
              <span aria-hidden="true">◉</span> 나중에
            </button>
            <button
              type="button"
              className={`wd-action-btn done ${memo.status === 'done' ? 'active done' : ''}`}
              onClick={() =>
                onChangeStatus(memo.id, memo.status === 'done' ? 'normal' : 'done')
              }
              aria-pressed={memo.status === 'done'}
            >
              <span aria-hidden="true">✓</span> 완료
            </button>
            <span className="wd-action-spacer" />
            <button
              type="button"
              className="wd-action-btn"
              onClick={() => setEditing(true)}
              aria-label="메모 수정"
            >
              수정
            </button>
            <button
              type="button"
              className="wd-action-btn danger"
              onClick={() => {
                if (window.confirm('이 메모를 삭제하시겠어요?')) onDelete(memo.id)
              }}
              aria-label="메모 삭제"
            >
              삭제
            </button>
          </>
        ) : (
          <>
            <span className="wd-action-spacer" />
            <button
              type="button"
              className="wd-action-btn"
              onClick={() => {
                setDraft(memo.content)
                setEditing(false)
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="wd-action-btn active"
              onClick={saveEdit}
            >
              저장
            </button>
          </>
        )}
      </div>
    </article>
  )
}

/* ===== 입력창 (Composer) ===== */
function Composer({ onSubmit, disabled }) {
  const [value, setValue] = useState('')
  const [writer, setWriter] = useState('주현희')
  const [submitting, setSubmitting] = useState(false)
  const composerRef = useRef(null)

  function autoResizeComposer(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(150, el.scrollHeight)}px`
  }

  async function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed, writer)
      setValue('')
      if (composerRef.current) composerRef.current.style.height = '150px'
    } finally {
      setSubmitting(false)
    }
  }

  const previewTags = extractTags(value)

  return (
    <div className="wd-composer">
      <textarea
        ref={composerRef}
        className="wd-composer-input"
        placeholder="이 날짜에 메모를 남겨보세요. #태그를 포함하면 자동으로 분류됩니다."
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          autoResizeComposer(e.target)
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
          }
        }}
        disabled={disabled || submitting}
      />
      <div className="wd-composer-bar">
        <div className="wd-composer-hint">
          <code>Cmd/Ctrl + Enter</code> 로 저장
          {previewTags.length > 0 && (
            <span style={{ marginLeft: 12 }}>
              감지된 태그: {previewTags.map((t) => `#${t}`).join(' ')}
            </span>
          )}
        </div>
        <div className="wd-composer-actions-right">
          <select
            className="wd-composer-writer-select"
            value={writer}
            onChange={(e) => setWriter(e.target.value)}
            disabled={disabled || submitting}
          >
            <option value="주현희">주현희</option>
            <option value="김정현">김정현</option>
          </select>
          <button
            type="button"
            className="wd-btn wd-btn-primary"
            onClick={handleSubmit}
            disabled={disabled || submitting || !value.trim()}
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ===== 다이어리 리스트 메인 ===== */
export default function DiaryList({
  selectedDate,
  memos,
  loading,
  error,
  searchMode,
  onCreate,
  onChangeStatus,
  onDelete,
  onUpdateContent,
  composerDisabled,
}) {
  const dateLabel = selectedDate
    ? `${selectedDate.getFullYear()}년 ${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`
    : ''

  const weekdayLabel = selectedDate
    ? ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][
        selectedDate.getDay()
      ]
    : ''

  const importantCount = memos.filter((m) => m.status === 'important').length
  const doneCount = memos.filter((m) => m.status === 'done').length

  return (
    <section className="wd-panel wd-diary" aria-label="메모 목록">
      {!searchMode && (
        <header className="wd-diary-header">
          <div className="wd-diary-date">{dateLabel}</div>
          <div className="wd-diary-date-sub">{weekdayLabel}</div>
          <div className="wd-diary-stats">
            <span>
              <span className="wd-stat-num">{memos.length}</span>건
            </span>
            <span>
              중요 <span className="wd-stat-num">{importantCount}</span>
            </span>
            <span>
              완료 <span className="wd-stat-num">{doneCount}</span>
            </span>
          </div>
        </header>
      )}

      {searchMode && (
        <div className="wd-search-result-banner">
          <span>
            검색 결과 <span className="wd-search-result-count">{memos.length}</span>건
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-on-surface-faint)' }}>
            검색을 지우면 일자별 보기로 돌아갑니다
          </span>
        </div>
      )}

      {!searchMode && <Composer onSubmit={(content, writer) => onCreate(content, writer)} disabled={composerDisabled} />}

      {error && <div className="wd-error" role="alert">{error}</div>}

      <div className="wd-list">
        {loading ? (
          <div className="wd-loading">불러오는 중...</div>
        ) : memos.length === 0 ? (
          <div className="wd-empty">
            <div className="wd-empty-icon" aria-hidden="true">
              {searchMode ? '○' : '✎'}
            </div>
            <div className="wd-empty-title">
              {searchMode ? '검색 결과가 없습니다' : '아직 메모가 없습니다'}
            </div>
            <div className="wd-empty-sub">
              {searchMode
                ? '다른 키워드로 검색해보세요.'
                : '위쪽 입력창에 첫 메모를 남겨보세요.'}
            </div>
          </div>
        ) : (
          memos.map((m) => (
            <MemoCard
              key={m.id}
              memo={m}
              showDate={searchMode}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
              onUpdateContent={onUpdateContent}
            />
          ))
        )}
      </div>
    </section>
  )
}
