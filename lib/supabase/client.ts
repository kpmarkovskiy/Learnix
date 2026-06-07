import { createBrowserClient } from '@supabase/ssr'

// Клиент для Client Components ('use client').
// Используется в формах входа/регистрации, чатах, везде где есть интерактив.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
