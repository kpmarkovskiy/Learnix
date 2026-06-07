import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Клиент для Server Components и Route Handlers.
// Читает сессию из cookie. В Next 15 cookies() асинхронный — поэтому await.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Вызов из Server Component, где запись cookie запрещена.
            // Это нормально: сессию обновит middleware.
          }
        },
      },
    }
  )
}
