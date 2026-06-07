import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { LessonScheduler } from '@/components/lesson-scheduler'

// Папка [id] — динамический маршрут. id из адреса /teacher/students/<id>
// приходит в params (в Next 15 это промис, поэтому await).
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Проверяем, что этот ученик действительно записан к этому учителю.
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('teacher_id', user.id)
    .eq('student_id', id)
    .maybeSingle()
  if (!enrollment) redirect('/teacher')

  const { data: student } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', id)
    .single()

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
        <Link href="/teacher" className="back-link">‹ Мои ученики</Link>
        <h1>{student?.name || 'Ученик'}</h1>
        <p className="lead">{student?.email}</p>

        <LessonScheduler studentId={id} studentName={student?.name || 'ученик'} />
      </main>
    </>
  )
}
