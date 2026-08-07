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
const SCHEDULE_STICKERS = new Set(['계약', '잔금', '약속'])

function getSelectedDiaryDateKey() {
  const text = document.querySelector('.wd-diary-date')?.textContent || ''
  const match = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (!match) return ''
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
}

function addDaysToDateKey(dateKey, days) {
  if (!dateKey) return ''
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getStickerButton(composer, label) {
  return Array.from(composer?.querySelectorAll('.wd-field-row--stickers .wd-sticker-btn') || [])
    .find((button) => button.textContent.trim() === label)
}

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
      const targetButton = getStickerButton(composer, context.type)
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

function handleStickerSelection(event) {
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

function handleStickerScheduleSaveCapture(event) {
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
  const noneButton = getStickerButton(composer, '없음')
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

function refreshDiaryEnhancements() {
  addBottomCollapseButtons()
  ensureStickerScheduleDateInput()
}

document.addEventListener('click', handleStickerScheduleSaveCapture, true)
document.addEventListener('click', handleStickerSelection)

const rootElement = document.getElementById('root')
if (rootElement) {
  const diaryEnhancementObserver = new MutationObserver(refreshDiaryEnhancements)
  diaryEnhancementObserver.observe(rootElement, { childList: true, subtree: true, attributes: true })
  queueMicrotask(refreshDiaryEnhancements)
}
