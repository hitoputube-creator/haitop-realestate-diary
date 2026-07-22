import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { toDateKey } from './Calendar'
import './SchedulePanel.css'

const TABLE = 'work_schedules'

const EMPTY_FORM = {
  schedule_time: '',
  title: '',
  memo: '',
  is_completed: false,
}

function formatPanelTitle(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 일정`
}

function normalizeTime(time) {
  return time ? time.slice(0, 5) : ''
}

function sortSchedules(rows) {
  return [...rows].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1

    const aTime = normalizeTime(a.schedule_time)
    const bTime = normalizeTime(b.schedule_time)
    if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime)
    if (aTime && !bTime) return -1
    if (!aTime && bTime) return 1

    return (a.created_at || '').localeCompare(b.created_at || '')
  })
}

export default function SchedulePanel({ selectedDate, disabled = false }) {
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate])
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const loadSchedules = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSchedules([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: loadError } = await supabase
        .from(TABLE)
        .select('id, schedule_date, schedule_time, title, memo, is_completed, created_at, updated_at')
        .eq('schedule_date', selectedDateKey)

      if (loadError) throw loadError
      setSchedules(sortSchedules(data || []))
    } catch (err) {
      setSchedules([])
      setError(`일정을 불러오지 못했습니다: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }, [selectedDateKey])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSchedules()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSchedules])

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const title = form.title.trim()

    if (!title) {
      setError('일정 내용을 입력해주세요.')
      return
    }
    if (disabled || saving) return

    const payload = {
      schedule_date: selectedDateKey,
      schedule_time: form.schedule_time || null,
      title,
      memo: form.memo.trim() || null,
      is_completed: form.is_completed,
    }

    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from(TABLE)
          .update(payload)
          .eq('id', editingId)
          .select('id, schedule_date, schedule_time, title, memo, is_completed, created_at, updated_at')
          .single()
        if (updateError) throw updateError
        setSchedules((prev) => sortSchedules(prev.map((item) => (item.id === editingId ? data : item))))
      } else {
        const { data, error: insertError } = await supabase
          .from(TABLE)
          .insert(payload)
          .select('id, schedule_date, schedule_time, title, memo, is_completed, created_at, updated_at')
          .single()
        if (insertError) throw insertError
        setSchedules((prev) => sortSchedules([...prev, data]))
      }
      resetForm()
    } catch (err) {
      setError(`일정을 저장하지 못했습니다: ${err.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(schedule) {
    setEditingId(schedule.id)
    setForm({
      schedule_time: normalizeTime(schedule.schedule_time),
      title: schedule.title || '',
      memo: schedule.memo || '',
      is_completed: Boolean(schedule.is_completed),
    })
    setError(null)
  }

  async function handleToggle(schedule) {
    if (disabled) return

    const nextCompleted = !schedule.is_completed
    const previous = schedules
    setSchedules((prev) =>
      sortSchedules(prev.map((item) => (item.id === schedule.id ? { ...item, is_completed: nextCompleted } : item)))
    )

    try {
      const { error: updateError } = await supabase
        .from(TABLE)
        .update({ is_completed: nextCompleted })
        .eq('id', schedule.id)
      if (updateError) throw updateError
    } catch (err) {
      setSchedules(previous)
      setError(`완료 상태를 변경하지 못했습니다: ${err.message || err}`)
    }
  }

  async function handleDelete(schedule) {
    if (disabled) return
    const ok = window.confirm('이 일정을 삭제할까요?')
    if (!ok) return

    const previous = schedules
    setSchedules((prev) => prev.filter((item) => item.id !== schedule.id))
    if (editingId === schedule.id) resetForm()

    try {
      const { error: deleteError } = await supabase
        .from(TABLE)
        .delete()
        .eq('id', schedule.id)
      if (deleteError) throw deleteError
    } catch (err) {
      setSchedules(previous)
      setError(`일정을 삭제하지 못했습니다: ${err.message || err}`)
    }
  }

  return (
    <section className="wd-panel wsp-panel" aria-label="선택 날짜 일정 관리">
      <div className="wd-panel-header wsp-header">
        <div>
          <div className="wd-panel-title">{formatPanelTitle(selectedDate)}</div>
          <div className="wsp-date-text">{selectedDateKey}</div>
        </div>
        <div className="wd-panel-sub">{schedules.length}건</div>
      </div>

      <form className="wsp-form" onSubmit={handleSubmit}>
        <label className="wsp-checkline">
          <input
            type="checkbox"
            checked={form.is_completed}
            onChange={(event) => updateForm('is_completed', event.target.checked)}
            disabled={disabled || saving}
          />
          <span>완료</span>
        </label>

        <div className="wsp-form-row">
          <input
            type="time"
            className="wsp-time-input"
            value={form.schedule_time}
            onChange={(event) => updateForm('schedule_time', event.target.value)}
            disabled={disabled || saving}
            aria-label="일정 시간"
          />
          <input
            type="text"
            className="wsp-title-input"
            value={form.title}
            onChange={(event) => updateForm('title', event.target.value)}
            disabled={disabled || saving}
            placeholder="일정 내용"
            aria-label="일정 내용"
            maxLength={120}
            required
          />
        </div>

        <textarea
          className="wsp-memo-input"
          value={form.memo}
          onChange={(event) => updateForm('memo', event.target.value)}
          disabled={disabled || saving}
          placeholder="개인 메모"
          aria-label="개인 메모"
          rows={2}
        />

        <div className="wsp-actions">
          {editingId && (
            <button type="button" className="wsp-btn wsp-btn-ghost" onClick={resetForm} disabled={saving}>
              취소
            </button>
          )}
          <button type="submit" className="wsp-btn wsp-btn-primary" disabled={disabled || saving}>
            {editingId ? '수정 저장' : '일정 추가'}
          </button>
        </div>
      </form>

      {error && <div className="wsp-error">{error}</div>}

      <div className="wsp-list">
        {loading ? (
          <div className="wsp-empty">불러오는 중...</div>
        ) : schedules.length === 0 ? (
          <div className="wsp-empty">등록된 일정이 없습니다.</div>
        ) : (
          schedules.map((schedule) => (
            <article
              key={schedule.id}
              className={`wsp-item ${schedule.is_completed ? 'completed' : ''}`}
            >
              <label className="wsp-item-check">
                <input
                  type="checkbox"
                  checked={schedule.is_completed}
                  onChange={() => handleToggle(schedule)}
                  disabled={disabled}
                  aria-label={`${schedule.title} 완료 여부`}
                />
              </label>
              <div className="wsp-item-body">
                <div className="wsp-item-main">
                  {schedule.schedule_time && (
                    <time className="wsp-item-time">{normalizeTime(schedule.schedule_time)}</time>
                  )}
                  <span className="wsp-item-title">{schedule.title}</span>
                </div>
                {schedule.memo && <div className="wsp-item-memo">{schedule.memo}</div>}
                <div className="wsp-item-actions">
                  <button type="button" onClick={() => handleEdit(schedule)}>수정</button>
                  <button type="button" className="danger" onClick={() => handleDelete(schedule)}>삭제</button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
