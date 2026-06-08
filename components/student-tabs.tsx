'use client'

import { useState } from 'react'
import { EnrollForm } from '@/components/enroll-form'
import { AvailabilityManager } from '@/components/availability-manager'
import { Chat } from '@/components/chat'
import { StudentHomework } from '@/components/student-homework'

type Lesson = {
  id: string
  date: string
  start_time: string
  end_time: string
  status: string
  teacher?: { name: string }
}
type Teacher = { id: string; name: string }
type Tab = 'schedule' | 'homework' | 'availability' | 'teachers' | 'chat'

const hhmm = (t: string) => t.slice(0, 5)
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Запланировано', cls: 'badge-scheduled' },
  completed:  { label: 'Проведено',    cls: 'badge-completed' },
  cancelled:  { label: 'Отменено',     cls: 'badge-cancelled' },
}

const AV = ['av-coral', 'av-blue', 'av-violet', 'av-teal', 'av-amber']
function avatarClass(name?: string) {
  const s = name || '?'; let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV[Math.abs(h) % AV.length]
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule',     label: 'Расписание' },
  { id: 'homework',     label: 'Задания' },
  { id: 'availability', label: 'Моё время' },
  { id: 'teachers',     label: 'Учителя' },
  { id: 'chat',         label: 'Чат' },
]

function StatMini({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{label}</span>
    </div>
  )
}

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
  const [showPast, setShowPast] = useState(false)

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Upcoming: future scheduled
  const upcoming = lessons.filter((l) => l.date >= todayStr && l.status === 'scheduled')
  // History: past date OR already resolved
  const past = lessons.filter((l) => l.date < todayStr || l.status !== 'scheduled')

  // Attendance stats (all lessons)
  const total = lessons.length
  const completed = lessons.filter((l) => l.status === 'completed').length
  const cancelled = lessons.filter((l) => l.status === 'cancelled').length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

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

      {/* ── Расписание ── */}
      {tab === 'schedule' && (
        <div className="student-tab-content">

          {/* Attendance stats */}
          {total > 0 && (
            <section className="card">
              <h3 style={{ marginBottom: 12 }}>Посещаемость</h3>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
                <StatMini label="Всего уроков"   value={total} />
                <StatMini label="Проведено"      value={completed} color="var(--accent)" />
                <StatMini label="Отменено"       value={cancelled} color="var(--danger)" />
                <StatMini label="% посещаемости" value={`${pct}%`} color="var(--accent)" />
              </div>
              <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width .5s' }} />
              </div>
            </section>
          )}

          {/* Toggle upcoming / history */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginTop: 20 }}>
            {[
              { key: false, label: `Предстоящие (${upcoming.length})` },
              { key: true,  label: `История (${past.length})` },
            ].map(({ key, label }) => (
              <button
                key={String(key)}
                className={`student-tab-btn ${showPast === key ? 'active' : ''}`}
                style={{ border: 'none', borderBottom: `2px solid ${showPast === key ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}
                onClick={() => setShowPast(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="card" style={{ marginTop: 12 }}>
            {(() => {
              const display = showPast ? past : upcoming
              if (display.length === 0)
                return <p className="empty">{showPast ? 'История пуста.' : 'Предстоящих занятий нет.'}</p>
              return (
                <ul className="lesson-list">
                  {display.map((l) => (
                    <li key={l.id} className="lesson-item">
                      <span className="lesson-when">
                        {fmtDate(l.date)}
                        <span className="lesson-time">{hhmm(l.start_time)}–{hhmm(l.end_time)}</span>
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
              )
            })()}
          </section>

          <section className="card" style={{ marginTop: 20 }}>
            <h3>Записаться к учителю</h3>
            <p className="card-hint">Введите код, который дал вам учитель.</p>
            <EnrollForm />
          </section>
        </div>
      )}

      {/* ── Задания ── */}
      {tab === 'homework' && (
        <div className="student-tab-content">
          <StudentHomework />
        </div>
      )}

      {/* ── Моё время ── */}
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

      {/* ── Учителя ── */}
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

      {/* ── Чат ── */}
      {tab === 'chat' && (
        <div className="student-tab-content">
          <Chat peers={teachers} currentUserId={currentUserId} />
        </div>
      )}
    </div>
  )
}
