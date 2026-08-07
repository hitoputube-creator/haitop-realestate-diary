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
const DAILY_SCHEDULE_KEY = '__daily_schedule__'

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

function wrapWorkDiaryBuilder(builder) {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop !== 'insert') {
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      }

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
    },
  })
}

// 메모 작성 화면에서 계약·잔금·약속의 별도 일정일을 지정한 경우에만
// work_diary INSERT를 "작성일 원본 + 일정일 스티커 메모" 두 건으로 안전하게 분리한다.
supabase.from = (relation) => {
  const builder = rawFrom(relation)
  return relation === 'work_diary' ? wrapWorkDiaryBuilder(builder) : builder
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)
