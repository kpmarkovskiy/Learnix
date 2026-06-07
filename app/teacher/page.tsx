import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { CopyCode } from '@/components/copy-code'

// Подбираем цвет аватарки по имени — чтобы список был «живым».
const AV = ['av-coral', 'av-blue', 'av-violet', 'av-teal', 'av-amber']
function avatarClass(name?: string) {
  const s = name || '?'
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV[Math.abs(h) % AV.length]
}

export default async function TeacherPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, invite_code')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'teacher') redirect('/student')

  const { data: students } = await supabase
    .from('enrollments')
    .select('id, student:profiles!enrollments_student_id_fkey(id, name, email)')
    .eq('teacher_id', user.id)

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
        <h1>Здравствуйте, {profile?.name || 'учитель'}</h1>
        <p className="lead">Кабинет учителя</p>

        <section className="card">
          <h3>Код приглашения</h3>
          <p className="card-hint">
            Передайте этот код ученикам — по нему они запишутся к вам.
          </p>
          <div className="code-row">
            <span className="code-value">{profile?.invite_code ?? '—'}</span>
            {profile?.invite_code && <CopyCode code={profile.invite_code} />}
          </div>
        </section>

        <section className="card">
          <h3>Мои ученики</h3>
          {students && students.length > 0 ? (
            <ul className="people-list">
              {students.map((row: any) => (
                <li key={row.id}>
                  <Link
                    href={`/teacher/students/${row.student?.id}`}
                    className="person-row person-link"
                  >
                    <span className={`person-avatar ${avatarClass(row.student?.name)}`}>
                      {(row.student?.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="person-info">
                      <span className="person-name">{row.student?.name}</span>
                      <span className="person-email">{row.student?.email}</span>
                    </span>
                    <span className="person-chevron">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Пока никто не записался. Поделитесь кодом выше.</p>
          )}
        </section>
      </main>
    </>
  )
}
