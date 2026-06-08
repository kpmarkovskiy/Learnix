import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/notification-bell'
import { StudentTabs } from '@/components/student-tabs'

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

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, date, start_time, end_time, status, teacher:profiles!lessons_teacher_id_fkey(name)')
    .eq('student_id', user.id)
    .order('date')
    .order('start_time')

  const teacherList = (teachers ?? [])
    .map((r: any) => ({ id: r.teacher?.id, name: r.teacher?.name }))
    .filter((t: any) => t.id)

  return (
    <>
      <header className="dash-header">
        <div className="brand-mark">Learn<span>ix</span></div>
        <div className="header-actions">
          <NotificationBell />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="dash-main">
        <h1>Привет, {profile?.name || 'ученик'}</h1>
        <p className="lead">Ваше расписание и задания</p>

        <div className="student-top-tabs">
          <StudentTabs
            lessons={lessons ?? []}
            teachers={teacherList}
            currentUserId={user.id}
          />
        </div>
      </main>
    </>
  )
}