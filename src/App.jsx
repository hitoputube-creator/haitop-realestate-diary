import { useState } from 'react'
import WorkDiary from './components/WorkDiary'
import PrivateNotes from './components/PrivateNotes'

function App() {
  const [page, setPage] = useState('diary')

  if (page === 'private-notes') {
    return <PrivateNotes onBack={() => setPage('diary')} />
  }

  return <WorkDiary onOpenPrivateNotes={() => setPage('private-notes')} />
}

export default App
