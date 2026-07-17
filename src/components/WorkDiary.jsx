import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import Calendar, { toDateKey } from './Calendar'
import DiaryList, { extractTags, STICKER_META as STICKER_META_REF } from './DiaryList'
import SearchBar from './SearchBar'
import StickyNotes from './StickyNotes'
import { CustomerWorkPanel } from './customer/CustomerWorkflow'
import {
  CUSTOMER_SELECT_FIELDS,
  buildCustomerSearchParts,
  isMissingCustomerMigrationError,
  toDateTimeValue,
} from '../lib/crm'
import {
  deleteAttachment,
  isMissingAttachmentSetupError,
  listAttachmentsForDiaryIds,
  uploadAttachmentFiles,
} from '../lib/attachments'
import './WorkDiary.css'

const TABLE = 'work_diary'

export default function WorkDiary({ onOpenDiary, onOpenCustomer, customerFilter, onClearCustomerFilter }) {
  const today = useMemo(() => new Date(), [])

  const [selectedDate, setSelectedDate] = useState(today)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const [memos, setMemos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [notedDateKeys, setNotedDateKeys] = useState({})

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [highlightMemoId, setHighlightMemoId] = useState(null)
  const [customerMap, setCustomerMap] = useState({})
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [recordScope, setRecordScope] = useState(customerFilter?.id ? 'customer' : 'all')
  const [customerSearchResults, setCustomerSearchResults] = useState([])
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0)
  const [attachmentsByDiary, setAttachmentsByDiary] = useState({})

  const activeCustomerFilter = selectedCustomer
    ? {
        id: selectedCustomer.id,
        name: selectedCustomer.name,
        customer_code: selectedCustomer.customer_code,
        date: customerFilter?.date || null,
      }
    : customerFilter
  const effectiveCustomerFilter = recordScope === 'customer' ? activeCustomerFilter : null
  const textSearchMode = searchQuery.trim().length > 0
  const searchMode = textSearchMode || Boolean(effectiveCustomerFilter?.id)
  const [filterWriter, setFilterWriter] = useState('all')

  useEffect(() => {
    if (!customerFilter?.date) return
    const timer = setTimeout(() => {
      const target = new Date(`${customerFilter.date}T00:00:00`)
      if (Number.isNaN(target.getTime())) return
      setSelectedDate(target)
      setViewYear(target.getFullYear())
      setViewMonth(target.getMonth())
    }, 0)
    return () => clearTimeout(timer)
  }, [customerFilter?.date])

  useEffect(() => {
    if (!customerFilter?.id || !isSupabaseConfigured) return
    if (selectedCustomer?.id === customerFilter.id) {
      const timer = setTimeout(() => setRecordScope('customer'), 0)
      return () => clearTimeout(timer)
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error: e } = await supabase
          .from('customers')
          .select(CUSTOMER_SELECT_FIELDS)
          .eq('id', customerFilter.id)
          .single()
        if (e) throw e
        if (!cancelled) {
          setSelectedCustomer(data)
          setRecordScope('customer')
        }
      } catch (err) {
        if (!cancelled) {
          setError(`선택 고객 정보를 불러오지 못했습니다: ${err.message || err}`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [customerFilter?.id, selectedCustomer?.id])

  function handleSelectCustomer(customer) {
    setSelectedCustomer(customer)
    setRecordScope('customer')
    setSearchQuery('')
    setCustomerSearchResults([])
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomer(null)
    setRecordScope('all')
    onClearCustomerFilter?.()
  }

  /* ===== 연결고리 ===== */
  const [allLinkKeys, setAllLinkKeys] = useState([])
  const [linkKeyFilter, setLinkKeyFilter] = useState(null)
  const [linkMemos, setLinkMemos] = useState([])
  const [linkMemosLoading, setLinkMemosLoading] = useState(false)

  /* ===== 포스트잇 ===== */
  const [stickyData, setStickyData] = useState([])   // [{sticky, memo}]
  const [stickyLoading, setStickyLoading] = useState(false)

  // 현재 고정된 diary_id Set — MemoCard 버튼 상태 판단용
  const pinnedDiaryIds = useMemo(
    () => new Set(stickyData.map((d) => d.sticky.diary_id)),
    [stickyData]
  )

  const loadCustomersForMemos = useCallback(async (rows) => {
    const ids = Array.from(new Set((rows || []).map((row) => row.customer_id).filter(Boolean)))
    if (!isSupabaseConfigured || ids.length === 0) {
      setCustomerMap({})
      return
    }
    try {
      const { data, error: e } = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT_FIELDS)
        .in('id', ids)
      if (e) throw e
      const nextMap = {}
      ;(data || []).forEach((customer) => {
        nextMap[customer.id] = customer
      })
      setCustomerMap(nextMap)
    } catch (err) {
      setError(`연결 고객 정보를 불러오지 못했습니다: ${err.message || err}`)
      setCustomerMap({})
    }
  }, [])

  /* ===== 선택 날짜의 메모 로드 ===== */
  const loadMemosForSelected = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMemos([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dateStr = toDateKey(selectedDate)
      const { data, error: e } = await supabase
        .from(TABLE)
        .select('*')
        .eq('date', dateStr)
        .order('created_at', { ascending: true })
      if (e) throw e
      setMemos(data || [])
    } catch (err) {
      setError(`메모를 불러오지 못했습니다: ${err.message || err}`)
      setMemos([])
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadMemosForSelected()
  }, [loadMemosForSelected])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomersForMemos(searchMode ? searchResults : memos)
    }, 0)
    return () => clearTimeout(timer)
  }, [loadCustomersForMemos, memos, searchMode, searchResults])

  useEffect(() => {
    let cancelled = false
    const rows = searchMode ? searchResults : memos
    const ids = rows.map((memo) => memo.id).filter(Boolean)
    const timer = setTimeout(async () => {
      if (!isSupabaseConfigured || ids.length === 0) {
        if (!cancelled) setAttachmentsByDiary({})
        return
      }
      try {
        const map = await listAttachmentsForDiaryIds(ids)
        if (!cancelled) setAttachmentsByDiary(map)
      } catch (err) {
        if (!cancelled) {
          setAttachmentsByDiary({})
          if (!isMissingAttachmentSetupError(err)) {
            setError(`첨부파일 조회 실패: ${err.message || err}`)
          }
        }
      }
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [memos, searchMode, searchResults])

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
        .select('date, writer, sticker')
        .gte('date', startStr)
        .lte('date', endStr)
      if (e) throw e

      // { [dateKey]: [{ writer, sticker }] }
      const dotsMap = {}
      if (data) {
        data.forEach((r) => {
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
      const unique = Array.from(new Set((data || []).map((r) => r.link_key).filter(Boolean))).sort()
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
      setLinkMemos(data || [])
    } catch (err) {
      setError(`연결 메모 조회 실패: ${err.message || err}`)
      setLinkMemos([])
    } finally {
      setLinkMemosLoading(false)
    }
  }, [])

  function handleLinkKeyClick(key) {
    setLinkKeyFilter(key)
    loadLinkMemos(key)
  }

  /* ===== 포스트잇 로드 ===== */
  const loadStickyNotes = useCallback(async () => {
    if (!isSupabaseConfigured) return
    setStickyLoading(true)
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
    } finally {
      setStickyLoading(false)
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

  /* 포스트잇 색상 변경 */
  const handleUpdateStickyColor = useCallback(async (stickyId, color) => {
    if (!isSupabaseConfigured) return
    // 낙관적 업데이트
    setStickyData((prev) =>
      prev.map((d) =>
        d.sticky.id === stickyId ? { ...d, sticky: { ...d.sticky, color } } : d
      )
    )
    try {
      const { error: e } = await supabase
        .from('work_sticky_notes')
        .update({ color })
        .eq('id', stickyId)
      if (e) throw e
    } catch (err) {
      setError(`색상 변경 실패: ${err.message || err}`)
      loadStickyNotes()
    }
  }, [loadStickyNotes])


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

  /* ===== 통합 검색 ===== */
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q && !effectiveCustomerFilter?.id) {
      const timer = setTimeout(() => {
        setSearchResults([])
        setCustomerSearchResults([])
      }, 0)
      return () => clearTimeout(timer)
    }
    if (!isSupabaseConfigured) {
      const timer = setTimeout(() => {
        setSearchResults([])
        setCustomerSearchResults([])
      }, 0)
      return () => clearTimeout(timer)
    }

    let cancelled = false
    setSearchLoading(true)
    ;(async () => {
      try {
        if (effectiveCustomerFilter?.id) {
          const { data, error: e } = await supabase
            .from(TABLE)
            .select('*')
            .eq('customer_id', effectiveCustomerFilter.id)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(200)
          if (e) throw e
          if (!cancelled) {
            setSearchResults(data || [])
            setCustomerSearchResults([])
          }
          return
        }

        const { data: customers, error: customerError } = await supabase
          .from('customers')
          .select(CUSTOMER_SELECT_FIELDS)
          .or(buildCustomerSearchParts(q).join(','))
          .order('updated_at', { ascending: false })
          .limit(20)
        if (customerError) throw customerError

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
            `record_type.ilike.%${q}%`,
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

        let linkedRows = []
        const customerIds = (customers || []).map((customer) => customer.id).filter(Boolean)
        if (customerIds.length > 0) {
          const { data: linkedData, error: linkedError } = await supabase
            .from(TABLE)
            .select('*')
            .in('customer_id', customerIds)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100)
          if (linkedError) throw linkedError
          linkedRows = linkedData || []
        }

        const merged = new Map()
        ;[...(data || []), ...linkedRows].forEach((row) => {
          if (row?.id) merged.set(row.id, row)
        })
        const rows = Array.from(merged.values()).sort((a, b) => {
          const dateDiff = String(b.date || '').localeCompare(String(a.date || ''))
          if (dateDiff !== 0) return dateDiff
          return new Date(b.created_at || 0) - new Date(a.created_at || 0)
        })

        if (!cancelled) {
          setSearchResults(rows)
          setCustomerSearchResults(customers || [])
          const nextMap = {}
          ;(customers || []).forEach((customer) => {
            nextMap[customer.id] = customer
          })
          setCustomerMap((prev) => ({ ...prev, ...nextMap }))
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            isMissingCustomerMigrationError(err)
              ? '고객 연결 기록을 조회하려면 007_link_work_diary_to_customers.sql 마이그레이션 적용이 필요합니다.'
              : `검색 실패: ${err.message || err}`
          )
          setSearchResults([])
          setCustomerSearchResults([])
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectiveCustomerFilter?.id, searchQuery])

  /* ===== CRUD 핸들러 ===== */
  const handleCreate = useCallback(
    async (content, writer = '주현희', sticker = null, linkKey = '', selectedCustomer = null, recordType = '일반메모', scheduledAt = '', pendingFiles = []) => {
      if (!isSupabaseConfigured) {
        setError('Supabase 연결이 설정되지 않았습니다. .env에 VITE_SUPABASE_URL 및 VITE_SUPABASE_ANON_KEY를 추가해주세요.')
        return
      }
      try {
        const tags = extractTags(content)
        const dateStr = toDateKey(selectedDate)
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
            customer_id: selectedCustomer?.id || null,
            record_type: recordType || '일반메모',
            priority: '일반',
            scheduled_at: toDateTimeValue(scheduledAt),
          })
          .select()
          .single()
        if (e) throw e

        if (selectedCustomer?.id && scheduledAt) {
          const { data: updatedCustomer, error: updateError } = await supabase
            .from('customers')
            .update({ next_contact_at: scheduledAt })
            .eq('id', selectedCustomer.id)
            .select(CUSTOMER_SELECT_FIELDS)
            .single()
          if (updateError) {
            setError(`업무기록은 저장됐지만 다음 연락일 갱신에 실패했습니다: ${updateError.message || updateError}`)
          } else {
            setSelectedCustomer(updatedCustomer)
            setCustomerMap((prev) => ({ ...prev, [updatedCustomer.id]: updatedCustomer }))
            setError(null)
          }
        }

        setMemos((prev) => [...prev, data])
        setSearchResults((prev) => (searchMode ? [data, ...prev] : prev))
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
        if (selectedCustomer?.id) {
          setCustomerMap((prev) => ({ ...prev, [selectedCustomer.id]: selectedCustomer }))
        }
        if (!scheduledAt || !selectedCustomer?.id) setError(null)
        setTimelineRefreshKey((value) => value + 1)
        let attachmentResults = []
        if (pendingFiles?.length) {
          attachmentResults = await uploadAttachmentFiles({
            files: pendingFiles,
            customerId: selectedCustomer?.id || null,
            workDiaryId: data.id,
            uploadedBy: writer,
          })
          const successful = attachmentResults
            .filter((result) => result.status === 'success')
            .map((result) => result.attachment)
          if (successful.length) {
            setAttachmentsByDiary((prev) => ({
              ...prev,
              [data.id]: [...successful, ...(prev[data.id] || [])],
            }))
          }
        }
        return { memo: data, attachmentResults }
      } catch (err) {
        setError(
          isMissingCustomerMigrationError(err)
            ? '저장 실패: 고객 연결 컬럼이 아직 DB에 없습니다. 007_link_work_diary_to_customers.sql 마이그레이션을 먼저 적용해주세요.'
            : `저장 실패: ${err.message || err}`
        )
        throw err
      }
    },
    [searchMode, selectedDate]
  )

  function handleExistingAttachmentsUploaded(memo, rows) {
    if (!rows?.length) return
    setAttachmentsByDiary((prev) => ({
      ...prev,
      [memo.id]: [...rows, ...(prev[memo.id] || [])],
    }))
  }

  function handleAttachmentDeleted(attachment) {
    setAttachmentsByDiary((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        next[key] = next[key].filter((row) => row.id !== attachment.id)
      })
      return next
    })
  }

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
      const memo = [...memos, ...searchResults].find((item) => item.id === id)
      setMemos((prev) => prev.filter((m) => m.id !== id))
      setSearchResults((prev) => prev.filter((m) => m.id !== id))
      try {
        const { data: attachmentRows, error: attachmentError } = await supabase
          .from('crm_attachments')
          .select('id, customer_id, work_diary_id, storage_bucket, storage_path, original_name')
          .eq('work_diary_id', id)
        if (attachmentError && !isMissingAttachmentSetupError(attachmentError)) throw attachmentError
        const attachments = attachmentRows || []
        if (attachments.length > 0) {
          const customerLinked = attachments.filter((row) => row.customer_id)
          const customerless = attachments.filter((row) => !row.customer_id)
          if (customerless.length > 0) {
            const ok = window.confirm(`이 기록에 고객 연결이 없는 첨부파일 ${customerless.length}개가 있습니다. 기록 삭제와 함께 이 파일도 삭제할까요?`)
            if (!ok) throw new Error('첨부파일이 있어 기록 삭제를 취소했습니다.')
            for (const attachment of customerless) {
              await deleteAttachment(attachment)
            }
          }
          if (customerLinked.length > 0) {
            window.alert(`이 기록에 첨부파일 ${customerLinked.length}개가 있습니다. 업무기록 연결만 해제하고 고객 첨부파일로 유지합니다.`)
            const { error: updateError } = await supabase
              .from('crm_attachments')
              .update({ work_diary_id: null })
              .eq('work_diary_id', id)
              .not('customer_id', 'is', null)
            if (updateError) throw updateError
          }
        }
        const { error: e } = await supabase.from(TABLE).delete().eq('id', id)
        if (e) throw e
        if (memo?.id) {
          setAttachmentsByDiary((prev) => {
            const next = { ...prev }
            delete next[memo.id]
            return next
          })
        }
        // 해당 날짜에 메모가 더 이상 없으면 도트 제거
        loadMonthDots()
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

  const handleUpdateContent = useCallback(async (id, content) => {
    if (!isSupabaseConfigured) return
    const tags = extractTags(content)
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, tags } : m))
    )
    setSearchResults((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, tags } : m))
    )
    try {
      const { error: e } = await supabase
        .from(TABLE)
        .update({ content, tags })
        .eq('id', id)
      if (e) throw e
    } catch (err) {
      setError(`수정 실패: ${err.message || err}`)
      loadMemosForSelected()
    }
  }, [loadMemosForSelected])

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
        <a
          href="https://hitoputube-creator.github.io/hitop-ai-workcenter/"
          target="_blank"
          rel="noopener noreferrer"
          className="wd-btn-workcenter"
        >
          🏢 하이탑업무센타
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
          <StickyNotes
            stickyData={stickyData}
            loading={stickyLoading}
            onUnpin={handleUnpin}
            onUpdateColor={handleUpdateStickyColor}
            onLinkKeyClick={handleLinkKeyClick}
          />
        </div>

        <DiaryList
          selectedDate={selectedDate}
          memos={filteredMemos}
          loading={searchMode ? searchLoading : loading}
          error={error}
          searchMode={searchMode}
          onCreate={handleCreate}
          onChangeStatus={handleChangeStatus}
          onDelete={handleDelete}
          onUpdateContent={handleUpdateContent}
          onUpdateLinkKey={handleUpdateLinkKey}
          composerDisabled={!isSupabaseConfigured}
          allLinkKeys={allLinkKeys}
          onLinkKeyClick={handleLinkKeyClick}
          pinnedDiaryIds={pinnedDiaryIds}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onNavigate={handleNavigate}
          highlightMemoId={highlightMemoId}
          searchQuery={searchQuery}
          customerResults={customerSearchResults}
          customerMap={customerMap}
          onCustomerClick={(customerId) => {
            const customer = customerMap?.[customerId]
            if (customer) handleSelectCustomer(customer)
            else onOpenCustomer?.(customerId)
          }}
          onSearchCustomerClick={handleSelectCustomer}
          customerFilter={effectiveCustomerFilter}
          onClearCustomerFilter={handleClearSelectedCustomer}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={handleSelectCustomer}
          onClearSelectedCustomer={handleClearSelectedCustomer}
          recordScope={recordScope}
          onRecordScopeChange={setRecordScope}
          attachmentsByDiary={attachmentsByDiary}
          onExistingAttachmentsUploaded={handleExistingAttachmentsUploaded}
          onAttachmentDeleted={handleAttachmentDeleted}
        />

        <CustomerWorkPanel
          selectedCustomer={selectedCustomer}
          recordScope={recordScope}
          timelineRefreshKey={timelineRefreshKey}
          onSelectCustomer={handleSelectCustomer}
          onClearCustomer={handleClearSelectedCustomer}
          onCustomerSaved={(customer, record) => {
            handleSelectCustomer(customer)
            setCustomerMap((prev) => ({ ...prev, [customer.id]: customer }))
            if (record) {
              setSearchResults((prev) => [record, ...prev])
              setTimelineRefreshKey((value) => value + 1)
            }
          }}
          onOpenCustomerManager={onOpenCustomer}
          onRecordScopeChange={setRecordScope}
        />
      </main>

      {LinkPanel}
    </div>
  )
}
