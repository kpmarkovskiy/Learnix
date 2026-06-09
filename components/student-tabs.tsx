'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EnrollForm } from '@/components/enroll-form'
import { AvailabilityManager } from '@/components/availability-manager'
import { Chat } from '@/components/chat'
import { NextLessonCountdown } from '@/components/next-lesson-countdown'
import { StudentHomework } from '@/components/student-homework'
import { ProfileEdit } from '@/components/profile-edit'
import { CancelLessonModal } from '@/components/cancel-lesson-modal'

type Lesson = {
  id: string
  date: string
  start_time: string
  end_time: string
  status: string
  teacher_id?: string
  teacher?: { name: string }
}
type Teacher = { id: string; name: string }
type Tab = 'schedule' | 'availability' | 'teachers' | 'homework' | 'chat' | 'profile'

const hhmm = (t: string) => t.slice(0, 5)

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

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function DayBadge({ date }: { date: string }) {
  const td = todayStr(), tm = tomorrowStr()
  if (date === td) return (
    <span style={{
      marginLeft: 10, fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
      textTransform: 'uppercase', color: 'var(--accent-on)',
      background: 'var(--accent)', borderRadius: 6, padding: '2px 8px',
      verticalAlign: 'middle',
    }}>Сегодня</span>
  )
  if (date === tm) return (
    <span style={{
      marginLeft: 10, fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
      textTransform: 'uppercase', color: 'var(--accent-strong)',
      background: 'var(--accent-soft)', borderRadius: 6, padding: '2px 8px',
      border: '1px solid var(--accent)', verticalAlign: 'middle',
    }}>Завтра</span>
  )
  return null
}

function groupByDate(list: Lesson[]) {
  const map: Record<string, Lesson[]> = {}
  for (const l of list) (map[l.date] ??= []).push(l)
  return map
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule',     label: 'Расписание' },
  { id: 'availability', label: 'Моё время' },
  { id: 'teachers',     label: 'Учителя' },
  { id: 'homework',     label: 'Задания' },
  { id: 'chat',         label: 'Чат' },
  { id: 'profile',      label: 'Профиль' },
]

