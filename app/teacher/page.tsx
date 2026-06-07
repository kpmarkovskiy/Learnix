import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TeacherWorkspace } from '@/components/teacher-workspace'

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

  const studentList = (students ?? [])
    .map((r: any) => ({ id: r.student?.id, name: r.student?.name, email: r.student?.email }))
    .filter((s: any) => s.id)

  return (
    <TeacherWorkspace
      name={profile?.name || 'учитель'}
      inviteCode={profile?.invite_code ?? null}
      students={studentList}
      currentUserId={user.id}
    />
  )
}
