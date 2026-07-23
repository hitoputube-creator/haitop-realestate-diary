import { useEffect, useState } from 'react'
import WorkDiary from './components/WorkDiary'
import PrivateNotes from './components/PrivateNotes'
import StorageAdmin from './components/StorageAdmin'

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

  useEffect(() => {
    try {
      sessionStorage.setItem(NAV_KEY, JSON.stringify({ page, diaryOwner }))
    } catch {
      // 무시 — 실패해도 화면 전환 자체는 계속 동작해야 함
    }
  }, [page, diaryOwner])

  function openDiary(owner) {
    setDiaryOwner(owner)
    setPage('private-notes')
  }

  if (page === 'private-notes') {
    return <PrivateNotes initialOwner={diaryOwner} onBack={() => setPage('diary')} />
  }

  if (page === 'storage-admin') {
    return <StorageAdmin onBack={() => setPage('diary')} />
  }

  return <WorkDiary onOpenDiary={openDiary} onOpenStorageAdmin={() => setPage('storage-admin')} />
}

export default App
