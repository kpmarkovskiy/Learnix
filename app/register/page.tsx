'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'

type Role = 'student' | 'teacher'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setLoading(true)
    setError(null)
    setInfo(null)

    if (!name.trim()) {
      setError('Укажите имя')
      setLoading(false)
      return
    }

    const supabase = createClient()
    // name и role улетают в метаданные — их подхватит триггер handle_new_user
    // и создаст строку в profiles.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim(), role } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      // Подтверждение почты выключено → пользователь сразу залогинен.
      router.push('/')
      router.refresh()
    } else {
      // Подтверждение почты включено.
      setInfo('Аккаунт создан. Проверьте почту для подтверждения.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="brand-mark">Learn<span>ix</span></div>
        <div>
          <h2 className="brand-headline">Начните учить или учиться.</h2>
          <p className="brand-sub">
            Один аккаунт — и вы внутри: гибкое расписание, задания с дедлайнами,
            статистика посещаемости и живой чат.
          </p>
          <ul className="brand-features">
            <li>Бесплатно для учителей и учеников</li>
            <li>Запись к учителю по коду</li>
            <li>Уведомления о занятиях и заданиях</li>
            <li>Тёмная и светлая темы</li>
          </ul>
        </div>
        <div className="brand-foot">© {new Date().getFullYear()} Learnix</div>
      </aside>

      <main className="auth-panel">
        <div className="auth-theme">
          <ThemeToggle />
        </div>
        <div className="auth-card">
          <h1>Создать аккаунт</h1>
          <p className="lead">Выберите роль и заполните данные</p>

          {error && <div className="alert alert-error">{error}</div>}
          {info && <div className="alert alert-info">{info}</div>}

          <div className="role-toggle">
            <button
              type="button"
              className={`role-option ${role === 'student' ? 'active' : ''}`}
              onClick={() => setRole('student')}
            >
              <div className="role-title">Ученик</div>
              <div className="role-desc">Учусь, сдаю задания</div>
            </button>
            <button
              type="button"
              className={`role-option ${role === 'teacher' ? 'active' : ''}`}
              onClick={() => setRole('teacher')}
            >
              <div className="role-title">Учитель</div>
              <div className="role-desc">Веду занятия</div>
            </button>
          </div>

          <div className="field">
            <label htmlFor="name">Имя</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как вас зовут?"
            />
          </div>

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
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              placeholder="Минимум 6 символов"
            />
          </div>

          <button className="btn" onClick={handleRegister} disabled={loading}>
            {loading ? 'Создаём…' : 'Зарегистрироваться'}
          </button>

          <p className="auth-switch">
            Уже есть аккаунт? <Link href="/login">Войти</Link>
          </p>
        </div>
      </main>
    </div>
  )
}