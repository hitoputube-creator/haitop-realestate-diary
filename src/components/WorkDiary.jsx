import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import Calendar, { toDateKey } from './Calendar'
import DiaryList, { extractTags, STICKER_META as STICKER_META_REF } from './DiaryList'
import SearchBar from './SearchBar'
import UpcomingSchedules from './UpcomingSchedules'
import SelectedScheduleMemos from './SelectedScheduleMemos'
import { DiaryPhotoStrip, PhotoGalleryModal } from './DiaryPhotos'
import { listDiaryPhotosForIds, uploadDiaryPhotos, listDiaryFilesForIds, uploadDiaryFiles } from '../lib/attachments'
import { resolveOrCreateCustomer } from '../lib/customers'
import CustomerSearchPanel from './CustomerSearchPanel'
import AddCustomerMemoModal from './AddCustomerMemoModal'
import CustomerTimelineModal from './CustomerTimelineModal'
import './WorkDiary.css'

const TABLE = 'work_diary'
const DAILY_SCHEDULE_KEY = '__daily_schedule__'

export default function WorkDiary({ onOpenDiary, onOpenStorageAdmin }) {
  const today = useMemo(() => new Date(), [])

  const [selectedDate, setSelectedDate] = useState(today)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const [memos, setMemos] = useState([])
  const [dailyScheduleNotes, setDailyScheduleNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [error, setError] = useState(null)

  const [notedDateKeys, setNotedDateKeys] = useState({})

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [highlightMemoId, setHighlightMemoId] = useState(null)

  const searchMode = searchQuery.trim().length > 0
  const [filterWriter, setFilterWriter] = useState('all')

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
    async (content, writer = '주현희', sticker = null, linkKey = '', name = '', phone = '', title = '') => {
      if (!isSupabaseConfigured) {
        setError('Supabase 연결이 설정되지 않았습니다. .env에 VITE_SUPABASE_URL 및 VITE_SUPABASE_ANON_KEY를 추가해주세요.')
        return
      }
      try {
        const tags = extractTags(content)
        const dateStr = toDateKey(selectedDate)

        // 이름/연락처가 있으면 고객을 찾거나 새로 만들어 customer_id로 연결
        // (실패해도 메모 저장 자체는 막지 않는다)
        let customerId = null
        if (name.trim() || phone.trim()) {
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

  // 카드에 customer_id가 없으면 이름/연락처로 고객을 찾거나 새로 만들어 그 자리에서 연결
  const ensureCustomerLinked = useCallback(async (memo) => {
    if (memo.customer_id) {
      return { id: memo.customer_id, name: memo.customer_name || memo.title || '', phone: memo.customer_phone || '' }
    }
    if (!memo.customer_name && !memo.customer_phone) return null
    // customer_name이 비어있고 제목에 업체명/고객명이 적혀있는 경우가 있어 폴백으로 사용
    const nameGuess = memo.customer_name || memo.title || ''
    const customer = await resolveOrCreateCustomer({
      name: nameGuess,
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
    return {
      id: customer.id,
      name: customer.name || nameGuess || '',
      phone: customer.phone || memo.customer_phone || '',
    }
  }, [])

  const handleOpenAddMemoForMemo = useCallback(async (memo) => {
    try {
      const customer = await ensureCustomerLinked(memo)
      if (!customer) {
        setError('고객 이름 또는 연락처가 없어 메모를 연결할 수 없습니다.')
        return
      }
      setAddMemoTarget({ customer, defaultDate: memo.date || toDateKey(selectedDate) })
    } catch (err) {
      setError(`고객 연결 실패: ${err.message || err}`)
    }
  }, [ensureCustomerLinked, selectedDate])

  const handleOpenTimelineForMemo = useCallback(async (memo) => {
    try {
      const customer = await ensureCustomerLinked(memo)
      if (!customer) {
        setError('고객 이름 또는 연락처가 없어 전체 메모를 볼 수 없습니다.')
        return
      }
      setTimelineCustomerId(customer.id)
    } catch (err) {
      setError(`고객 연결 실패: ${err.message || err}`)
    }
  }, [ensureCustomerLinked])

  const handleSearchAddMemo = useCallback((customerRow) => {
    setAddMemoTarget({
      customer: { id: customerRow.id, name: customerRow.name, phone: customerRow.phone },
      defaultDate: toDateKey(selectedDate),
    })
  }, [selectedDate])

  const handleSearchViewTimeline = useCallback((customerId) => {
    setTimelineCustomerId(customerId)
  }, [])

  // 고객에게 특정 날짜로 메모를 저장 — 같은 레코드가 선택 날짜의 업무일지 목록과
  // 고객 타임라인 양쪽에서 동시에 보이도록 work_diary에 customer_id + date로 저장
  const handleCreateForCustomer = useCallback(async ({ customer, date, time, content, writer }) => {
    if (!isSupabaseConfigured) throw new Error('Supabase 연결이 설정되지 않았습니다.')
    if (!customer?.id) throw new Error('고객 정보를 찾을 수 없습니다. 다시 검색해주세요.')
    if (!date) throw new Error('기록 날짜를 선택해주세요.')

    const tags = extractTags(content)
    const insertPayload = {
      content,
      tags,
      status: 'normal',
      date,
      writer,
      sticker: null,
      link_key: '',
      customer_name: customer.name || null,
      customer_phone: customer.phone || null,
      title: null,
      customer_id: customer.id,
    }

    if (time) {
      const ts = new Date(`${date}T${time}:00`)
      if (!Number.isNaN(ts.getTime())) {
        insertPayload.created_at = ts.toISOString()
        insertPayload.updated_at = ts.toISOString()
      }
    }

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

      <div className="wd-filter-tabs">
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

      <main className="wd-main">
        <div className="wd-left-col">
          <Calendar
            viewYear={viewYear}
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            notedDateKeys={notedDateKeys}
            filterWriter={filterWriter}
            onSelectDate={handleSelectDate}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onJumpToday={handleJumpToday}
          />
          <CustomerSearchPanel
            onAddMemo={handleSearchAddMemo}
            onViewTimeline={handleSearchViewTimeline}
          />
          <UpcomingSchedules
            filterWriter={filterWriter}
            refreshKey={upcomingRefreshKey}
            onNavigate={handleNavigate}
          />
        </div>

        <DiaryList
          selectedDate={selectedDate}
          memos={filteredMemos}
          loading={searchMode ? searchLoading : loading}
          error={error}
          searchMode={searchMode}
          onCreate={async (content, writer, sticker, linkKey, photoFiles = [], name = '', phone = '', title = '', diaryFiles = []) => {
            const createdMemo = await handleCreate(content, writer, sticker, linkKey, name, phone, title)
            if (!createdMemo) return
            if (photoFiles.length > 0) {
              try {
                await handleAddPhotosToMemo(createdMemo.id, photoFiles, writer)
              } catch (photoErr) {
                setError(`메모는 저장됐지만 사진 업로드에 실패했습니다: ${photoErr.message || photoErr}`)
              }
            }
            if (diaryFiles.length > 0) {
              try {
                await handleAddFilesToMemo(createdMemo.id, diaryFiles, writer)
              } catch (fileErr) {
                setError(`메모는 저장됐지만 파일 업로드에 실패했습니다: ${fileErr.message || fileErr}`)
              }
            }
          }}
          onAddPhotos={handleAddPhotosToMemo}
          onAddFiles={handleAddFilesToMemo}
          onChangeStatus={handleChangeStatus}
          onDelete={handleDelete}
          onUpdateContent={handleUpdateContent}
          onUpdateLinkKey={handleUpdateLinkKey}
          onOpenAddMemoForMemo={handleOpenAddMemoForMemo}
          onOpenTimelineForMemo={handleOpenTimelineForMemo}
          composerDisabled={!isSupabaseConfigured}
          allLinkKeys={allLinkKeys}
          onLinkKeyClick={handleLinkKeyClick}
          pinnedDiaryIds={pinnedDiaryIds}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onNavigate={handleNavigate}
          highlightMemoId={highlightMemoId}
          searchQuery={searchQuery}
          photoMap={photoMap}
          fileMap={fileMap}
        />

        <SelectedScheduleMemos
          key={toDateKey(selectedDate)}
          selectedDate={selectedDate}
          notes={dailyScheduleNotes}
          loading={scheduleLoading}
          saving={scheduleSaving}
          error={scheduleError}
          onCreate={handleCreateDailySchedule}
          onUpdate={handleUpdateDailySchedule}
          onDelete={handleDeleteDailySchedule}
        />
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
            setAddMemoTarget({ customer, defaultDate: toDateKey(selectedDate) })
          }
          onUpdateMemo={handleTimelineUpdateMemo}
          onDeleteMemo={handleDelete}
        />
      )}

      {addMemoTarget && (
        <AddCustomerMemoModal
          customer={addMemoTarget.customer}
          defaultDate={addMemoTarget.defaultDate}
          defaultWriter={filterWriter !== 'all' ? filterWriter : '주현희'}
          onClose={() => setAddMemoTarget(null)}
          onSave={handleCreateForCustomer}
        />
      )}
    </div>
  )
}
