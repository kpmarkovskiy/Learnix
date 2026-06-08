'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Неверный email или пароль')
      setLoading(false)
      return
    }
    // Сессия записана в cookie — корневая страница разрулит по роли.
    router.push('/')
    router.refresh()
  }

  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="brand-mark">Learn<span>ix</span></div>
        <div>
          <h2 className="brand-headline">Учёба, у которой есть структура.</h2>
          <p className="brand-sub">
            Расписание, занятия, домашние задания и общение учителя с учениками —
            в одном месте.
          </p>
          <ul className="brand-features">
            <li>Гибкое расписание и календарь занятий</li>
            <li>Домашние задания с дедлайнами</li>
            <li>Статистика посещаемости</li>
            <li>Живой чат учителя с учениками</li>
          </ul>
        </div>
        <div className="brand-foot">© {new Date().getFullYear()} Learnix</div>
      </aside>

      <main className="auth-panel">
        <div className="auth-theme">
          <ThemeToggle />
        </div>
        <div className="auth-card">
          <h1>С возвращением</h1>
          <p className="lead">Войдите в свой аккаунт</p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
            />
          </div>

          <button className="btn" onClick={handleLogin} disabled={loading}>
            {loading ? 'Входим…' : 'Войти'}
          </button>

          <p className="auth-switch">
            Нет аккаунта? <Link href="/register">Зарегистрироваться</Link>
          </p>
        </div>
      </main>
    </div>
  )
}