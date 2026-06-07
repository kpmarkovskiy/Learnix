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

  const { data: teachers } = await supabase
    .from('enrollments')
    .select('id, teacher:profiles!enrollments_teacher_id_fkey(id, name, email)')
    .eq('student_id', user.id)

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

        <section className="card">
          <h3>Записаться к учителю</h3>
          <p className="card-hint">Введите код, который дал вам учитель.</p>
          <EnrollForm />
        </section>

        <section className="card">
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
      </main>
    </>
  )
}
