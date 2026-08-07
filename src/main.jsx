import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)

// 긴 메모를 끝까지 읽은 뒤 바로 접을 수 있도록,
// 펼쳐진 간단 메모의 맨 아래에도 기존 "접기" 동작을 연결한다.
function addBottomCollapseButtons() {
  document.querySelectorAll('.wd-card--compact.is-expanded .wd-compact-expanded').forEach((expandedArea) => {
    if (expandedArea.querySelector(':scope > .wd-bottom-collapse-wrap')) return

    const wrap = document.createElement('div')
    wrap.className = 'wd-bottom-collapse-wrap'
    wrap.style.display = 'flex'
    wrap.style.justifyContent = 'flex-end'
    wrap.style.marginTop = '12px'
    wrap.style.paddingTop = '12px'
    wrap.style.borderTop = '1px solid var(--color-border, rgba(255,255,255,0.12))'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'wd-action-btn'
    button.textContent = '접기'
    button.setAttribute('aria-label', '메모 내용 접기')
    button.addEventListener('click', () => {
      const card = expandedArea.closest('.wd-card--compact')
      const topCollapseButton = card?.querySelector('.wd-compact-actions button[aria-expanded="true"]')
      topCollapseButton?.click()
    })

    wrap.appendChild(button)
    expandedArea.appendChild(wrap)
  })
}

const STICKER_SCHEDULE_CONTEXT_KEY = '__HITOP_DIARY_STICKER_SCHEDULE__'
const EDIT_SCHEDULE_CONTEXT_KEY = '__HITOP_DIARY_STICKER_EDIT_SCHEDULE__'
const SCHEDULE_STICKERS = new Set(['계약', '잔금', '약속'])
const STICKER_COLORS = {
  계약: '#C9A84C',
  잔금: '#E74C3C',
  약속: '#3498DB',
}

function getSelectedDiaryDateKey() {
  const text = document.querySelector('.wd-diary-date')?.textContent || ''
  const match = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (!match) return ''
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
}

function getCardDateKey(card) {
  const cardDateText = card?.querySelector('.wd-card-date')?.textContent || ''
  const cardMatch = cardDateText.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/)
  if (cardMatch) {
    return `${cardMatch[1]}-${String(cardMatch[2]).padStart(2, '0')}-${String(cardMatch[3]).padStart(2, '0')}`
  }
  return getSelectedDiaryDateKey()
}

