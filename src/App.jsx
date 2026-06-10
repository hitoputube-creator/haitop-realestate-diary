import { useState } from 'react'
import WorkDiary from './components/WorkDiary'
import PrivateNotes from './components/PrivateNotes'

function App() {
  const [page, setPage] = useState('diary')
  const [diaryOwner, setDiaryOwner] = useState('주현희')

  function openDiary(owner) {
    setDiaryOwner(owner)
    setPage('private-notes')
  }

  if (page === 'private-notes') {
    return <PrivateNotes initialOwner={diaryOwner} onBack={() => setPage('diary')} />
  }

  return <WorkDiary onOpenDiary={openDiary} />
}

export default App
