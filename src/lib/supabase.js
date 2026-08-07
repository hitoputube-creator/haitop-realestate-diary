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

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)