function addDaysToDateKey(dateKey, days) {
  if (!dateKey) return ''
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getStickerButton(container, label) {
  return Array.from(container?.querySelectorAll('.wd-sticker-btn') || [])
    .find((button) => button.textContent.trim() === label)
}

function getActiveScheduleSticker(container) {
  const active = Array.from(container?.querySelectorAll('.wd-sticker-btn.active, .wd-sticker-btn.is-active') || [])
    .find((button) => SCHEDULE_STICKERS.has(button.textContent.trim()))
  return active?.textContent.trim() || null
}

/* ===== 새 메모 작성: 스티커 일정일 ===== */
function ensureStickerScheduleDateInput() {
  const composer = document.querySelector('.wd-composer')
  const context = window[STICKER_SCHEDULE_CONTEXT_KEY]

  if (!composer) {
    if (context && !context.pending) window[STICKER_SCHEDULE_CONTEXT_KEY] = null
    return
  }

  if (context?.type && !context.pending && context.restoreSticker) {
    const activeButton = composer.querySelector('.wd-field-row--stickers .wd-sticker-btn.is-active, .wd-field-row--stickers .wd-sticker-btn.active')
    if (!activeButton || activeButton.textContent.trim() === '없음') {
      const targetButton = getStickerButton(composer.querySelector('.wd-field-row--stickers'), context.type)
      if (targetButton && !targetButton.disabled) {
        window[STICKER_SCHEDULE_CONTEXT_KEY] = { ...context, restoreSticker: false }
        targetButton.click()
      }
    }
  }

  const current = window[STICKER_SCHEDULE_CONTEXT_KEY]
  let row = composer.querySelector('.wd-sticker-schedule-date-row')
  if (!current?.type) {
    row?.remove()
    return
  }

  const stickerRow = composer.querySelector('.wd-field-row--stickers')
  if (!stickerRow) return

  if (!row) {
    row = document.createElement('div')
    row.className = 'wd-field-row wd-sticker-schedule-date-row'

    const label = document.createElement('label')
    label.htmlFor = 'wd-sticker-schedule-date'
    label.textContent = '일정일'

    const input = document.createElement('input')
    input.id = 'wd-sticker-schedule-date'
    input.type = 'date'
    input.required = true
    input.className = 'wd-composer-customer-input'
    input.setAttribute('aria-label', '스티커 일정 날짜')
    input.title = '선택한 날짜의 메모에 계약·잔금·약속 스티커 일정이 표시됩니다.'
    input.addEventListener('input', (event) => {
      const state = window[STICKER_SCHEDULE_CONTEXT_KEY]
      if (!state) return
      window[STICKER_SCHEDULE_CONTEXT_KEY] = { ...state, date: event.target.value }
    })

    row.append(label, input)
    stickerRow.insertAdjacentElement('afterend', row)
  }

  const input = row.querySelector('input[type="date"]')
  const state = window[STICKER_SCHEDULE_CONTEXT_KEY]
  if (input && input.value !== (state?.date || '')) input.value = state?.date || ''
}

function handleComposerStickerSelection(event) {
  const button = event.target.closest?.('.wd-composer .wd-field-row--stickers .wd-sticker-btn')
  if (!button) return

  const label = button.textContent.trim()
  const previous = window[STICKER_SCHEDULE_CONTEXT_KEY]

  if (SCHEDULE_STICKERS.has(label)) {
    const sourceDate = getSelectedDiaryDateKey()
    window[STICKER_SCHEDULE_CONTEXT_KEY] = {
      type: label,
      date: previous?.date || addDaysToDateKey(sourceDate, 1),
      sourceDate: null,
      pending: false,
      token: null,
      suppressNoneClear: false,
      restoreSticker: false,
    }
  } else if (label === '없음' && !previous?.pending && !previous?.suppressNoneClear) {
    window[STICKER_SCHEDULE_CONTEXT_KEY] = null
  }

  queueMicrotask(ensureStickerScheduleDateInput)
}

function handleComposerScheduleSaveCapture(event) {
  const saveButton = event.target.closest?.('.wd-composer .wd-btn-primary')
  if (!saveButton) return

  if (saveButton.dataset.hitopScheduleReplay === '1') {
    delete saveButton.dataset.hitopScheduleReplay
    return
  }

  const context = window[STICKER_SCHEDULE_CONTEXT_KEY]
  if (!context?.type) return

  if (context.pending) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  const dateInput = document.querySelector('#wd-sticker-schedule-date')
  if (!context.date) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    dateInput?.focus()
    dateInput?.reportValidity?.()
    return
  }

  const sourceDate = getSelectedDiaryDateKey()
  if (!sourceDate || context.date === sourceDate) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const composer = saveButton.closest('.wd-composer')
  const noneButton = getStickerButton(composer.querySelector('.wd-field-row--stickers'), '없음')
  if (!noneButton) return

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  window[STICKER_SCHEDULE_CONTEXT_KEY] = {
    ...context,
    sourceDate,
    pending: true,
    token,
    suppressNoneClear: true,
    restoreSticker: true,
  }

  noneButton.click()
  const pendingContext = window[STICKER_SCHEDULE_CONTEXT_KEY]
  if (pendingContext?.token === token) {
    window[STICKER_SCHEDULE_CONTEXT_KEY] = { ...pendingContext, suppressNoneClear: false }
  }

  window.setTimeout(() => {
    if (!document.body.contains(saveButton)) return
    saveButton.dataset.hitopScheduleReplay = '1'
    saveButton.click()
  }, 0)
}

/* ===== 기존 메모 수정: 스티커 일정일 ===== */
function syncEditingStickerBadge(card) {
  if (!card) return
  const editing = card.classList.contains('editing')
  const generatedBadge = card.querySelector('[data-hitop-draft-sticker-badge="1"]')

  if (!editing) {
    generatedBadge?.remove()
    const reactBadge = card.querySelector('.wd-compact-card-top .wd-sticker-badge, .wd-card-top .wd-sticker-badge')
    if (reactBadge) reactBadge.style.removeProperty('display')
    return
  }

  const stickerBar = card.querySelector('.wd-card-sticker-edit')
  const activeSticker = getActiveScheduleSticker(stickerBar)
  let badge = card.querySelector('.wd-compact-card-top .wd-sticker-badge, .wd-card-top .wd-sticker-badge')

  if (!activeSticker) {
    if (badge) badge.style.display = 'none'
    generatedBadge?.remove()
    return
  }

  if (!badge) {
    const target = card.querySelector('.wd-compact-badges') || card.querySelector('.wd-card-top > div:last-child')
    if (target) {
      badge = document.createElement('span')
      badge.className = 'wd-sticker-badge'
      badge.dataset.hitopDraftStickerBadge = '1'
      target.prepend(badge)
    }
  }

  if (badge) {
    badge.style.display = ''
    badge.style.background = STICKER_COLORS[activeSticker] || ''
    badge.textContent = activeSticker
  }
}

