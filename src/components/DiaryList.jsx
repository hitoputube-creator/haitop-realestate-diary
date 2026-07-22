import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { DiaryPhotoStrip, DiaryPhotoUploader, PhotoGalleryModal } from './DiaryPhotos'

/* ===== 스티커 메타 ===== */
export const STICKER_META = {
  '계약': { color: '#C9A84C' },
  '잔금': { color: '#E74C3C' },
  '약속': { color: '#3498DB' },
  '내부': { color: '#27AE60' },
  '기타': { color: '#95A5A6' },
}

const STICKER_OPTIONS = [
  { value: null,   label: '없음' },
  { value: '계약', label: '계약' },
  { value: '잔금', label: '잔금' },
  { value: '약속', label: '약속' },
  { value: '내부', label: '내부' },
  { value: '기타', label: '기타' },
]

const PROPERTY_REGISTER_URL = 'https://hitoputube-creator.github.io/haitop-realty-system/register.html'

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

function formatDateLabel(iso, fullFormat = false) {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  if (fullFormat) {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }
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
function MemoCard({ memo, photos, onOpenPhotos, onAddPhotos, onChangeStatus, onDelete, onUpdateContent, showDate, onLinkKeyClick, onUpdateLinkKey, allLinkKeys, isPinned, onPin, onUnpin, isHighlighted, onNavigate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(memo.content)
  const [draftName, setDraftName] = useState(memo.customer_name || '')
  const [draftPhone, setDraftPhone] = useState(memo.customer_phone || '')
  const [draftTitle, setDraftTitle] = useState(memo.title || '')
  const [draftSticker, setDraftSticker] = useState(memo.sticker || null)
  const [photoAddOpen, setPhotoAddOpen] = useState(false)
  const [photoFiles, setPhotoFiles] = useState([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const taRef = useRef(null)
  const cardRef = useRef(null)

  // 연결태그 인라인 편집 상태
  const [linkEditing, setLinkEditing] = useState(false)
  const [linkDraft, setLinkDraft] = useState(memo.link_key || '')
  const [linkSaving, setLinkSaving] = useState(false)
  const linkInputRef = useRef(null)

  useEffect(() => {
    setLinkDraft(memo.link_key || '')
  }, [memo.link_key])

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  useEffect(() => {
    if (linkEditing && linkInputRef.current) {
      linkInputRef.current.focus()
      linkInputRef.current.select()
    }
  }, [linkEditing])

  async function saveLinkKey() {
    if (linkSaving) return
    setLinkSaving(true)
    try {
      await onUpdateLinkKey(memo.id, linkDraft.trim())
      setLinkEditing(false)
    } finally {
      setLinkSaving(false)
    }
  }

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
    setDraftName(memo.customer_name || '')
    setDraftPhone(memo.customer_phone || '')
    setDraftTitle(memo.title || '')
    setDraftSticker(memo.sticker || null)
    setLinkDraft(memo.link_key || '')
  }, [memo.content, memo.customer_name, memo.customer_phone, memo.title, memo.sticker, memo.link_key])

  const tags = memo.tags && memo.tags.length ? memo.tags : extractTags(memo.content)

  const stickerMeta = memo.sticker ? STICKER_META[memo.sticker] : null

  const cls = ['wd-card', `status-${memo.status || 'normal'}`, editing && 'editing', isHighlighted && 'wd-card-highlighted']
    .filter(Boolean)
    .join(' ')

  function saveEdit() {
    const next = draft.trim()
    if (!next) return
    const nextName = draftName.trim()
    const nextPhone = draftPhone.trim()
    const nextTitle = draftTitle.trim()
    const nextLinkKey = linkDraft.trim()
    const nextSticker = draftSticker || null
    const changed =
      next !== memo.content ||
      nextName !== (memo.customer_name || '') ||
      nextPhone !== (memo.customer_phone || '') ||
      nextTitle !== (memo.title || '') ||
      nextLinkKey !== (memo.link_key || '') ||
      nextSticker !== (memo.sticker || null)
    if (!changed) {
      setEditing(false)
      return
    }
    onUpdateContent(memo.id, next, {
      customer_name: nextName || null,
      customer_phone: nextPhone || null,
      title: nextTitle || null,
      link_key: nextLinkKey || '',
      sticker: nextSticker,
    })
    setEditing(false)
  }

  function resetEditDraft() {
    setDraft(memo.content)
    setDraftName(memo.customer_name || '')
    setDraftPhone(memo.customer_phone || '')
    setDraftTitle(memo.title || '')
    setDraftSticker(memo.sticker || null)
    setLinkDraft(memo.link_key || '')
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

  function sendToPropertyRegister() {
    const params = new URLSearchParams()
    params.set('memo', memo.content || '')
    if (memo.title) params.set('title', memo.title)
    if (memo.customer_name) params.set('customerName', memo.customer_name)
    if (memo.customer_phone) params.set('customerPhone', memo.customer_phone)
    if (memo.id) params.set('diaryId', String(memo.id))

    const transferPhotos = (photos || [])
      .map((photo) => ({
        id: photo.id || '',
        url: photo.public_url || '',
        name: photo.original_name || '업무일지 사진',
      }))
      .filter((photo) => photo.url)
      .slice(0, 5)

    if (transferPhotos.length > 0) {
      params.set('photos', JSON.stringify(transferPhotos))
    }

    window.location.href = `${PROPERTY_REGISTER_URL}?${params.toString()}`
  }

  return (
    <article ref={cardRef} className={cls} aria-label="메모">
      <div className="wd-card-top">
        <div className="wd-card-meta">
          <span className="wd-card-time">{formatTime(memo.created_at)}</span>
          <span className="wd-card-writer" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
            · {memo.writer || '주현희'}
          </span>
          {showDate && <span className="wd-card-date">· {formatDateLabel(memo.date, true)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {memo.link_key ? (
            <>
              <button
                type="button"
                className="wd-link-badge"
                onClick={(e) => { e.stopPropagation(); onLinkKeyClick && onLinkKeyClick(memo.link_key) }}
                title={`연결태그 메모 보기: ${memo.link_key}`}
              >
                🔗 {memo.link_key}
              </button>
              {!editing && (
                <button
                  type="button"
                  className="wd-link-edit-btn"
                  onClick={() => setLinkEditing(true)}
                  title="연결태그 수정"
                >
                  수정
                </button>
              )}
            </>
          ) : null}
          {stickerMeta && (
            <span
              className="wd-sticker-badge"
              style={{ background: stickerMeta.color }}
            >
              {memo.sticker}
            </span>
          )}
          <StatusBadge status={memo.status || 'normal'} />
        </div>
      </div>

      {!editing ? (
        <div className="wd-card-customer">
          <span className="wd-card-title">{memo.title || '(제목 미입력)'}</span>
          <span className="wd-card-customer-badge">👤 {memo.customer_name || '미입력'}</span>
          <span className="wd-card-customer-badge">📞 {memo.customer_phone || '미입력'}</span>
        </div>
      ) : (
        <div className="wd-card-customer-edit">
          <input
            className="wd-card-customer-input"
            placeholder="제목"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
          />
          <input
            className="wd-card-customer-input"
            placeholder="이름"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <input
            className="wd-card-customer-input"
            placeholder="연락처"
            value={draftPhone}
            onChange={(e) => setDraftPhone(e.target.value)}
          />
        </div>
      )}

      {/* 연결태그 인라인 편집 */}
      {linkEditing && !editing && (
        <div className="wd-link-inline-editor">
          <span className="wd-link-inline-label">연결태그</span>
          <input
            ref={linkInputRef}
            list="wd-link-key-datalist-card"
            className="wd-link-inline-input"
            placeholder="예: 금승리67-6, 공장손님-김OO"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveLinkKey() }
              if (e.key === 'Escape') { setLinkDraft(memo.link_key || ''); setLinkEditing(false) }
            }}
            disabled={linkSaving}
          />
          <datalist id="wd-link-key-datalist-card">
            {(allLinkKeys || []).map((k) => <option key={k} value={k} />)}
          </datalist>
          <button
            type="button"
            className="wd-link-inline-save"
            onClick={saveLinkKey}
            disabled={linkSaving}
          >
            {linkSaving ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            className="wd-link-inline-cancel"
            onClick={() => { setLinkDraft(memo.link_key || ''); setLinkEditing(false) }}
            disabled={linkSaving}
          >
            취소
          </button>
          {/* 내용 수정창이 없을 때는 link 에디터 바 안에 인라인 표시 */}
          {!editing && (
            <LinkKeySearchBox
              currentValue={linkDraft}
              onSelect={setLinkDraft}
              disabled={linkSaving}
              variant="inline"
            />
          )}
        </div>
      )}

      <div
        className={`wd-card-content${showDate && onNavigate ? ' wd-card-content--navigable' : ''}`}
        onClick={showDate && onNavigate && !editing ? () => onNavigate(memo.date, memo.id) : undefined}
        title={showDate && onNavigate ? '클릭하면 해당 날짜로 이동합니다' : undefined}
      >
        {memo.content}
      </div>

      {editing && (
        <>
          <div className="wd-card-edit-wrap">
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
                  resetEditDraft()
                  setEditing(false)
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  saveEdit()
                }
              }}
            />
          </div>
          <div className="wd-sticker-bar wd-card-sticker-edit">
            <span className="wd-sticker-bar-label">스티커</span>
            {STICKER_OPTIONS.map((opt) => {
              const isActive = draftSticker === opt.value
              const meta = opt.value ? STICKER_META[opt.value] : null
              return (
                <button
                  key={opt.value ?? 'none'}
                  type="button"
                  className={`wd-sticker-btn ${isActive ? 'active' : ''}`}
                  style={
                    meta
                      ? isActive
                        ? { background: meta.color, borderColor: meta.color, color: '#fff' }
                        : { borderColor: `${meta.color}88`, color: meta.color }
                      : {}
                  }
                  onClick={() => setDraftSticker(isActive && opt.value !== null ? null : opt.value)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <details className="wd-card-edit-extra">
            <summary>연결태그</summary>
            <div className="wd-card-edit-extra-body">
              <LinkKeySearchBox
                currentValue={linkDraft}
                onSelect={setLinkDraft}
                disabled={linkSaving}
                onNavigate={onNavigate}
              />
              <div className="wd-link-bar">
                <span className="wd-link-bar-label">연결태그</span>
                <input
                  list={`wd-link-key-datalist-card-edit-${memo.id}`}
                  className="wd-link-input"
                  placeholder="예: 금승리67-6, 공장손님-김OO"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  disabled={linkSaving}
                />
                <datalist id={`wd-link-key-datalist-card-edit-${memo.id}`}>
                  {(allLinkKeys || []).map((k) => <option key={k} value={k} />)}
                </datalist>
                {linkDraft && (
                  <button
                    type="button"
                    className="wd-link-clear-btn"
                    onClick={() => setLinkDraft('')}
                    disabled={linkSaving}
                    aria-label="연결태그 초기화"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </details>
        </>
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

      {!editing && (
        <DiaryPhotoStrip photos={photos} onOpen={onOpenPhotos} />
      )}

      <div className="wd-card-actions">
        {!editing ? (
          <>
            {/* 포스트잇 추가/해제 */}
            <button
              type="button"
              className={`wd-action-btn wd-pin-btn ${isPinned ? 'pinned' : ''}`}
              onClick={() => isPinned ? onUnpin && onUnpin(memo.id) : onPin && onPin(memo.id)}
              title={isPinned ? '포스트잇 해제' : '달력 아래에 고정'}
            >
              {isPinned ? '📌 포스트잇 해제' : '📌 포스트잇 추가'}
            </button>
            {!memo.link_key && !linkEditing && (
              <button
                type="button"
                className="wd-action-btn wd-link-add-btn"
                onClick={() => setLinkEditing(true)}
              >
                🔗 연결태그 추가
              </button>
            )}
            <button
              type="button"
              className="wd-action-btn wd-photo-card-add-btn"
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
              className="wd-action-btn send-property"
              onClick={sendToPropertyRegister}
              aria-label="매물관리 프로그램으로 이동"
            >
              <span aria-hidden="true">🏠</span> 매물보내기
            </button>
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
                resetEditDraft()
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

      {!editing && photoAddOpen && (
        <div className="wd-card-photo-panel">
          <DiaryPhotoUploader
            files={photoFiles}
            onChange={setPhotoFiles}
            disabled={photoBusy}
            busy={photoBusy}
          />
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
    </article>
  )
}

/* ===== 연결태그 검색박스 ===== */
// variant: "topright" = textarea 오른쪽 상단 absolute | "inline" = flex 바 내 인라인
function LinkKeySearchBox({ currentValue, onSelect, disabled, variant = 'topright', onNavigate }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen]         = useState(false)
  const wrapRef  = useRef(null)
  const timerRef = useRef(null)

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const doSearch = useCallback(async (q) => {
    const trimmed = q.trim()
    if (!trimmed || !isSupabaseConfigured) { setResults([]); setOpen(false); return }
    setSearching(true)
    try {
      const normQ = trimmed.replace(/[\s_]+/g, '')
      const orParts = [
        `content.ilike.%${trimmed}%`,
        `link_key.ilike.%${trimmed}%`,
        `writer.ilike.%${trimmed}%`,
      ]
      if (normQ && normQ !== trimmed) {
        orParts.push(`content.ilike.%${normQ}%`, `link_key.ilike.%${normQ}%`)
      }

      const { data: diaryRows } = await supabase
        .from('work_diary')
        .select('id, content, link_key, writer, date, created_at')
        .or(orParts.join(','))
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      const rows = diaryRows || []
      setResults(rows)
      setOpen(rows.length > 0)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => doSearch(q), 280)
  }

  function appendTag(tag) {
    const trimTag = tag.trim()
    if (!trimTag) return
    const existing = currentValue
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (existing.includes(trimTag)) return // 중복 방지
    const next = existing.length ? existing.join(', ') + ', ' + trimTag : trimTag
    onSelect(next)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function handleResultClick(row) {
    setQuery('')
    setResults([])
    setOpen(false)
    // onNavigate가 있으면 해당 날짜로 이동 + 하이라이트
    if (onNavigate && row.date) {
      onNavigate(row.date, row.id)
    } else {
      // fallback: 기존 link_key 태그 추가 방식
      const tag = row.link_key
        ? row.link_key.trim()
        : (row.content || '').slice(0, 20).trim()
      appendTag(tag)
    }
  }

  function formatSnippet(content) {
    if (!content) return ''
    return content.length > 60 ? content.slice(0, 60) + '…' : content
  }

  function formatDate(dateStr, isoFallback) {
    const src = dateStr || isoFallback
    if (!src) return ''
    const d = new Date(src.includes('T') ? src : src + 'T00:00:00')
    if (isNaN(d)) return src
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className={`lks-wrap lks-wrap--${variant}`} ref={wrapRef}>
      <div className="lks-input-row">
        <span className="lks-icon">🔍</span>
        <input
          className="lks-input"
          placeholder="연결할 메모·매물·사람 검색"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          autoComplete="off"
        />
        {searching && <span className="lks-spinner">…</span>}
        {query && !searching && (
          <button
            type="button"
            className="lks-clear"
            onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
          >✕</button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="lks-dropdown" role="listbox">
          {results.map((row) => (
            <li
              key={row.id}
              className="lks-item"
              role="option"
              onMouseDown={(e) => { e.preventDefault(); handleResultClick(row) }}
            >
              <div className="lks-item-top">
                {row.link_key && (
                  <span className="lks-item-tag">🔗 {row.link_key}</span>
                )}
                <span className="lks-item-meta">
                  {row.writer || '?'} · {formatDate(row.date, row.created_at)}
                </span>
              </div>
              <div className="lks-item-content">{formatSnippet(row.content)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── 작성 중인 메모 임시저장 (탭 전환/새로고침에도 유지) ── */
const COMPOSER_DRAFT_KEY = 'wd_composer_draft'

function loadComposerDraft() {
  try {
    const raw = sessionStorage.getItem(COMPOSER_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function saveComposerDraft(draft) {
  try {
    sessionStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // 저장 실패해도 작성은 계속 가능해야 하므로 무시
  }
}

function clearComposerDraft() {
  try {
    sessionStorage.removeItem(COMPOSER_DRAFT_KEY)
  } catch {
    // 무시
  }
}

/* ===== 입력창 (Composer) ===== */
function Composer({ onSubmit, disabled, allLinkKeys, onNavigate }) {
  const initialDraft = useMemo(() => loadComposerDraft(), [])
  const [value, setValue] = useState(initialDraft?.value ?? '')
  const [writer, setWriter] = useState(initialDraft?.writer ?? '주현희')
  const [sticker, setSticker] = useState(initialDraft?.sticker ?? null)
  const [linkKey, setLinkKey] = useState(initialDraft?.linkKey ?? '')
  const [name, setName] = useState(initialDraft?.name ?? '')
  const [phone, setPhone] = useState(initialDraft?.phone ?? '')
  const [title, setTitle] = useState(initialDraft?.title ?? '')
  const [photoFiles, setPhotoFiles] = useState([])
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const composerRef = useRef(null)

  // 입력값을 sessionStorage에 계속 동기화 — 완전히 빈 상태면 임시저장을 지운다
  useEffect(() => {
    const isEmpty = !value.trim() && !linkKey.trim() && !sticker && !name.trim() && !phone.trim() && !title.trim()
    if (isEmpty) {
      clearComposerDraft()
    } else {
      saveComposerDraft({ value, writer, sticker, linkKey, name, phone, title })
    }
  }, [value, writer, sticker, linkKey, name, phone, title])

  // 최초 마운트 시 저장된 값 기준으로 textarea 높이 복원
  useEffect(() => {
    autoResizeComposer(composerRef.current)
  }, [])

  function autoResizeComposer(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(120, el.scrollHeight)}px`
  }

  async function handleSubmit() {
    const trimmed = value.trim()
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const trimmedTitle = title.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await onSubmit(trimmed, writer, sticker, linkKey.trim(), photoFiles, trimmedName, trimmedPhone, trimmedTitle)
      setValue('')
      setSticker(null)
      setLinkKey('')
      setPhotoFiles([])
      setName('')
      setPhone('')
      setTitle('')
      if (composerRef.current) composerRef.current.style.height = '120px'
    } catch (err) {
      setSubmitError(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const previewTags = extractTags(value)

  return (
    <div className="wd-composer">
      <div className="wd-composer-input-wrap">
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
      </div>

      {/* 스티커 선택 */}
      <div className="wd-sticker-bar">
        <span className="wd-sticker-bar-label">스티커</span>
        {STICKER_OPTIONS.map((opt) => {
          const isActive = sticker === opt.value
          const meta = opt.value ? STICKER_META[opt.value] : null
          return (
            <button
              key={opt.value ?? 'none'}
              type="button"
              className={`wd-sticker-btn ${isActive ? 'active' : ''}`}
              style={
                meta
                  ? isActive
                    ? { background: meta.color, borderColor: meta.color, color: '#fff' }
                    : { borderColor: meta.color + '88', color: meta.color }
                  : {}
              }
              onClick={() => setSticker(isActive && opt.value !== null ? null : opt.value)}
              disabled={disabled || submitting}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <details className="wd-composer-extra">
        <summary>세부정보 · 연결태그 · 사진</summary>
        <div className="wd-composer-extra-body">
          <div className="wd-composer-customer-row">
            <input
              className="wd-composer-customer-input"
              placeholder="제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={disabled || submitting}
            />
            <input
              className="wd-composer-customer-input"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={disabled || submitting}
            />
            <input
              className="wd-composer-customer-input"
              placeholder="연락처"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={disabled || submitting}
            />
          </div>
          <div className="wd-composer-tools-row">
            <LinkKeySearchBox
              currentValue={linkKey}
              onSelect={setLinkKey}
              disabled={disabled || submitting}
              onNavigate={onNavigate}
            />
          </div>
          <div className="wd-link-bar">
            <span className="wd-link-bar-label">연결태그</span>
            <input
              list="wd-link-key-datalist"
              className="wd-link-input"
              placeholder="예: 금승리67-6, 공장손님-김OO"
              value={linkKey}
              onChange={(e) => setLinkKey(e.target.value)}
              disabled={disabled || submitting}
            />
            <datalist id="wd-link-key-datalist">
              {(allLinkKeys || []).map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            {linkKey && (
              <button
                type="button"
                className="wd-link-clear-btn"
                onClick={() => setLinkKey('')}
                disabled={disabled || submitting}
                aria-label="연결태그 초기화"
              >
                ✕
              </button>
            )}
          </div>
          <div className="wd-link-hint">같은 손님·매물·계약 건을 묶는 이름입니다.</div>
          <DiaryPhotoUploader
            files={photoFiles}
            onChange={setPhotoFiles}
            disabled={disabled}
            busy={submitting}
          />
        </div>
      </details>

      {submitError && <div className="wd-photo-error" role="alert">{submitError}</div>}

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
  searchQuery,
  onCreate,
  onAddPhotos,
  onChangeStatus,
  onDelete,
  onUpdateContent,
  onUpdateLinkKey,
  composerDisabled,
  allLinkKeys,
  onLinkKeyClick,
  pinnedDiaryIds,
  onPin,
  onUnpin,
  onNavigate,
  highlightMemoId,
  photoMap,
}) {
  const [gallery, setGallery] = useState(null)
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
          <div className="wd-search-result-title">
            <span className="wd-search-result-label">검색 결과</span>
            {searchQuery && (
              <span className="wd-search-result-keyword">"{searchQuery.trim()}"</span>
            )}
            <span className="wd-search-result-count-wrap">
              총 <strong>{memos.length}</strong>건
              {memos.length >= 100 && (
                <span className="wd-search-result-cap"> (상위 100건 표시)</span>
              )}
            </span>
          </div>
          <span className="wd-search-result-hint">
            검색어를 지우거나 ✕를 누르면 날짜별 일지로 돌아갑니다
          </span>
        </div>
      )}

      {!searchMode && (
        <Composer
          onSubmit={(content, writer, sticker, linkKey, photoFiles, name, phone, title) =>
            onCreate(content, writer, sticker, linkKey, photoFiles, name, phone, title)}
          disabled={composerDisabled}
          allLinkKeys={allLinkKeys}
          onNavigate={onNavigate}
        />
      )}

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
              photos={photoMap?.[m.id] || []}
              onOpenPhotos={(photos, index) => setGallery({ photos, index })}
              onAddPhotos={onAddPhotos}
              showDate={searchMode}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
              onUpdateContent={onUpdateContent}
              onLinkKeyClick={onLinkKeyClick}
              onUpdateLinkKey={onUpdateLinkKey}
              allLinkKeys={allLinkKeys}
              isPinned={pinnedDiaryIds?.has(m.id) ?? false}
              onPin={onPin}
              onUnpin={onUnpin}
              isHighlighted={m.id === highlightMemoId}
              onNavigate={searchMode ? onNavigate : undefined}
            />
          ))
        )}
      </div>

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
