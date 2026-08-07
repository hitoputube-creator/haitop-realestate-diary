import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 환경 변수가 비어있으면 콘솔에 경고 (앱은 계속 실행되게 함)
if (!supabaseUrl || !supabaseKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.'
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-anon-key'
)

const rawFrom = supabase.from.bind(supabase)
const SCHEDULE_CONTEXT_KEY = '__HITOP_DIARY_STICKER_SCHEDULE__'
const EDIT_SCHEDULE_CONTEXT_KEY = '__HITOP_DIARY_STICKER_EDIT_SCHEDULE__'
const DAILY_SCHEDULE_KEY = '__daily_schedule__'

function emitScheduleSaved(mode) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('hitop:diary-schedule-saved', { detail: { mode } }))
}

/* ===== 새 메모 작성용 일정 분리 ===== */
function getScheduleContext(values) {
  if (typeof window === 'undefined') return null
  const context = window[SCHEDULE_CONTEXT_KEY]
  if (!context?.pending || !context.type || !context.date || !context.sourceDate || !context.token) return null
  if (Array.isArray(values) || !values || typeof values !== 'object') return null
  if (values.link_key === DAILY_SCHEDULE_KEY) return null
  if (values.date !== context.sourceDate || context.date === values.date) return null
  return { ...context }
}

function finishScheduleContext(token, success) {
  if (typeof window === 'undefined') return
  const current = window[SCHEDULE_CONTEXT_KEY]
  if (!current || current.token !== token) return

  if (success) {
    window[SCHEDULE_CONTEXT_KEY] = null
    emitScheduleSaved('create')
    return
  }

  window[SCHEDULE_CONTEXT_KEY] = {
    ...current,
    pending: false,
    token: null,
    suppressNoneClear: false,
  }
}

function wrapScheduledInsert(builder, scheduleBuilder, token, state = { promise: null }) {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => {
          if (!state.promise) {
            state.promise = (async () => {
              let scheduledId = null
              let success = false
              try {
                const scheduleResult = await scheduleBuilder
                if (scheduleResult?.error) return scheduleResult
                scheduledId = scheduleResult?.data?.id || null

                const sourceResult = await target
                if (sourceResult?.error) {
                  if (scheduledId) {
                    await rawFrom('work_diary').delete().eq('id', scheduledId)
                  }
                  return sourceResult
                }

                success = true
                return sourceResult
              } catch (error) {
                if (scheduledId) {
                  try {
                    await rawFrom('work_diary').delete().eq('id', scheduledId)
                  } catch {
                    // 일정 복사본 롤백은 가능한 범위에서만 수행한다.
                  }
                }
                throw error
              } finally {
                finishScheduleContext(token, success)
              }
            })()
          }
          return state.promise.then(onFulfilled, onRejected)
        }
      }

      if (prop === 'catch') {
        return (onRejected) => Promise.resolve(wrapScheduledInsert(target, scheduleBuilder, token, state)).catch(onRejected)
      }

      if (prop === 'finally') {
        return (onFinally) => Promise.resolve(wrapScheduledInsert(target, scheduleBuilder, token, state)).finally(onFinally)
      }

      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value

      return (...args) => {
        const next = value.apply(target, args)
        if (next && typeof next === 'object' && typeof next.then === 'function') {
          return wrapScheduledInsert(next, scheduleBuilder, token, state)
        }
        return next
      }
    },
  })
}

/* ===== 기존 메모 수정용 일정 분리 ===== */
function getEditScheduleContext(values) {
  if (typeof window === 'undefined') return null
  const context = window[EDIT_SCHEDULE_CONTEXT_KEY]
  if (!context?.pending || !context.type || !context.date || !context.sourceDate || !context.token) return null
  if (Array.isArray(values) || !values || typeof values !== 'object') return null
  if (values.sticker !== context.type) return null
  if (context.date === context.sourceDate) return null
  return { ...context }
}

function finishEditScheduleContext(token, success) {
  if (typeof window === 'undefined') return
  const current = window[EDIT_SCHEDULE_CONTEXT_KEY]
  if (!current || current.token !== token) return

  if (success) {
    window[EDIT_SCHEDULE_CONTEXT_KEY] = null
    emitScheduleSaved('edit')
    return
  }

  window[EDIT_SCHEDULE_CONTEXT_KEY] = {
    ...current,
    pending: false,
    token: null,
  }
}

