import { useEffect, useState } from 'react'
import WorkDiary from './components/WorkDiary'
import PrivateNotes from './components/PrivateNotes'
import StorageAdmin from './components/StorageAdmin'
import { readLocalJSON, writeLocalJSON } from './lib/uiState'

/* 현재 보고 있던 화면(업무일지 / 개인일지)을 기억해 두어
   다른 탭·사이트를 보고 돌아오거나 새로고침돼도 보던 화면 그대로 돌아오게 한다.
   sessionStorage가 아닌 localStorage를 쓰는 이유는 모바일 브라우저가 다른 탭/앱
   전환 후 메모리 확보를 위해 탭을 통째로 다시 로드하는 경우에도 남아있어야 하기 때문. */
const NAV_KEY = 'app_nav_state'

function loadNav() {
  return readLocalJSON(NAV_KEY)
}

function App() {
  const initialNav = loadNav()
  const [page, setPage] = useState(initialNav?.page || 'diary')
  const [diaryOwner, setDiaryOwner] = useState(initialNav?.diaryOwner || '주현희')

  useEffect(() => {
    writeLocalJSON(NAV_KEY, { page, diaryOwner })
  }, [page, diaryOwner])

  // 다른 탭/사이트를 보고 돌아왔을 때(pageshow)도 저장된 화면으로 다시 맞춘다
  useEffect(() => {
    function handlePageShow() {
      const saved = loadNav()
      if (!saved) return
      if (saved.page) setPage((prev) => (prev === saved.page ? prev : saved.page))
      if (saved.diaryOwner) setDiaryOwner((prev) => (prev === saved.diaryOwner ? prev : saved.diaryOwner))
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

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
