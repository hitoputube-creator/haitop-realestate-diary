import { useEffect, useRef, useState } from 'react'

export default function SearchBar({ value, onChange, loading }) {
  const [local, setLocal] = useState(value || '')
  const timerRef = useRef(null)

  useEffect(() => {
    setLocal(value || '')
  }, [value])

  function commit(q) {
    clearTimeout(timerRef.current)
    onChange(q)
  }

  function handleChange(e) {
    const q = e.target.value
    setLocal(q)
    clearTimeout(timerRef.current)
    if (!q.trim()) {
      // 즉시 검색 해제
      onChange('')
      return
    }
    // 500ms 디바운스 (명시적 Enter/버튼과 공존)
    timerRef.current = setTimeout(() => onChange(q), 500)
  }

  function handleSubmit(e) {
    e.preventDefault()
    commit(local)
  }

  function handleClear() {
    setLocal('')
    onChange('')
  }

  return (
    <form className="wd-searchbar" onSubmit={handleSubmit} role="search">
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
        onChange={handleChange}
        aria-label="메모 검색"
        autoComplete="off"
      />
      {loading && local && (
        <span className="wd-searchbar-loading" aria-label="검색 중">…</span>
      )}
      {local && !loading && (
        <button
          type="button"
          className="wd-searchbar-clear"
          onClick={handleClear}
          aria-label="검색어 지우기"
        >
          ✕
        </button>
      )}
      <button type="submit" className="wd-searchbar-btn" aria-label="검색 실행">
        검색
      </button>
    </form>
  )
}