export function StudentTabs({
  teachers,
  currentUserId,
}: {
  teachers: Teacher[]
  currentUserId: string
}) {
  const [tab, setTab] = useState<Tab>('schedule')
  const [showHistory, setShowHistory] = useState(false)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [cancelModal, setCancelModal] = useState<{ lesson: Lesson } | null>(null)
  const [pendingHwCount, setPendingHwCount] = useState<number>(0)
  const supabase = createClient()

  async function loadLessons() {
    const { data } = await supabase
      .from('lessons')
      .select('id, date, start_time, end_time, status, teacher_id, teacher:profiles!lessons_teacher_id_fkey(name)')
      .eq('student_id', currentUserId)
      .order('date')
      .order('start_time')
    const mapped = (data ?? []).map((l: any) => ({
      ...l,
      teacher: Array.isArray(l.teacher) ? l.teacher[0] : l.teacher,
    }))
    setLessons(mapped as Lesson[])
  }

  async function cancelLesson(l: Lesson, reason: string, comment: string) {
    await supabase.from('lessons').update({ status: 'cancelled' }).eq('id', l.id)
    const dateLabel = new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    let text = `Занятие ${dateLabel} в ${hhmm(l.start_time)} отменено учеником`
    if (reason) text += `. Причина: ${reason}`
    if (comment) text += `. Комментарий: ${comment}`
    if (l.teacher_id) {
      await supabase.rpc('create_notification', { p_user_id: l.teacher_id, p_text: text })
    }
    loadLessons()
  }

  async function loadPendingHw() {
    const { data: hw } = await supabase.from('homework').select('id')
    const { data: subs } = await supabase
      .from('homework_submissions')
      .select('homework_id')
      .eq('student_id', currentUserId)
    const submittedIds = new Set((subs ?? []).map((s: { homework_id: string }) => s.homework_id))
    const pending = (hw ?? []).filter((h: { id: string }) => !submittedIds.has(h.id))
    setPendingHwCount(pending.length)
  }

  useEffect(() => {
    loadLessons()
    loadPendingHw()
    const channel = supabase
      .channel('student-lessons-' + currentUserId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'lessons',
        filter: `student_id=eq.${currentUserId}`,
      }, () => loadLessons())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homework_submissions' }, () => loadPendingHw())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homework' }, () => loadPendingHw())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  const td = todayStr()

  // Предстоящие: будущие запланированные (включая сегодня)
  const upcoming = lessons.filter(l => l.date >= td && l.status === 'scheduled')
  // История: прошедшие ИЛИ уже завершённые/отменённые
  const history = lessons
    .filter(l => l.date < td || l.status !== 'scheduled')
    .slice()
    .reverse()   // новые сверху

  // Статистика посещаемости
  const resolved = lessons.filter(l => l.status === 'completed' || l.status === 'cancelled')
  const completedCount = lessons.filter(l => l.status === 'completed').length
  const cancelledCount = lessons.filter(l => l.status === 'cancelled').length
  const attendancePct = resolved.length > 0
    ? Math.round((completedCount / resolved.length) * 100)
    : null

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
            {t.id === 'homework' && pendingHwCount > 0 && (
              <span style={{
                marginLeft: 5,
                fontSize: 11, fontWeight: 700,
                background: tab === t.id ? 'var(--accent)' : 'var(--danger)',
                color: '#fff',
                borderRadius: 999,
                padding: '1px 6px',
                lineHeight: 1.5,
              }}>
                {pendingHwCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Расписание ── */}
      {tab === 'schedule' && (
        <div className="student-tab-content">

          {/* Таймер до следующего урока */}
          <NextLessonCountdown lessons={lessons} />

          {/* Статистика посещаемости — только если есть завершённые/отменённые */}
          {resolved.length > 0 && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)' }}>
                  Посещаемость
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
                  {attendancePct}%
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{
                  height: '100%',
                  width: `${attendancePct ?? 0}%`,
                  background: 'var(--accent)',
                  borderRadius: 999,
                  transition: 'width .5s ease',
                }} />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
                  <strong style={{ color: 'var(--accent-strong)' }}>{completedCount}</strong> проведено
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
                  <strong style={{ color: 'var(--danger)' }}>{cancelledCount}</strong> отменено
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
                  <strong style={{ color: 'var(--text)' }}>{upcoming.length}</strong> предстоит
                </span>
              </div>
            </div>
          )}

          {/* Переключатель Предстоящие / История */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
            {[
              { key: false, label: `Предстоящие`, count: upcoming.length },
              { key: true,  label: `История`,     count: history.length },
            ].map(({ key, label, count }) => (
              <button
                key={String(key)}
                className={`student-tab-btn ${showHistory === key ? 'active' : ''}`}
                style={{
                  border: 'none',
                  borderBottom: `2px solid ${showHistory === key ? 'var(--accent)' : 'transparent'}`,
                  marginBottom: -1,
                }}
                onClick={() => setShowHistory(key)}
              >
                {label}
                <span style={{
                  marginLeft: 6, fontSize: 12,
                  color: showHistory === key ? 'var(--accent-strong)' : 'var(--text-faint)',
                  background: showHistory === key ? 'var(--accent-soft)' : 'var(--surface-2)',
                  borderRadius: 999, padding: '1px 7px',
                }}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Список уроков */}
          {!showHistory ? (
            /* Предстоящие — сгруппированы по дате */
            upcoming.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 20px',
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: 14 }}>
                  Предстоящих занятий нет.
                </p>
                <p style={{ margin: '6px 0 0', color: 'var(--text-faint)', fontSize: 13 }}>
                  Запишитесь к учителю по коду приглашения ниже.
                </p>
              </div>
            ) : (
              (() => {
                const grouped = groupByDate(upcoming)
                const dates = Object.keys(grouped).sort()
                return dates.map(d => (
                  <section
                    key={d}
                    className="card"
                    style={{
                      marginBottom: 12,
                      borderColor: d === td ? 'var(--accent)' : undefined,
                      background: d === td ? 'var(--accent-soft)' : undefined,
                    }}
                  >
                    <h3 style={{ fontSize: 15, marginBottom: 12, textTransform: 'capitalize' }}>
                      {fmtDate(d)}
                      <DayBadge date={d} />
                    </h3>
                    <ul className="lesson-list">
                      {grouped[d].map(l => (
                        <li key={l.id} className="lesson-item" style={{
                          background: 'var(--surface)',
                          borderColor: 'var(--border)',
                        }}>
                          <span className="lesson-when">
                            {hhmm(l.start_time)}–{hhmm(l.end_time)}
                            {l.teacher?.name && (
                              <span className="lesson-time" style={{ marginLeft: 8 }}>
                                · {l.teacher.name}
                              </span>
                            )}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`badge ${STATUS[l.status]?.cls ?? ''}`}>
                              {STATUS[l.status]?.label ?? l.status}
                            </span>
                            <button
                              className="lesson-cancel"
                              onClick={() => setCancelModal({ lesson: l })}
                              style={{ fontSize: 12 }}
                            >
                              Отменить
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              })()
            )
          ) : (
            /* История — плоский список от новых к старым */
            history.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 20px',
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📖</div>
                <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: 14 }}>История пуста.</p>
                <p style={{ margin: '6px 0 0', color: 'var(--text-faint)', fontSize: 13 }}>
                  Завершённые занятия будут отображаться здесь.
                </p>
              </div>
            ) : (
              <div className="card">
                <ul className="lesson-list">
                  {history.map(l => (
                    <li key={l.id} className="lesson-item">
                      <span className="lesson-when">
                        {new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', {
                          day: 'numeric', month: 'short',
                        })}
                        <span className="lesson-time" style={{ marginLeft: 8 }}>
                          {hhmm(l.start_time)}–{hhmm(l.end_time)}
                        </span>
                        {l.teacher?.name && (
                          <span className="lesson-time"> · {l.teacher.name}</span>
                        )}
                      </span>
                      <span className={`badge ${STATUS[l.status]?.cls ?? ''}`}>
                        {STATUS[l.status]?.label ?? l.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}

          {/* Запись к учителю */}
          <section className="card" style={{ marginTop: 20 }}>
            <h3>Записаться к учителю</h3>
            <p className="card-hint">Введите код, который дал вам учитель.</p>
            <EnrollForm />
          </section>
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
                {teachers.map(t => (
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
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>👨‍🏫</div>
                <p className="empty">Вы ещё не записаны ни к одному учителю.</p>
                <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>
                  Перейдите на вкладку «Расписание» и введите код приглашения.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Задания ── */}
      {tab === 'homework' && (
        <div className="student-tab-content">
          <StudentHomework />
        </div>
      )}

      {/* ── Чат ── */}
      {tab === 'chat' && (
        <div className="student-tab-content">
          <Chat peers={teachers} currentUserId={currentUserId} />
        </div>
      )}

      {/* ── Профиль ── */}
      {tab === 'profile' && (
        <div className="student-tab-content">
          <ProfileEdit />
        </div>
      )}
    {cancelModal && (
        <CancelLessonModal
          role="student"
          lessonDate={`${new Date(cancelModal.lesson.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${hhmm(cancelModal.lesson.start_time)}`}
          onClose={() => setCancelModal(null)}
          onConfirm={(reason, comment) => {
            cancelLesson(cancelModal.lesson, reason, comment)
            setCancelModal(null)
          }}
        />
      )}
    </div>
  )
}