function ensureEditScheduleDateInputs() {
  document.querySelectorAll('.wd-card.editing').forEach((card) => {
    const stickerBar = card.querySelector('.wd-card-sticker-edit')
    if (!stickerBar) return

    syncEditingStickerBadge(card)
    const activeSticker = getActiveScheduleSticker(stickerBar)
    let row = card.querySelector('.wd-edit-schedule-date-row')

    if (!activeSticker) {
      row?.remove()
      delete card.dataset.hitopScheduleDate
      return
    }

    const sourceDate = getCardDateKey(card)
    if (!card.dataset.hitopScheduleDate) {
      // 기존 스티커를 수정할 때는 현재 날짜를 기본값으로 유지한다.
      // 새 스티커로 미래 일정을 잡고 싶으면 날짜만 바꾸면 된다.
      card.dataset.hitopScheduleDate = sourceDate
    }

    if (!row) {
      row = document.createElement('div')
      row.className = 'wd-edit-schedule-date-row'
      row.style.display = 'grid'
      row.style.gridTemplateColumns = '72px minmax(0, 1fr)'
      row.style.alignItems = 'center'
      row.style.gap = '8px'
      row.style.margin = '8px 0 10px'

      const label = document.createElement('label')
      label.textContent = '일정일'
      label.style.fontWeight = '700'

      const input = document.createElement('input')
      input.type = 'date'
      input.required = true
      input.className = 'wd-composer-customer-input'
      input.setAttribute('aria-label', `${activeSticker} 일정 날짜`)
      input.addEventListener('input', (inputEvent) => {
        card.dataset.hitopScheduleDate = inputEvent.target.value
      })

      row.append(label, input)
      stickerBar.insertAdjacentElement('afterend', row)
    }

    const input = row.querySelector('input[type="date"]')
    if (input) {
      input.setAttribute('aria-label', `${activeSticker} 일정 날짜`)
      if (input.value !== card.dataset.hitopScheduleDate) input.value = card.dataset.hitopScheduleDate || sourceDate
    }
  })

  document.querySelectorAll('.wd-card:not(.editing)').forEach((card) => {
    card.querySelector('.wd-edit-schedule-date-row')?.remove()
    card.querySelector('[data-hitop-draft-sticker-badge="1"]')?.remove()
    const badge = card.querySelector('.wd-compact-card-top .wd-sticker-badge, .wd-card-top .wd-sticker-badge')
    if (badge) badge.style.removeProperty('display')
    delete card.dataset.hitopScheduleDate
  })
}

function handleEditStickerSelection(event) {
  const button = event.target.closest?.('.wd-card.editing .wd-card-sticker-edit .wd-sticker-btn')
  if (!button) return
  window.setTimeout(ensureEditScheduleDateInputs, 0)
}

function handleEditScheduleSaveCapture(event) {
  const saveButton = event.target.closest?.('.wd-card.editing button')
  if (!saveButton || saveButton.textContent.trim() !== '저장') return

  const card = saveButton.closest('.wd-card.editing')
  if (!card) return

  const stickerBar = card.querySelector('.wd-card-sticker-edit')
  const activeSticker = getActiveScheduleSticker(stickerBar)
  if (!activeSticker) {
    window[EDIT_SCHEDULE_CONTEXT_KEY] = null
    return
  }

  const input = card.querySelector('.wd-edit-schedule-date-row input[type="date"]')
  const scheduleDate = input?.value || card.dataset.hitopScheduleDate || ''
  if (!scheduleDate) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    input?.focus()
    input?.reportValidity?.()
    return
  }

  const sourceDate = getCardDateKey(card)
  if (!sourceDate || scheduleDate === sourceDate) {
    window[EDIT_SCHEDULE_CONTEXT_KEY] = null
    return
  }

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  window[EDIT_SCHEDULE_CONTEXT_KEY] = {
    type: activeSticker,
    date: scheduleDate,
    sourceDate,
    pending: true,
    token,
  }
  card.dataset.hitopStickerMoved = '1'
}

function refreshDiaryEnhancements() {
  addBottomCollapseButtons()
  ensureStickerScheduleDateInput()
  ensureEditScheduleDateInputs()
}

document.addEventListener('click', handleComposerScheduleSaveCapture, true)
document.addEventListener('click', handleEditScheduleSaveCapture, true)
document.addEventListener('click', handleComposerStickerSelection)
document.addEventListener('click', handleEditStickerSelection)

window.addEventListener('hitop:diary-schedule-saved', (event) => {
  if (event.detail?.mode !== 'edit') return
  // 미래 일정으로 이동한 경우 원본 메모는 스티커가 없어져야 하므로
  // 현재 선택 날짜를 다시 불러와 React의 로컬 상태도 DB와 동기화한다.
  window.setTimeout(() => {
    document.querySelector('.wd-cal-day.selected')?.click()
  }, 120)
})

const rootElement = document.getElementById('root')
if (rootElement) {
  const diaryEnhancementObserver = new MutationObserver(refreshDiaryEnhancements)
  diaryEnhancementObserver.observe(rootElement, { childList: true, subtree: true, attributes: true })
  queueMicrotask(refreshDiaryEnhancements)
}
