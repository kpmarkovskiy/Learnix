'use client'
 
import { useState } from 'react'
import { EnrollForm } from '@/components/enroll-form'
import { AvailabilityManager } from '@/components/availability-manager'
import { Chat } from '@/components/chat'
import { NextLessonCountdown } from '@/components/next-lesson-countdown'
 
type Lesson = {
  id: string
  date: string
  start_time: string
  end_time: string
  status: string
  teacher?: { name: string }
}
type Teacher = { id: string; name: string }
type Tab = 'schedule' | 'availability' | 'teachers' | 'chat'
 
const hhmm = (t: string) => t.slice(0, 5)
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
 
const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Запланировано', cls: 'badge-scheduled' },
  completed: { label: 'Проведено', cls: 'badge-completed' },
  cancelled: { label: 'Отменено', cls: 'badge-cancelled' },
}
 
const AV = ['av-coral', 'av-blue', 'av-violet', 'av-teal', 'av-amber']
function avatarClass(name?: string) {
  const s = name || '?'
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV[Math.abs(h) % AV.length]
}
 
const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule', label: 'Расписание' },
  { id: 'availability', label: 'Моё время' },
  { id: 'teachers', label: 'Учителя' },
  { id: 'chat', label: 'Чат' },
]
 
export function StudentTabs({
  lessons,
  teachers,
  currentUserId,
}: {
  lessons: Lesson[]
  teachers: Teacher[]
  currentUserId: string
}) {
  const [tab, setTab] = useState<Tab>('schedule')
 
  return (
    <div>
      <nav className="student-tabs-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`student-tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
 
      {tab === 'schedule' && (
        <div className="student-tab-content">
          <NextLessonCountdown lessons={lessons} />
          <section className="card">
            <h3>Мои занятия</h3>
            {lessons.length > 0 ? (
              <ul className="lesson-list">
                {lessons.map((l) => (
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
 
          <section className="card" style={{ marginTop: 20 }}>
            <h3>Записаться к учителю</h3>
            <p className="card-hint">Введите код, который дал вам учитель.</p>
            <EnrollForm />
          </section>
        </div>
      )}
 
      {tab === 'availability' && (
        <div className="student-tab-content">
          <section className="card">
            <h3>Моё свободное время</h3>
            <p className="card-hint">
              Укажите, когда вам удобно заниматься — учитель увидит эти окна и назначит уроки.
            </p>
            <AvailabilityManager />
          </section>
        </div>
      )}
 
      {tab === 'teachers' && (
        <div className="student-tab-content">
          <section className="card">
            <h3>Мои учителя</h3>
            {teachers.length > 0 ? (
              <ul className="people-list">
                {teachers.map((t) => (
                  <li key={t.id} className="person-row">
                    <span className={`person-avatar ${avatarClass(t.name)}`}>
                      {t.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="person-info">
                      <span className="person-name">{t.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Вы ещё не записаны ни к одному учителю.</p>
            )}
          </section>
        </div>
      )}
 
      {tab === 'chat' && (
        <div className="student-tab-content">
          <Chat peers={teachers} currentUserId={currentUserId} />
        </div>
      )}
    </div>
  ) } 
