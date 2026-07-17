import { useEffect, useState } from 'react'
import WorkDiary from './components/WorkDiary'
import PrivateNotes from './components/PrivateNotes'
import CustomerManager from './components/CustomerManager'
import './App.css'

/* 현재 보고 있던 화면(업무일지 / 개인일지)을 기억해 두어
   탭 전환 후 새로고침되어도 작성 중이던 화면으로 그대로 돌아오게 한다 */
const NAV_KEY = 'app_nav_state'

function loadNav() {
  try {
    const raw = sessionStorage.getItem(NAV_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function App() {
  const initialNav = loadNav()
  const [page, setPage] = useState(initialNav?.page || 'diary')
  const [diaryOwner, setDiaryOwner] = useState(initialNav?.diaryOwner || '주현희')
  const [focusedCustomerId, setFocusedCustomerId] = useState(initialNav?.focusedCustomerId || null)
  const [diaryCustomerFilter, setDiaryCustomerFilter] = useState(initialNav?.diaryCustomerFilter || null)

  useEffect(() => {
    try {
      sessionStorage.setItem(NAV_KEY, JSON.stringify({ page, diaryOwner, focusedCustomerId, diaryCustomerFilter }))
    } catch {
      // 무시 — 실패해도 화면 전환 자체는 계속 동작해야 함
    }
  }, [page, diaryOwner, focusedCustomerId, diaryCustomerFilter])

  function openDiary(owner) {
    setDiaryOwner(owner)
    setPage('private-notes')
  }

  function openCustomer(customerId) {
    setFocusedCustomerId(customerId || null)
    setPage('customers')
  }

  function openDiaryForCustomer(customer, date = null) {
    setDiaryCustomerFilter(customer ? {
      id: customer.id,
      name: customer.name,
      customer_code: customer.customer_code,
      date,
    } : null)
    setPage('diary')
  }

  const nav = (
    <nav className="app-nav" aria-label="주요 화면 이동">
      <button
        type="button"
        className={`app-nav-button ${page === 'diary' ? 'active' : ''}`}
        onClick={() => setPage('diary')}
      >
        업무일지
      </button>
      <button
        type="button"
        className={`app-nav-button ${page === 'customers' ? 'active' : ''}`}
        onClick={() => setPage('customers')}
      >
        고객관리
      </button>
      <button
        type="button"
        className={`app-nav-button ${page === 'private-notes' && diaryOwner === '주현희' ? 'active' : ''}`}
        onClick={() => openDiary('주현희')}
      >
        주현희 개인일지
      </button>
      <button
        type="button"
        className={`app-nav-button ${page === 'private-notes' && diaryOwner === '김정현' ? 'active' : ''}`}
        onClick={() => openDiary('김정현')}
      >
        김정현 개인일지
      </button>
    </nav>
  )

  if (page === 'private-notes') {
    return (
      <>
        {nav}
        <PrivateNotes initialOwner={diaryOwner} onBack={() => setPage('diary')} />
      </>
    )
  }

  if (page === 'customers') {
    return (
      <>
        {nav}
        <CustomerManager
          initialCustomerId={focusedCustomerId}
          onOpenDiaryForCustomer={openDiaryForCustomer}
        />
      </>
    )
  }

  return (
    <>
      {nav}
      <WorkDiary
        onOpenDiary={openDiary}
        onOpenCustomer={openCustomer}
        customerFilter={diaryCustomerFilter}
        onClearCustomerFilter={() => setDiaryCustomerFilter(null)}
      />
    </>
  )
}

export default App
