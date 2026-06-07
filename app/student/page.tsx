import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { EnrollForm } from '@/components/enroll-form'
import { AvailabilityManager } from '@/components/availability-manager'

const AV = ['av-coral', 'av-blue', 'av-violet', 'av-teal', 'av-amber']
function avatarClass(name?: string) {
  const s = name || '?'
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV[Math.abs(h) % AV.length]
}

const hhmm = (t: string) => t.slice(0, 5)
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Запланировано', cls: 'badge-scheduled' },
  completed: { label: 'Проведено', cls: 'badge-completed' },
  cancelled: { label: 'Отменено', cls: 'badge-cancelled' },
}

export default async function StudentPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'student') redirect('/teacher')

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const { data: teachers } = await supabase
    .from('enrollments')
    .select('id, teacher:profiles!enrollments_teacher_id_fkey(id, name, email)')
    .eq('student_id', user.id)

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, date, start_time, end_time, status, teacher:profiles!lessons_teacher_id_fkey(name)')
    .eq('student_id', user.id)
    .gte('date', todayStr)
    .order('date')
    .order('start_time')

  return (
    <>
      <header className="dash-header">
        <div className="brand-mark">Learn<span>ix</span></div>
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="dash-main">
        <h1>Привет, {profile?.name || 'ученик'}</h1>
        <p className="lead">Кабинет ученика</p>

        <div className="student-grid">
        <section className="card">
          <h3>Мои занятия</h3>
          {lessons && lessons.length > 0 ? (
            <ul className="lesson-list">
              {lessons.map((l: any) => (
                <li key={l.id} className="lesson-item">
                  <span className="lesson-when">
                    {fmtDate(l.date)}
                    <span className="lesson-time">
                      {hhmm(l.start_time)}–{hhmm(l.end_time)}
                    </span>
                    {l.teacher?.name && (
                      <span className="lesson-time">· {l.teacher.name}</span>
                    )}
                  </span>
                  <span className={`badge ${STATUS[l.status]?.cls ?? ''}`}>
                    {STATUS[l.status]?.label ?? l.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Занятий пока не назначено.</p>
          )}
        </section>

        <section className="card">
          <h3>Записаться к учителю</h3>
          <p className="card-hint">Введите код, который дал вам учитель.</p>
          <EnrollForm />
        </section>

        <section className="card span-2">
          <h3>Моё свободное время</h3>
          <p className="card-hint">
            Укажите, когда вам удобно заниматься — учитель увидит эти окна и назначит уроки.
          </p>
          <AvailabilityManager />
        </section>

        <section className="card">
          <h3>Мои учителя</h3>
          {teachers && teachers.length > 0 ? (
            <ul className="people-list">
              {teachers.map((row: any) => (
                <li key={row.id} className="person-row">
                  <span className={`person-avatar ${avatarClass(row.teacher?.name)}`}>
                    {(row.teacher?.name || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="person-info">
                    <span className="person-name">{row.teacher?.name}</span>
                    <span className="person-email">{row.teacher?.email}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Вы ещё не записаны ни к одному учителю.</p>
          )}
        </section>
        </div>
      </main>
    </>
  )
}
