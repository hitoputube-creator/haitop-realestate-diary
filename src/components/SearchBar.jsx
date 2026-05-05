import { useEffect, useState } from 'react'

export default function SearchBar({ value, onChange, onSubmit }) {
  const [local, setLocal] = useState(value || '')

  useEffect(() => {
    setLocal(value || '')
  }, [value])

  // 디바운스 검색
  useEffect(() => {
    const handle = setTimeout(() => {
      if (local !== value) onChange(local)
    }, 250)
    return () => clearTimeout(handle)
  }, [local, value, onChange])

  return (
    <form
      className="wd-searchbar"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(local)
      }}
      role="search"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder="메모 내용 또는 #태그로 검색..."
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        aria-label="메모 검색"
      />
      {local && (
        <button
          type="button"
          className="wd-searchbar-clear"
          onClick={() => {
            setLocal('')
            onChange('')
          }}
          aria-label="검색어 지우기"
        >
          지우기
        </button>
      )}
    </form>
  )
}
