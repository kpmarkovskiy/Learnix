'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { SignOutButton } from '@/components/sign-out-button'
import { CopyCode } from '@/components/copy-code'
import { Scheduler } from '@/components/scheduler'

type Student = { id: string; name: string; email: string }

export function TeacherWorkspace({
  name,
  inviteCode,
  students,
}: {
  name: string
  inviteCode: string | null
  students: Student[]
}) {
  const [sel, setSel] = useState('')
  const [availIds, setAvailIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Кто из учеников отметил свободное время — для точки в списке.
  useEffect(() => {
    const ids = students.map((s) => s.id)
    if (ids.length === 0) return
    supabase
      .from('availability')
      .select('student_id')
      .in('student_id', ids)
      .gte('date', todayStr)
      .then(({ data }) => setAvailIds(new Set((data ?? []).map((r: any) => r.student_id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = students.find((s) => s.id === sel)

  return (
    <div className="shell">
      <aside className="shell-side">
        <div className="shell-brand">Learn<span>ix</span></div>

        <p className="shell-side-label">Ученики</p>
        <nav className="shell-students">
          {students.length > 0 ? (
            students.map((s) => (
              <button
                key={s.id}
                className={`shell-student ${s.id === sel ? 'active' : ''}`}
                onClick={() => setSel(s.id)}
              >
                <span className="shell-student-av">{s.name.charAt(0).toUpperCase()}</span>
                <span className="shell-student-name">{s.name}</span>
                {availIds.has(s.id) && <span className="free-dot" title="есть свободное время" />}
              </button>
            ))
          ) : (
            <p className="shell-empty">Пока никто не записался.</p>
          )}
        </nav>

        <div className="shell-foot">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </aside>

      <main className="shell-main">
        {current ? (
          <>
            <header className="shell-head">
              <h1>{current.name}</h1>
              <p className="lead">{current.email}</p>
            </header>
            <Scheduler studentId={current.id} studentName={current.name} />
          </>
        ) : (
          <>
            <header className="shell-head">
              <h1>Здравствуйте, {name}</h1>
              <p className="lead">Выберите ученика слева, чтобы посмотреть его расписание и назначить занятие.</p>
            </header>
            <section className="card" style={{ maxWidth: 460 }}>
              <h3>Код приглашения</h3>
              <p className="card-hint">Передайте этот код ученикам — по нему они запишутся к вам.</p>
              <div className="code-row">
                <span className="code-value">{inviteCode ?? '—'}</span>
                {inviteCode && <CopyCode code={inviteCode} />}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
