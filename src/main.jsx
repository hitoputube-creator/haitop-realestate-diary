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

const rootElement = document.getElementById('root')
if (rootElement) {
  const collapseButtonObserver = new MutationObserver(addBottomCollapseButtons)
  collapseButtonObserver.observe(rootElement, { childList: true, subtree: true })
  queueMicrotask(addBottomCollapseButtons)
}
