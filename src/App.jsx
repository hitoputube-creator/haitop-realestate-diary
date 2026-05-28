import { useEffect, useState } from 'react'
import WorkDiary from './components/WorkDiary'
import PropertyForm from './components/PropertyForm'

function getPage() {
  return window.location.hash === '#/property-register' ? 'property' : 'diary'
}

function App() {
  const [page, setPage] = useState(getPage)

  useEffect(() => {
    function onHash() {
      setPage(getPage())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (page === 'property') {
    return (
      <PropertyForm
        onBack={() => {
          window.location.hash = ''
        }}
      />
    )
  }

  return <WorkDiary />
}

export default App
