'use client'

import { useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { SignOutButton } from '@/components/sign-out-button'
import { TeacherStudents } from '@/components/teacher-students'
import { TeacherAddLesson } from '@/components/teacher-add-lesson'
import { TeacherLessons } from '@/components/teacher-lessons'
import { TeacherHomework } from '@/components/teacher-homework'
import { NotificationBell } from '@/components/notification-bell'
import { Chat } from '@/components/chat'
import { ProfileEdit } from '@/components/profile-edit'

type Student = { id: string; name: string; email: string }
type Tab = 'students' | 'add' | 'lessons' | 'homework' | 'chat' | 'profile'

const NAV: { id: Tab; label: string }[] = [
  { id: 'students', label: 'Ученики' },
  { id: 'add',      label: 'Добавление уроков' },
  { id: 'lessons',  label: 'Просмотр уроков' },
  { id: 'homework', label: 'Задания' },
  { id: 'chat',     label: 'Чат' },
  { id: 'profile',  label: 'Профиль' },
]

export function TeacherWorkspace({
  name,
  inviteCode,
  students,
  currentUserId,
}: {
  name: string
  inviteCode: string | null
  students: Student[]
  currentUserId: string
}) {
  const [tab, setTab] = useState<Tab>('students')
  const slim = students.map((s) => ({ id: s.id, name: s.name }))

  return (
    <div className="shell">
      <div style={{ position: 'fixed', top: 16, right: 24, zIndex: 200 }}>
        <NotificationBell />
      </div>
      <aside className="shell-side">
        <div className="shell-brand">Learn<span>ix</span></div>

        <nav className="shell-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`shell-tab ${tab === n.id ? 'active' : ''}`}
              onClick={() => setTab(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="shell-foot">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </aside>

      <main className="shell-main">
        <header className="shell-head">
          <h1>{NAV.find((n) => n.id === tab)?.label}</h1>
          {tab === 'students' && <p className="lead">Здравствуйте, {name}</p>}
        </header>

        {tab === 'students'  && <TeacherStudents students={slim} inviteCode={inviteCode} />}
        {tab === 'add'       && <TeacherAddLesson students={slim} />}
        {tab === 'lessons'   && <TeacherLessons students={slim} />}
        {tab === 'homework'  && <TeacherHomework students={slim} />}
        {tab === 'chat'      && <Chat peers={slim} currentUserId={currentUserId} />}
        {tab === 'profile'   && <ProfileEdit />}
      </main>
    </div>
  )
}
