import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Корневая страница ничего не рендерит — она только перенаправляет:
// нет сессии → на вход; есть → в кабинет по роли из profiles.
export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'teacher') redirect('/teacher')
  redirect('/student')
}
