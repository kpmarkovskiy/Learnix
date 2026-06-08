'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Theme = 'light' | 'dark'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    // Узнаём текущую тему, которую уже выставил скрипт в layout.
    const current = (document.documentElement.dataset.theme as Theme) || 'light'
    setTheme(current)
  }, [])

  async function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next

    try {
      localStorage.setItem('learnix-theme', next)
    } catch {}

    // Сохраняем выбор в профиль (модуль 12 ТЗ: настройка темы в профиле).
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ theme: next }).eq('id', user.id)
    }
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Сменить тему" suppressHydrationWarning>
      {theme === null ? '◐' : theme === 'dark' ? 'Светлая' : 'Тёмная'}
    </button>
  )
}