import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import Calendar, { toDateKey } from './Calendar'
import DiaryList, { extractTags, STICKER_META as STICKER_META_REF } from './DiaryList'
import SearchBar from './SearchBar'
import UpcomingSchedules from './UpcomingSchedules'
import SelectedScheduleMemos from './SelectedScheduleMemos'
import { DiaryPhotoStrip, PhotoGalleryModal } from './DiaryPhotos'
import { listDiaryPhotosForIds, uploadDiaryPhotos, listDiaryFilesForIds, uploadDiaryFiles } from '../lib/attachments'
import { resolveOrCreateCustomer } from '../lib/customers'
import { buildCustomerMemoPayload } from '../lib/workDiaryPayload'
import AddCustomerMemoModal from './AddCustomerMemoModal'
import CustomerTimelineModal from './CustomerTimelineModal'
import WeeklyDiary from './WeeklyDiary'
import MonthlyDiary from './MonthlyDiary'
import { readLocalJSON, patchLocalJSON } from '../lib/uiState'
import './WorkDiary.css'

const TABLE = 'work_diary'
const DAILY_SCHEDULE_KEY = '__daily_schedule__'
const FULL_WEEKDAYS = ['\uC77C\uC694\uC77C', '\uC6D4\uC694\uC77C', '\uD654\uC694\uC77C', '\uC218\uC694\uC77C', '\uBAA9\uC694\uC77C', '\uAE08\uC694\uC77C', '\uD1A0\uC694\uC77C']
const UI_STATE_KEY = 'wd_ui_state_v1'