function buildScheduledMemo(existing, patch, context) {
  return {
    content: patch.content ?? existing.content ?? '',
    tags: patch.tags ?? existing.tags ?? [],
    status: existing.status || 'normal',
    date: context.date,
    writer: existing.writer || '주현희',
    sticker: context.type,
    link_key: patch.link_key ?? existing.link_key ?? '',
    customer_name: Object.prototype.hasOwnProperty.call(patch, 'customer_name')
      ? patch.customer_name
      : (existing.customer_name ?? null),
    customer_phone: Object.prototype.hasOwnProperty.call(patch, 'customer_phone')
      ? patch.customer_phone
      : (existing.customer_phone ?? null),
    title: Object.prototype.hasOwnProperty.call(patch, 'title')
      ? patch.title
      : (existing.title ?? null),
    customer_id: Object.prototype.hasOwnProperty.call(patch, 'customer_id')
      ? patch.customer_id
      : (existing.customer_id ?? null),
  }
}

function wrapScheduledUpdate(builder, patch, context, state = { id: null, promise: null }) {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => {
          if (!state.promise) {
            state.promise = (async () => {
              // 현재 앱의 메모 수정은 id 조건으로 한 건만 수정한다.
              // id를 확인하지 못한 예외 경로는 기존 쿼리를 그대로 실행한다.
              if (!state.id) return target

              let scheduledId = null
              let success = false
              try {
                const existingResult = await rawFrom('work_diary')
                  .select('*')
                  .eq('id', state.id)
                  .single()
                if (existingResult?.error) return existingResult

                const scheduleValues = buildScheduledMemo(existingResult.data || {}, patch, context)
                const scheduleResult = await rawFrom('work_diary')
                  .insert(scheduleValues)
                  .select('id')
                  .single()
                if (scheduleResult?.error) return scheduleResult
                scheduledId = scheduleResult?.data?.id || null

                // 미래 날짜로 옮긴 일정 스티커는 원래 작성일 메모에 남기지 않는다.
                const sourceResult = await rawFrom('work_diary')
                  .update({ ...patch, sticker: null })
                  .eq('id', state.id)

                if (sourceResult?.error) {
                  if (scheduledId) {
                    await rawFrom('work_diary').delete().eq('id', scheduledId)
                  }
                  return sourceResult
                }

                success = true
                return sourceResult
              } catch (error) {
                if (scheduledId) {
                  try {
                    await rawFrom('work_diary').delete().eq('id', scheduledId)
                  } catch {
                    // 일정 복사본 롤백은 가능한 범위에서만 수행한다.
                  }
                }
                throw error
              } finally {
                finishEditScheduleContext(context.token, success)
              }
            })()
          }
          return state.promise.then(onFulfilled, onRejected)
        }
      }

      if (prop === 'catch') {
        return (onRejected) => Promise.resolve(wrapScheduledUpdate(target, patch, context, state)).catch(onRejected)
      }

      if (prop === 'finally') {
        return (onFinally) => Promise.resolve(wrapScheduledUpdate(target, patch, context, state)).finally(onFinally)
      }

      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value

      return (...args) => {
        if (prop === 'eq' && args[0] === 'id') state.id = args[1]
        const next = value.apply(target, args)
        if (next && typeof next === 'object' && typeof next.then === 'function') {
          return wrapScheduledUpdate(next, patch, context, state)
        }
        return next
      }
    },
  })
}

function wrapWorkDiaryBuilder(builder) {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === 'insert') {
        return (values, options) => {
          const context = getScheduleContext(values)
          if (!context) return target.insert(values, options)

          const sourceValues = {
            ...values,
            sticker: null,
          }
          const scheduleValues = {
            ...values,
            date: context.date,
            sticker: context.type,
          }

          const scheduleBuilder = rawFrom('work_diary')
            .insert(scheduleValues, options)
            .select('id')
            .single()
          const sourceBuilder = target.insert(sourceValues, options)

          return wrapScheduledInsert(sourceBuilder, scheduleBuilder, context.token)
        }
      }

      if (prop === 'update') {
        return (values, options) => {
          const context = getEditScheduleContext(values)
          const updateBuilder = target.update(values, options)
          return context ? wrapScheduledUpdate(updateBuilder, values, context) : updateBuilder
        }
      }

      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

// 계약·잔금·약속을 다른 날짜로 지정한 경우에만
// 원래 작성일 메모와 실제 일정일의 스티커 메모를 분리해서 저장한다.
supabase.from = (relation) => {
  const builder = rawFrom(relation)
  return relation === 'work_diary' ? wrapWorkDiaryBuilder(builder) : builder
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)