function parseDateKey(dateKey) {
  if (!dateKey) return null
  const d = new Date(dateKey + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export default function WorkDiary({ onOpenDiary, onOpenStorageAdmin }) {
  const today = useMemo(() => new Date(), [])
  // 다른 탭/사이트를 보고 돌아와도 보던 화면 그대로 복원되도록 마운트 시점에
  // localStorage에서 이전 상태를 한 번만 읽어온다.
  const initialUi = useMemo(() => readLocalJSON(UI_STATE_KEY) || {}, [])

  const [selectedDate, setSelectedDate] = useState(() => parseDateKey(initialUi.selectedDate) || today)
  const [viewYear, setViewYear] = useState(() => initialUi.viewYear ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => initialUi.viewMonth ?? today.getMonth())

  const [memos, setMemos] = useState([])
  const [dailyScheduleNotes, setDailyScheduleNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [error, setError] = useState(null)

  const [notedDateKeys, setNotedDateKeys] = useState({})

  const [searchQuery, setSearchQuery] = useState(() => initialUi.searchQuery ?? '')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [highlightMemoId, setHighlightMemoId] = useState(null)

  const searchMode = searchQuery.trim().length > 0
  const [filterWriter, setFilterWriter] = useState(() => initialUi.filterWriter ?? 'all')
  const [mainView, setMainView] = useState('today')
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [weekMemos, setWeekMemos] = useState([])
  const [weekLoading, setWeekLoading] = useState(false)

  /* ===== 연결고리 ===== */
  const [allLinkKeys, setAllLinkKeys] = useState([])
  const [linkKeyFilter, setLinkKeyFilter] = useState(null)
  const [linkMemos, setLinkMemos] = useState([])
  const [linkMemosLoading, setLinkMemosLoading] = useState(false)

  /* ===== 포스트잇 고정 상태 ===== */
  const [stickyData, setStickyData] = useState([])   // [{sticky, memo}]
  const [photoMap, setPhotoMap] = useState({})
  const [fileMap, setFileMap] = useState({})
  const [photoGallery, setPhotoGallery] = useState(null)
  const [upcomingRefreshKey, setUpcomingRefreshKey] = useState(0)

  /* ===== 고객별 메모 타임라인 ===== */
  const [addMemoTarget, setAddMemoTarget] = useState(null) // { customer: {id,name,phone}, defaultDate }
  const [timelineCustomerId, setTimelineCustomerId] = useState(null)
  const [timelineReloadKey, setTimelineReloadKey] = useState(0)

  // 현재 고정된 diary_id Set — MemoCard 버튼 상태 판단용
  const pinnedDiaryIds = useMemo(
    () => new Set(stickyData.map((d) => d.sticky.diary_id)),
    [stickyData]
  )

  /* ===== 화면 상태(날짜/필터/검색어) 저장 ===== */
  useEffect(() => {
    patchLocalJSON(UI_STATE_KEY, {
      selectedDate: toDateKey(selectedDate),
      viewYear,
      viewMonth,
      filterWriter,
      searchQuery,
    })
  }, [selectedDate, viewYear, viewMonth, filterWriter, searchQuery])

  /* ===== 스크롤 위치 저장/복원 =====
   * scroll 이벤트는 버블링되지 않으므로 capture 단계에서 document에 붙여
   * 페이지 전체 스크롤(window)과 메모 목록(.wd-list) 내부 스크롤을 함께 잡는다.
   * requestAnimationFrame은 탭이 백그라운드거나 화면이 그려지지 않는 상태에서는
   * 아예 실행되지 않을 수 있으므로, setTimeout 기반으로 저장 빈도만 가볍게 제한한다. */
  const scrollSaveTimerRef = useRef(null)
  useEffect(() => {
    function handleScroll(e) {
      if (scrollSaveTimerRef.current) return
      scrollSaveTimerRef.current = setTimeout(() => {
        scrollSaveTimerRef.current = null
        const target = e.target
        if (target === document) {
          patchLocalJSON(UI_STATE_KEY, { scrollY: window.scrollY })
        } else if (target?.classList?.contains?.('wd-list')) {
          patchLocalJSON(UI_STATE_KEY, { listScrollTop: target.scrollTop })
        }
      }, 150)
    }
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', handleScroll, true)
      clearTimeout(scrollSaveTimerRef.current)
    }
  }, [])

  const restoreScrollAndFilters = useCallback(() => {
    const saved = readLocalJSON(UI_STATE_KEY)
    if (!saved) return
    // bfcache 복원 등으로 pageshow가 발생했을 때도 저장된 값과 어긋나지 않도록 다시 맞춘다.
    // 값이 이미 같으면 이전 state를 그대로 반환해 불필요한 재렌더/재조회를 막는다.
    if (saved.selectedDate) {
      setSelectedDate((prev) => (toDateKey(prev) === saved.selectedDate ? prev : parseDateKey(saved.selectedDate) || prev))
    }
    if (typeof saved.viewYear === 'number') {
      setViewYear((prev) => (prev === saved.viewYear ? prev : saved.viewYear))
    }
    if (typeof saved.viewMonth === 'number') {
      setViewMonth((prev) => (prev === saved.viewMonth ? prev : saved.viewMonth))
    }
    if (saved.filterWriter) {
      setFilterWriter((prev) => (prev === saved.filterWriter ? prev : saved.filterWriter))
    }
    if (typeof saved.searchQuery === 'string') {
      setSearchQuery((prev) => (prev === saved.searchQuery ? prev : saved.searchQuery))
    }
    if (typeof saved.scrollY === 'number') window.scrollTo(0, saved.scrollY)
    if (typeof saved.listScrollTop === 'number') {
      const listEl = document.querySelector('.wd-list')
      if (listEl) listEl.scrollTop = saved.listScrollTop
    }
  }, [])

  const restoredOnceRef = useRef(false)
  useEffect(() => {
    // 마운트 직후 한 번, 그리고 목록 로딩이 끝나 실제 스크롤 높이가 자리잡은 뒤 한 번 더 복원한다.
    const t = setTimeout(restoreScrollAndFilters, 60)
    window.addEventListener('pageshow', restoreScrollAndFilters)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pageshow', restoreScrollAndFilters)
    }
  }, [restoreScrollAndFilters])

  useEffect(() => {
    if (loading || searchLoading || restoredOnceRef.current) return
    restoredOnceRef.current = true
    const t = setTimeout(restoreScrollAndFilters, 30)
    return () => clearTimeout(t)
  }, [loading, searchLoading, restoreScrollAndFilters])

  /* ===== 선택 날짜의 메모 로드 ===== */
  const loadPhotosForRows = useCallback(async (rows) => {
    const ids = (rows || []).map((row) => row.id).filter(Boolean)
    if (!isSupabaseConfigured || ids.length === 0) return
    try {
      const nextMap = await listDiaryPhotosForIds(ids)
      setPhotoMap((prev) => ({ ...prev, ...nextMap }))
    } catch (err) {
      console.warn('[DiaryPhotos] load failed:', err.message || err)
    }
  }, [])

  const handleAddPhotosToMemo = useCallback(async (memoId, photoFiles = [], uploadedBy = '') => {
    if (!memoId || photoFiles.length === 0) return []
    const uploadedPhotos = await uploadDiaryPhotos({
      files: photoFiles,
      workDiaryId: memoId,
      uploadedBy,
    })
    setPhotoMap((prev) => ({
      ...prev,
      [memoId]: [...(prev[memoId] || []), ...uploadedPhotos],
    }))
    return uploadedPhotos
  }, [])

  const loadFilesForRows = useCallback(async (rows) => {
    const ids = (rows || []).map((row) => row.id).filter(Boolean)
    if (!isSupabaseConfigured || ids.length === 0) return
    try {
      const nextMap = await listDiaryFilesForIds(ids)
      setFileMap((prev) => ({ ...prev, ...nextMap }))
    } catch (err) {
      console.warn('[DiaryFiles] load failed:', err.message || err)
    }
  }, [])

  const handleAddFilesToMemo = useCallback(async (memoId, files = [], uploadedBy = '') => {
    if (!memoId || files.length === 0) return []
    const uploadedFiles = await uploadDiaryFiles({
      files,
      workDiaryId: memoId,
      uploadedBy,
    })
    setFileMap((prev) => ({
      ...prev,
      [memoId]: [...(prev[memoId] || []), ...uploadedFiles],
    }))
    return uploadedFiles
  }, [])

  const loadMemosForSelected = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMemos([])
      setDailyScheduleNotes([])
      return
    }
    setLoading(true)
    setScheduleLoading(true)
    setError(null)
    setScheduleError('')
    try {
      const dateStr = toDateKey(selectedDate)
      const { data, error: e } = await supabase
        .from(TABLE)
        .select('*')
        .eq('date', dateStr)
        .order('created_at', { ascending: true })
      if (e) throw e
      const rows = data || []
      const scheduleRows = rows.filter((row) => row.link_key === DAILY_SCHEDULE_KEY)
      const diaryRows = rows.filter((row) => row.link_key !== DAILY_SCHEDULE_KEY)
      setMemos(diaryRows)
      setDailyScheduleNotes(scheduleRows)
      loadPhotosForRows(diaryRows)
      loadFilesForRows(diaryRows)
    } catch (err) {
      setError(`메모를 불러오지 못했습니다: ${err.message || err}`)
      setMemos([])
      setDailyScheduleNotes([])
    } finally {
      setLoading(false)
      setScheduleLoading(false)
    }
  }, [selectedDate, loadPhotosForRows, loadFilesForRows])

  useEffect(() => {
    loadMemosForSelected()
  }, [loadMemosForSelected])

  /* ===== 표시 중인 달의 메모 있는 날짜 마킹 ===== */
  const loadMonthDots = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setNotedDateKeys({})
      return
    }
    try {
      const start = new Date(viewYear, viewMonth, 1)
      const end = new Date(viewYear, viewMonth + 1, 0)
      const startStr = toDateKey(start)
      const endStr = toDateKey(end)
      const { data, error: e } = await supabase
        .from(TABLE)
        .select('date, writer, sticker, link_key')
        .gte('date', startStr)
        .lte('date', endStr)
      if (e) throw e

      // { [dateKey]: [{ writer, sticker }] }
      const dotsMap = {}
      if (data) {
        data.filter((r) => r.link_key !== DAILY_SCHEDULE_KEY).forEach((r) => {
          const dateKey = r.date
          if (!dotsMap[dateKey]) dotsMap[dateKey] = []
          dotsMap[dateKey].push({
            writer: r.writer || '주현희',
            sticker: r.sticker || null,
          })
        })
      }
      setNotedDateKeys(dotsMap)
    } catch (err) {
      // 도트는 실패해도 무시 (UI 차단 X)
      // eslint-disable-next-line no-console
      console.warn('[WorkDiary] month dots load failed:', err)
    }
  }, [viewYear, viewMonth])

  useEffect(() => {
    loadMonthDots()
  }, [loadMonthDots])

  const weekDays = useMemo(() => {
    const start = new Date(weekAnchor)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start)
      day.setDate(start.getDate() + index)
      return day
    })
  }, [weekAnchor])

  useEffect(() => {
    if (mainView !== 'week' || !isSupabaseConfigured) return undefined
    let cancelled = false
    setWeekLoading(true)
    ;(async () => {
      try {
        const { data, error: weekError } = await supabase
          .from(TABLE)
          .select('*')
          .gte('date', toDateKey(weekDays[0]))
          .lte('date', toDateKey(weekDays[6]))
          .order('date', { ascending: true })
          .order('created_at', { ascending: true })
        if (weekError) throw weekError
        if (!cancelled) {
          const rows = (data || []).filter((row) => row.link_key !== DAILY_SCHEDULE_KEY)
          setWeekMemos(rows)
          loadPhotosForRows(rows)
          loadFilesForRows(rows)
        }
      } catch (weekError) {
        if (!cancelled) setError(`\uC8FC\uAC04 \uBA54\uBAA8 \uC870\uD68C \uC2E4\uD328: ${weekError.message || weekError}`)
      } finally {
        if (!cancelled) setWeekLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [mainView, weekDays, upcomingRefreshKey, loadPhotosForRows, loadFilesForRows])

  /* ===== 사용 중인 연결고리 목록 로드 ===== */
  const loadAllLinkKeys = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      const { data, error: e } = await supabase
        .from(TABLE)
        .select('link_key')
        .neq('link_key', '')
      if (e) throw e
      const unique = Array.from(new Set((data || []).map((r) => r.link_key).filter(Boolean)))
        .filter((key) => key !== DAILY_SCHEDULE_KEY)
        .sort()
      setAllLinkKeys(unique)
    } catch {
      // 실패해도 무시
    }
  }, [])

  useEffect(() => {
    loadAllLinkKeys()
  }, [loadAllLinkKeys])

  /* ===== 연결 메모 조회 ===== */
  const loadLinkMemos = useCallback(async (key) => {
    if (!isSupabaseConfigured || !key) return
    setLinkMemosLoading(true)
    try {
      const { data, error: e } = await supabase
        .from(TABLE)
        .select('*')
        .eq('link_key', key)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (e) throw e
      const rows = data || []
      setLinkMemos(rows)
      loadPhotosForRows(rows)
      loadFilesForRows(rows)
    } catch (err) {
      setError(`연결 메모 조회 실패: ${err.message || err}`)
      setLinkMemos([])
    } finally {
      setLinkMemosLoading(false)
    }
  }, [loadPhotosForRows, loadFilesForRows])

  function handleLinkKeyClick(key) {
    setLinkKeyFilter(key)
    loadLinkMemos(key)
  }

  /* ===== 포스트잇 로드 ===== */
  const loadStickyNotes = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      const { data: stickies, error: e1 } = await supabase
        .from('work_sticky_notes')
        .select('*')
        .order('created_at', { ascending: false })
      if (e1) throw e1

      if (!stickies || stickies.length === 0) {
        setStickyData([])
        return
      }

      const ids = stickies.map((s) => s.diary_id)
      const { data: diaryMemos, error: e2 } = await supabase
        .from(TABLE)
        .select('*')
        .in('id', ids)
      if (e2) throw e2

      const memoMap = {}
      ;(diaryMemos || []).forEach((m) => { memoMap[m.id] = m })
      setStickyData(stickies.map((s) => ({ sticky: s, memo: memoMap[s.diary_id] || null })))
    } catch (err) {
      console.warn('[StickyNotes] load failed:', err.message || err)
    }
  }, [])

  useEffect(() => { loadStickyNotes() }, [loadStickyNotes])

  /* 포스트잇 추가 */
  const handlePin = useCallback(async (diaryId, color = 'yellow') => {
    if (!isSupabaseConfigured) return
    try {
      const { data, error: e } = await supabase
        .from('work_sticky_notes')
        .insert({ diary_id: diaryId, status: '진행중', color })
        .select()
        .single()
      if (e) throw e
      // 원본 메모 찾기 (현재 날짜 목록 또는 검색 결과)
      const memo = [...memos, ...searchResults].find((m) => m.id === diaryId) || null
      setStickyData((prev) => [{ sticky: data, memo }, ...prev])
    } catch (err) {
      setError(`포스트잇 추가 실패: ${err.message || err}`)
    }
  }, [memos, searchResults])

  /* 포스트잇 해제 (삭제) */
  const handleUnpin = useCallback(async (diaryId) => {
    if (!isSupabaseConfigured) return
    try {
      const { error: e } = await supabase
        .from('work_sticky_notes')
        .delete()
        .eq('diary_id', diaryId)
      if (e) throw e
      setStickyData((prev) => prev.filter((d) => d.sticky.diary_id !== diaryId))
    } catch (err) {
      setError(`포스트잇 해제 실패: ${err.message || err}`)
    }
  }, [])

  /* ===== 날짜 네비게이션 (LinkKeySearchBox 검색 결과 클릭 시) ===== */
  const handleNavigate = useCallback((dateStr, memoId) => {
    if (!dateStr) return
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d.getTime())) return
    setSearchQuery('')         // 메인 검색 초기화
    setMainView('today')
    handleSelectDate(d)        // 해당 날짜로 이동
    setHighlightMemoId(memoId || null)
    // 3초 후 하이라이트 해제
    if (memoId) setTimeout(() => setHighlightMemoId(null), 3000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ===== 검색 ===== */
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    if (!isSupabaseConfigured) {
      setSearchResults([])
      return
    }

    let cancelled = false
    setSearchLoading(true)
    ;(async () => {
      try {
        const isTagSearch = q.startsWith('#')
        const tagTerm = isTagSearch ? q.slice(1) : q
        // 공백·언더바를 제거한 정규화 쿼리 (헤이 부동산 → 헤이부동산)
        const normQ = q.replace(/[\s_]+/g, '')

        let orParts
        if (isTagSearch) {
          orParts = [`tags.cs.{${tagTerm}}`]
        } else {
          orParts = [
            `content.ilike.%${q}%`,
            `tags.cs.{${tagTerm}}`,
            `link_key.ilike.%${q}%`,
            `writer.ilike.%${q}%`,
          ]
          // 정규화 쿼리가 원본과 다를 때 추가 검색
          if (normQ && normQ !== q) {
            orParts.push(`content.ilike.%${normQ}%`, `link_key.ilike.%${normQ}%`)
          }
        }

        const { data, error: e } = await supabase
          .from(TABLE)
          .select('*')
          .or(orParts.join(','))
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(200)
        if (e) throw e
        if (!cancelled) {
          const rows = data || []
          const diaryRows = rows.filter((row) => row.link_key !== DAILY_SCHEDULE_KEY)
          setSearchResults(diaryRows)
          loadPhotosForRows(diaryRows)
          loadFilesForRows(diaryRows)
        }
      } catch (err) {
        if (!cancelled) {
          setError(`검색 실패: ${err.message || err}`)
          setSearchResults([])
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchQuery, loadPhotosForRows, loadFilesForRows])

  /* ===== CRUD 핸들러 ===== */
  const handleCreate = useCallback(
    async (content, writer = '주현희', sticker = null, linkKey = '', name = '', phone = '', title = '', pickedCustomerId = null) => {
      if (!isSupabaseConfigured) {
        setError('Supabase 연결이 설정되지 않았습니다. .env에 VITE_SUPABASE_URL 및 VITE_SUPABASE_ANON_KEY를 추가해주세요.')
        return
      }
      try {
        const tags = extractTags(content)
        const dateStr = toDateKey(selectedDate)

        // "기존 고객·메모 불러오기"로 이미 고른 customer_id가 있으면 그대로 사용해
        // 같은 고객으로 정확히 연결한다. 없을 때만 이름/연락처로 찾거나 새로 만든다.
        // (실패해도 메모 저장 자체는 막지 않는다)
        let customerId = pickedCustomerId || null
        if (!customerId && (name.trim() || phone.trim())) {
          try {
            const customer = await resolveOrCreateCustomer({ name, phone, manager: writer })
            customerId = customer?.id || null
          } catch (custErr) {
            console.warn('[WorkDiary] customer resolve failed:', custErr.message || custErr)
          }
        }

        const { data, error: e } = await supabase
          .from(TABLE)
          .insert({
            content,
            tags,
            status: 'normal',
            date: dateStr,
            writer,
            sticker: sticker || null,
            link_key: linkKey || '',
            customer_name: name || null,
            customer_phone: phone || null,
            title: title || null,
            customer_id: customerId,
          })
          .select()
          .single()
        if (e) throw e
        setMemos((prev) => [...prev, data])
        setNotedDateKeys((prev) => {
          const next = { ...prev }
          if (!next[dateStr]) next[dateStr] = []
          next[dateStr] = [...next[dateStr], { writer, sticker: sticker || null }]
          return next
        })
        // 새 연결고리가 있으면 목록 갱신
        if (linkKey) {
          setAllLinkKeys((prev) =>
            prev.includes(linkKey) ? prev : [...prev, linkKey].sort()
          )
        }
        setError(null)
        setUpcomingRefreshKey((key) => key + 1)
        return data
      } catch (err) {
        setError(`저장 실패: ${err.message || err}`)
        throw err
      }
    },
    [selectedDate]
  )

  const handleCreateDailySchedule = useCallback(async ({ writer = '주현희', content }) => {
    const text = (content || '').trim()
    if (!isSupabaseConfigured || !text) return

    setScheduleSaving(true)
    setScheduleError('')
    try {
      const dateStr = toDateKey(selectedDate)
      const { data, error: e } = await supabase
        .from(TABLE)
        .insert({
          content: text,
          tags: [],
          status: 'normal',
          date: dateStr,
          writer,
          sticker: null,
          link_key: DAILY_SCHEDULE_KEY,
          customer_name: null,
          customer_phone: null,
          title: null,
        })
        .select()
        .single()
      if (e) throw e
      setDailyScheduleNotes((prev) => [...prev, data])
    } catch (err) {
      setScheduleError(`일정 메모 저장 실패: ${err.message || err}`)
      throw err
    } finally {
      setScheduleSaving(false)
    }
  }, [selectedDate])

  const handleUpdateDailySchedule = useCallback(async (id, { writer = '주현희', content }) => {
    const text = (content || '').trim()
    if (!isSupabaseConfigured || !id || !text) return

    const patch = { writer, content: text }
    const prev = dailyScheduleNotes
    setDailyScheduleNotes((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item))
    )
    setScheduleSaving(true)
    setScheduleError('')
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .update(patch)
        .eq('id', id)
        .eq('link_key', DAILY_SCHEDULE_KEY)
      if (e) throw e
    } catch (err) {
      setDailyScheduleNotes(prev)
      setScheduleError(`일정 메모 수정 실패: ${err.message || err}`)
      throw err
    } finally {
      setScheduleSaving(false)
    }
  }, [dailyScheduleNotes])

  const handleDeleteDailySchedule = useCallback(async (id) => {
    if (!isSupabaseConfigured || !id) return

    const prev = dailyScheduleNotes
    setDailyScheduleNotes((items) => items.filter((item) => item.id !== id))
    setScheduleError('')
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .delete()
        .eq('id', id)
        .eq('link_key', DAILY_SCHEDULE_KEY)
      if (e) throw e
    } catch (err) {
      setDailyScheduleNotes(prev)
      setScheduleError(`일정 메모 삭제 실패: ${err.message || err}`)
    }
  }, [dailyScheduleNotes])

  const filteredMemos = useMemo(() => {
    const raw = searchMode ? searchResults : memos
    if (filterWriter === 'all') return raw
    return raw.filter((m) => (m.writer || '주현희') === filterWriter)
  }, [searchMode, searchResults, memos, filterWriter])

  const selectedDateStats = useMemo(() => {
    const selectedMemos = filterWriter === 'all'
      ? memos
      : memos.filter((memo) => (memo.writer || '\uC8FC\uD604\uD76C') === filterWriter)

    return {
      total: selectedMemos.length,
      important: selectedMemos.filter((memo) => memo.status === 'important').length,
      done: selectedMemos.filter((memo) => memo.status === 'done').length,
      isToday: toDateKey(selectedDate) === toDateKey(today),
    }
  }, [memos, filterWriter, selectedDate, today])
  const handleChangeStatus = useCallback(async (id, nextStatus) => {
    if (!isSupabaseConfigured) return
    // 낙관적 업데이트
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, status: nextStatus } : m)))
    setSearchResults((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: nextStatus } : m))
    )
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .update({ status: nextStatus })
        .eq('id', id)
      if (e) throw e
    } catch (err) {
      setError(`상태 변경 실패: ${err.message || err}`)
      // 실패 시 원본 다시 로드
      loadMemosForSelected()
    }
  }, [loadMemosForSelected])

  const handleDelete = useCallback(
    async (id) => {
      if (!isSupabaseConfigured) return
      const prevList = memos
      const prevSearch = searchResults
      setMemos((prev) => prev.filter((m) => m.id !== id))
      setSearchResults((prev) => prev.filter((m) => m.id !== id))
      setPhotoMap((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setFileMap((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      try {
        const { error: e } = await supabase.from(TABLE).delete().eq('id', id)
        if (e) throw e
        // 해당 날짜에 메모가 더 이상 없으면 도트 제거
        loadMonthDots()
        setUpcomingRefreshKey((key) => key + 1)
      } catch (err) {
        setError(`삭제 실패: ${err.message || err}`)
        setMemos(prevList)
        setSearchResults(prevSearch)
      }
    },
    [memos, searchResults, loadMonthDots]
  )

  const handleUpdateLinkKey = useCallback(async (id, linkKey) => {
    if (!isSupabaseConfigured) return
    const normalized = (linkKey || '').trim()
    // 낙관적 업데이트
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, link_key: normalized } : m)))
    setSearchResults((prev) => prev.map((m) => (m.id === id ? { ...m, link_key: normalized } : m)))
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .update({ link_key: normalized })
        .eq('id', id)
      if (e) throw e
      // 새 연결태그가 생겼으면 목록 갱신
      if (normalized) {
        setAllLinkKeys((prev) =>
          prev.includes(normalized) ? prev : [...prev, normalized].sort()
        )
      }
    } catch (err) {
      setError(`연결태그 저장 실패: ${err.message || err}`)
      loadMemosForSelected()
    }
  }, [loadMemosForSelected])

  const handleUpdateContent = useCallback(async (id, content, meta = {}) => {
    if (!isSupabaseConfigured) return
    const tags = extractTags(content)
    let patch = { content, tags, ...meta }

    // 아직 customer_id가 없는데 이름/연락처가 입력되면 고객을 찾거나 새로 만들어 연결
    if (!('customer_id' in meta)) {
      const existing = memos.find((m) => m.id === id) || searchResults.find((m) => m.id === id)
      const alreadyLinked = existing?.customer_id
      const nextName = 'customer_name' in meta ? meta.customer_name : existing?.customer_name
      const nextPhone = 'customer_phone' in meta ? meta.customer_phone : existing?.customer_phone
      if (!alreadyLinked && (nextName || nextPhone)) {
        try {
          const customer = await resolveOrCreateCustomer({ name: nextName, phone: nextPhone, manager: existing?.writer })
          if (customer?.id) patch = { ...patch, customer_id: customer.id }
        } catch (custErr) {
          console.warn('[WorkDiary] customer resolve failed:', custErr.message || custErr)
        }
      }
    }

    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )
    setSearchResults((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .update(patch)
        .eq('id', id)
      if (e) throw e
      if (typeof patch.link_key === 'string' && patch.link_key.trim()) {
        const normalized = patch.link_key.trim()
        setAllLinkKeys((prev) =>
          prev.includes(normalized) ? prev : [...prev, normalized].sort()
        )
      }
      loadMonthDots()
      setUpcomingRefreshKey((key) => key + 1)
    } catch (err) {
      setError(`수정 실패: ${err.message || err}`)
      loadMemosForSelected()
    }
  }, [loadMemosForSelected, loadMonthDots, memos, searchResults])

  /* ===== 고객별 메모 타임라인 ===== */

  // 카드에 customer_id가 없으면 고객을 찾거나 새로 만들어 그 자리에서 연결한다.
  // 반환값은 오직 customer_id뿐 — title/customer_name/phone은 절대 이 함수가 정하지 않는다.
  // (검색/생성용 이름이 필요하면 호출부에서 customerLookupName을 따로 만들어 넘긴다)
  const ensureCustomerLinked = useCallback(async (memo) => {
    if (memo.customer_id) {
      return { id: memo.customer_id }
    }
    // customers 조회/생성에는 customer_name과 phone만 사용한다. title은 고객명으로 쓰지 않는다.
    const customerLookupName = (memo.customer_name || '').trim()
    if (!customerLookupName && !memo.customer_phone) return null

    const customer = await resolveOrCreateCustomer({
      name: customerLookupName,
      phone: memo.customer_phone,
      manager: memo.writer,
    })
    if (!customer?.id) return null

    setMemos((prev) => prev.map((m) => (m.id === memo.id ? { ...m, customer_id: customer.id } : m)))
    setSearchResults((prev) => prev.map((m) => (m.id === memo.id ? { ...m, customer_id: customer.id } : m)))
    try {
      const { error: e } = await supabase.from(TABLE).update({ customer_id: customer.id }).eq('id', memo.id)
      if (e) throw e
    } catch (err) {
      console.warn('[WorkDiary] customer_id backfill failed:', err.message || err)
    }
    return { id: customer.id }
  }, [])

  // 기존 카드에서 "메모 추가" — 새 메모의 title/customer_name/phone은 원본 카드 그대로 복사한다.
  const handleOpenAddMemoForMemo = useCallback(async (memo) => {
    try {
      const linked = await ensureCustomerLinked(memo)
      setAddMemoTarget({
        customerId: linked?.id || null,
        sourceDiaryId: memo.id,
        sourceTitle: memo.title || '',
        sourceCustomerName: memo.customer_name || '',
        sourcePhone: memo.customer_phone || '',
        defaultDate: memo.date || toDateKey(selectedDate),
      })
    } catch (err) {
      setError(`고객 연결 실패: ${err.message || err}`)
    }
  }, [ensureCustomerLinked, selectedDate])

  const handleOpenTimelineForMemo = useCallback(async (memo) => {
    try {
      const linked = await ensureCustomerLinked(memo)
      if (!linked) {
        setError('고객 이름 또는 연락처가 없어 전체 메모를 볼 수 없습니다.')
        return
      }
      setTimelineCustomerId(linked.id)
    } catch (err) {
      setError(`고객 연결 실패: ${err.message || err}`)
    }
  }, [ensureCustomerLinked])

  // 고객 검색 결과에서 "메모 추가" — 원본 카드가 없으므로 title 없이 선택한 고객의 이름/연락처만 사용
  const handleSearchAddMemo = useCallback((customerRow) => {
    setAddMemoTarget({
      customerId: customerRow.id,
      sourceDiaryId: null,
      sourceTitle: '',
      sourceCustomerName: customerRow.name || '',
      sourcePhone: customerRow.phone || '',
      defaultDate: toDateKey(selectedDate),
    })
  }, [selectedDate])

  const handleSearchViewTimeline = useCallback((customerId) => {
    setTimelineCustomerId(customerId)
  }, [])

  // 고객에게 특정 날짜로 메모를 저장 — 같은 레코드가 선택 날짜의 업무일지 목록과
  // 고객 타임라인 양쪽에서 동시에 보이도록 work_diary에 customer_id + date로 저장
  const handleCreateForCustomer = useCallback(async ({ customerId, title, customerName, phone, date, content, writer }) => {
    if (!isSupabaseConfigured) throw new Error('Supabase 연결이 설정되지 않았습니다.')
    if (!date) throw new Error('기록 날짜를 선택해주세요.')

    const payload = buildCustomerMemoPayload(
      {},
      { customerId, title, customerName, phone, date, content, writer },
      customerId ? { id: customerId } : null
    )
    const insertPayload = {
      content: payload.content,
      tags: extractTags(payload.content || ''),
      status: 'normal',
      date: payload.date,
      writer: payload.author,
      sticker: null,
      link_key: '',
      title: payload.title,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_id: payload.customer_id,
    }
    // created_at/updated_at은 지정하지 않고 DB 기본값(now())을 그대로 사용한다

    const { data, error: e } = await supabase.from(TABLE).insert(insertPayload).select().single()
    if (e) throw e

    if (date === toDateKey(selectedDate)) {
      setMemos((prev) => [...prev, data])
      loadPhotosForRows([data])
      loadFilesForRows([data])
    }
    setNotedDateKeys((prev) => {
      const next = { ...prev }
      if (!next[date]) next[date] = []
      next[date] = [...next[date], { writer, sticker: null }]
      return next
    })
    setUpcomingRefreshKey((key) => key + 1)
    setTimelineReloadKey((key) => key + 1)
    return data
  }, [selectedDate, loadPhotosForRows, loadFilesForRows])

  // 고객 타임라인 모달에서 메모를 수정할 때 — 날짜가 바뀔 수 있으므로 오늘 목록/도트도 재동기화
  const handleTimelineUpdateMemo = useCallback(async (id, patch) => {
    await handleUpdateContent(id, patch.content, { date: patch.date })
    loadMemosForSelected()
    loadMonthDots()
  }, [handleUpdateContent, loadMemosForSelected, loadMonthDots])

  /* ===== 달력 네비게이션 ===== */
  function handlePrevMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }
  function handleNextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }
  function handleJumpToday() {
    const t = new Date()
    setViewYear(t.getFullYear())
    setViewMonth(t.getMonth())
    setSelectedDate(t)
  }
  function handleSelectDate(d) {
    setSelectedDate(d)
    if (d.getMonth() !== viewMonth || d.getFullYear() !== viewYear) {
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }

  function openDateInToday(d, memoId = null) {
    handleSelectDate(d)
    setMainView('today')
    setHighlightMemoId(memoId)
    if (memoId) setTimeout(() => setHighlightMemoId(null), 3000)
    setTimeout(() => document.querySelector('.wd-diary')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function moveWeek(offset) {
    if (offset === 0) {
      setWeekAnchor(new Date())
      return
    }
    setWeekAnchor((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + offset * 7)
      return next
    })
  }

  /* ===== 연결 메모 패널 ===== */
  const LinkPanel = linkKeyFilter ? (
    <div className="wd-link-modal" role="dialog" aria-modal="true" aria-label="연결 메모 보기">
      <div className="wd-link-panel">
        <div className="wd-link-panel-header">
          <div>
            <div className="wd-link-panel-title">연결태그 메모: {linkKeyFilter}</div>
            <div className="wd-link-panel-sub">{linkMemos.length}건 · 날짜순</div>
          </div>
          <button
            type="button"
            className="wd-link-panel-close"
            onClick={() => { setLinkKeyFilter(null); setLinkMemos([]) }}
          >
            닫기
          </button>
        </div>
        <div className="wd-link-panel-body">
          {linkMemosLoading ? (
            <div className="wd-loading">불러오는 중...</div>
          ) : linkMemos.length === 0 ? (
            <div className="wd-empty">
              <div className="wd-empty-icon" aria-hidden="true">🔗</div>
              <div className="wd-empty-title">연결된 메모가 없습니다</div>
            </div>
          ) : (
            linkMemos.map((m) => (
              <div key={m.id} className="wd-link-memo-item">
                <div className="wd-link-memo-date">{m.date}</div>
                <div className="wd-link-memo-content">{m.content}</div>
                <DiaryPhotoStrip
                  photos={photoMap[m.id] || []}
                  onOpen={(photos, index) => setPhotoGallery({ photos, index })}
                />
                {m.sticker && (
                  <span
                    className="wd-sticker-badge"
                    style={{ background: (STICKER_META_REF[m.sticker] || {}).color || '#888', marginTop: 4 }}
                  >
                    {m.sticker}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="wd-app">
      <header className="wd-header">
        <div className="wd-brand">
          <div className="wd-brand-mark">H</div>
          <div>
            <div className="wd-brand-title">하이탑 업무일지</div>
            <div className="wd-brand-sub">Work Diary</div>
          </div>
        </div>
        <SearchBar value={searchQuery} onChange={setSearchQuery} loading={searchLoading} />
        <button
          type="button"
          className="wd-btn-workcenter"
          onClick={() => onOpenStorageAdmin?.()}
        >
          💾 저장공간 관리
        </button>
        <a
          href="https://hitoputube-creator.github.io/hitop-ai-workcenter/"
          target="_blank"
          rel="noopener noreferrer"
          className="wd-btn-workcenter"
        >
          🏢 하이탑업무센타
        </a>
        <a
          href="https://calendar.google.com/calendar/u/0/r"
          target="_blank"
          rel="noopener noreferrer"
          className="wd-btn-workcenter wd-btn-google-calendar"
        >
          구글 캘린더
        </a>
      </header>
      {!isSupabaseConfigured && (
        <div className="wd-notice">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Supabase 연결 미설정.</strong> 프로젝트 루트에 <code>.env</code> 파일을 만들고
            <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>를 설정한 뒤
            개발 서버를 재시작해주세요. 그 전까지는 메모 저장/조회가 동작하지 않습니다.
          </div>
        </div>
      )}

      <div className="wd-view-toolbar">
        <div className="wd-view-tabs" role="tablist" aria-label="Work diary views">
          {[
            ['today', '\uC624\uB298'],
            ['week', '\uC8FC\uAC04'],
            ['month', '\uC6D4\uAC04'],
          ].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={mainView === value} className={`wd-filter-tab ${mainView === value ? 'active' : ''}`} onClick={() => setMainView(value)}>
              {label}
            </button>
          ))}
        </div>

        <div className="wd-toolbar-tools">
        <button
          type="button"
          className={`wd-filter-tab ${filterWriter === 'all' ? 'active' : ''}`}
          onClick={() => setFilterWriter('all')}
        >
          전체
        </button>
        <button
          type="button"
          className={`wd-filter-tab ${filterWriter === '주현희' ? 'active' : ''}`}
          onClick={() => setFilterWriter('주현희')}
        >
          주현희
        </button>
        <button
          type="button"
          className={`wd-filter-tab ${filterWriter === '김정현' ? 'active' : ''}`}
          onClick={() => setFilterWriter('김정현')}
        >
          김정현
        </button>

        <div className="wd-filter-divider" />

        <button
          type="button"
          className="wd-btn-personal-diary"
          onClick={() => onOpenDiary?.('주현희')}
        >
          📓 주현희 개인일지
        </button>
        <button
          type="button"
          className="wd-btn-personal-diary"
          onClick={() => onOpenDiary?.('김정현')}
        >
          📓 김정현 개인일지
        </button>
      </div>
      </div>

      <main className={'wd-main wd-main--' + mainView}>
        {mainView === 'week' ? (
          <WeeklyDiary
            days={weekDays}
            memos={weekMemos}
            loading={weekLoading}
            filterWriter={filterWriter}
            photoMap={photoMap}
            fileMap={fileMap}
            pinnedDiaryIds={pinnedDiaryIds}
            onPrevWeek={() => moveWeek(-1)}
            onThisWeek={() => moveWeek(0)}
            onNextWeek={() => moveWeek(1)}
            onOpenMemo={openDateInToday}
            onAddMemo={(day) => openDateInToday(day)}
          />
        ) : mainView === 'month' ? (
          <MonthlyDiary
            calendar={<Calendar viewYear={viewYear} viewMonth={viewMonth} selectedDate={selectedDate} notedDateKeys={notedDateKeys} filterWriter={filterWriter} onSelectDate={handleSelectDate} onPrevMonth={handlePrevMonth} onNextMonth={handleNextMonth} onJumpToday={handleJumpToday} />}
            selectedDate={selectedDate}
            memos={filteredMemos.filter((memo) => memo.date === toDateKey(selectedDate))}
            loading={searchMode ? searchLoading : loading}
            onOpenToday={openDateInToday}
          />
        ) : (
          <div className="wd-today-layout">
            <div className="wd-today-dashboard">
              <section className="wd-panel wd-today-date-card" aria-label="&#49440;&#53469; &#45216;&#51676; &#50836;&#50557;">
                <div className="wd-today-date-heading">
                  <span className="wd-today-weekday">{FULL_WEEKDAYS[selectedDate.getDay()]}</span>
                  {selectedDateStats.isToday && <span className="wd-today-badge">&#50724;&#45720;</span>}
                </div>
                <div className="wd-today-date-value">
                  {selectedDate.getMonth() + 1}&#50900; {selectedDate.getDate()}&#51068;
                </div>
                <div className="wd-today-date-stats">
                  <div><strong>{selectedDateStats.total}</strong><span>&#47700;&#47784;</span></div>
                  <div><strong>{selectedDateStats.important}</strong><span>&#51473;&#50836;</span></div>
                  <div><strong>{selectedDateStats.done}</strong><span>&#50756;&#47308;</span></div>
                </div>
              </section>
              <div className="wd-today-card wd-today-card--calendar">
                <Calendar viewYear={viewYear} viewMonth={viewMonth} selectedDate={selectedDate} notedDateKeys={notedDateKeys} filterWriter={filterWriter} onSelectDate={handleSelectDate} onPrevMonth={handlePrevMonth} onNextMonth={handleNextMonth} onJumpToday={handleJumpToday} />
              </div>
              <div className="wd-today-card wd-today-card--upcoming">
                <UpcomingSchedules filterWriter={filterWriter} refreshKey={upcomingRefreshKey} onNavigate={handleNavigate} />
              </div>
              <div className="wd-today-card wd-today-card--schedule">
                <SelectedScheduleMemos key={toDateKey(selectedDate)} selectedDate={selectedDate} notes={dailyScheduleNotes} loading={scheduleLoading} saving={scheduleSaving} error={scheduleError} onCreate={handleCreateDailySchedule} onUpdate={handleUpdateDailySchedule} onDelete={handleDeleteDailySchedule} />
              </div>
            </div>
            <DiaryList
              onNewMemo={() => openDateInToday(selectedDate)}
              selectedDate={selectedDate} memos={filteredMemos} loading={searchMode ? searchLoading : loading} error={error} searchMode={searchMode}
              onCreate={async (content, writer, sticker, linkKey, photoFiles = [], name = '', phone = '', title = '', diaryFiles = [], customerId = null) => {
                const createdMemo = await handleCreate(content, writer, sticker, linkKey, name, phone, title, customerId)
                if (!createdMemo) return
                if (photoFiles.length > 0) { try { await handleAddPhotosToMemo(createdMemo.id, photoFiles, writer) } catch (photoErr) { setError(`\uBA54\uBAA8\uB294 \uC800\uC7A5\uB410\uC9C0\uB9CC \uC0AC\uC9C4 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: ${photoErr.message || photoErr}`) } }
                if (diaryFiles.length > 0) { try { await handleAddFilesToMemo(createdMemo.id, diaryFiles, writer) } catch (fileErr) { setError(`\uBA54\uBAA8\uB294 \uC800\uC7A5\uB410\uC9C0\uB9CC \uD30C\uC77C \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: ${fileErr.message || fileErr}`) } }
              }}
              onAddPhotos={handleAddPhotosToMemo} onAddFiles={handleAddFilesToMemo} onChangeStatus={handleChangeStatus} onDelete={handleDelete}
              onUpdateContent={handleUpdateContent} onUpdateLinkKey={handleUpdateLinkKey} onOpenAddMemoForMemo={handleOpenAddMemoForMemo}
              onOpenTimelineForMemo={handleOpenTimelineForMemo} composerDisabled={!isSupabaseConfigured} allLinkKeys={allLinkKeys}
              onLinkKeyClick={handleLinkKeyClick} pinnedDiaryIds={pinnedDiaryIds} onPin={handlePin} onUnpin={handleUnpin}
              onNavigate={handleNavigate} highlightMemoId={highlightMemoId} searchQuery={searchQuery} photoMap={photoMap} fileMap={fileMap}
            />
          </div>
        )}
      </main>
      {LinkPanel}
      {photoGallery && (
        <PhotoGalleryModal
          photos={photoGallery.photos}
          startIndex={photoGallery.index}
          onClose={() => setPhotoGallery(null)}
        />
      )}

      {timelineCustomerId && (
        <CustomerTimelineModal
          customerId={timelineCustomerId}
          reloadSignal={timelineReloadKey}
          onClose={() => setTimelineCustomerId(null)}
          onNavigate={(dateStr, memoId) => {
            setTimelineCustomerId(null)
            handleNavigate(dateStr, memoId)
          }}
          onAddMemoRequested={(customer) =>
            setAddMemoTarget({
              customerId: customer.id,
              sourceDiaryId: null,
              sourceTitle: '',
              sourceCustomerName: customer.name || '',
              sourcePhone: customer.phone || '',
              defaultDate: toDateKey(selectedDate),
            })
          }
          onUpdateMemo={handleTimelineUpdateMemo}
          onDeleteMemo={handleDelete}
        />
      )}

      {addMemoTarget && (
        <AddCustomerMemoModal
          customerId={addMemoTarget.customerId}
          sourceDiaryId={addMemoTarget.sourceDiaryId}
          sourceTitle={addMemoTarget.sourceTitle}
          sourceCustomerName={addMemoTarget.sourceCustomerName}
          sourcePhone={addMemoTarget.sourcePhone}
          defaultDate={addMemoTarget.defaultDate}
          defaultWriter={filterWriter !== 'all' ? filterWriter : '주현희'}
          onClose={() => setAddMemoTarget(null)}
          onSave={handleCreateForCustomer}
        />
      )}
    </div>
  )
}
