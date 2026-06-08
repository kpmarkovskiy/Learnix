'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const hhmm = (t: string) => t.slice(0, 5)

type Lesson = {
  id: string
  student_id: string
  date: string
  start_time: string
  end_time: string
  lesson_type: string
  status: string
}
type Student = { id: string; name: string }
type RescheduleVals = { date: string; start: string; end: string }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Запланировано', cls: 'badge-scheduled' },
  completed:  { label: 'Проведено',    cls: 'badge-completed' },
  cancelled:  { label: 'Отменено',     cls: 'badge-cancelled' },
}

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtSectionDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  const label = dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function DayBadge({ date, today, tomorrow }: { date: string; today: string; tomorrow: string }) {
  if (date === today) return (
    <span style={{
      marginLeft: 10, fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
      textTransform: 'uppercase', color: 'var(--accent-on)',
      background: 'var(--accent)', borderRadius: 6, padding: '2px 8px',
      verticalAlign: 'middle',
    }}>Сегодня</span>
  )
  if (date === tomorrow) return (
    <span style={{
      marginLeft: 10, fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
      textTransform: 'uppercase', color: 'var(--accent-strong)',
      background: 'var(--accent-soft)', border: '1px solid var(--accent)',
      borderRadius: 6, padding: '2px 8px', verticalAlign: 'middle',
    }}>Завтра</span>
  )
  return null
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{label}</span>
    </div>
  )
}

export function TeacherLessons({ students }: { students: Student[] }) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const [filterStudentId, setFilterStudentId] = useState<string>('all')
  // Подтверждение удаления: хранит id урока, ожидающего подтверждения
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Перенос урока: id переносимого урока + новые значения
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [rescheduleVals, setRescheduleVals] = useState<RescheduleVals>({ date: '', start: '', end: '' })
  const [rescheduleSaving, setRescheduleSaving] = useState(false)
  const supabase = createClient()

  const today = getToday()
  const tomorrow = getTomorrow()
  const nameOf = (id: string) => students.find(s => s.id === id)?.name ?? 'Ученик'

  async function load() {
    const ids = students.map(s => s.id)
    if (ids.length === 0) { setLoading(false); return }
    const { data } = await supabase
      .from('lessons')
      .select('id, student_id, date, start_time, end_time, lesson_type, status')
      .in('student_id', ids)
      .order('date')
      .order('start_time')
    setLessons((data ?? []) as Lesson[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ids = students.map(s => s.id)
    if (ids.length === 0) return
    const channel = supabase
      .channel('teacher-lessons-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lessons' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setStatus(l: Lesson, status: 'completed' | 'cancelled') {
    await supabase.from('lessons').update({ status }).eq('id', l.id)
    const dateLabel = new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    const text = status === 'completed'
      ? `Занятие ${dateLabel} в ${hhmm(l.start_time)} отмечено как проведённое`
      : `Занятие ${dateLabel} в ${hhmm(l.start_time)} отменено учителем`
    await supabase.rpc('create_notification', { p_user_id: l.student_id, p_text: text })
    load()
  }

  async function confirmRemove(l: Lesson) {
    setConfirmDeleteId(null)
    await supabase.from('lessons').delete().eq('id', l.id)
    const dateLabel = new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    await supabase.rpc('create_notification', {
      p_user_id: l.student_id,
      p_text: `Занятие ${dateLabel} в ${hhmm(l.start_time)} удалено`,
    })
    load()
  }

  function startReschedule(l: Lesson) {
    setRescheduleId(l.id)
    setRescheduleVals({ date: l.date, start: hhmm(l.start_time), end: hhmm(l.end_time) })
    setConfirmDeleteId(null)
  }

  async function doReschedule(l: Lesson) {
    if (!rescheduleVals.date || !rescheduleVals.start || !rescheduleVals.end) return
    if (rescheduleVals.start >= rescheduleVals.end) return
    setRescheduleSaving(true)
    await supabase.from('lessons').update({
      date: rescheduleVals.date,
      start_time: rescheduleVals.start + ':00',
      end_time:   rescheduleVals.end   + ':00',
    }).eq('id', l.id)
    const dateLabel = new Date(rescheduleVals.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    await supabase.rpc('create_notification', {
      p_user_id: l.student_id,
      p_text: `Занятие перенесено на ${dateLabel} в ${rescheduleVals.start}–${rescheduleVals.end}`,
    })
    setRescheduleId(null)
    setRescheduleSaving(false)
    load()
  }

  // Применяем фильтр по ученику
  const filtered = filterStudentId === 'all'
    ? lessons
    : lessons.filter(l => l.student_id === filterStudentId)

  // Статистика по отфильтрованным урокам
  const total = filtered.length
  const completed = filtered.filter(l => l.status === 'completed').length
  const cancelled = filtered.filter(l => l.status === 'cancelled').length
  const scheduled = filtered.filter(l => l.status === 'scheduled').length
  const resolved = completed + cancelled
  const pct = resolved > 0 ? Math.round((completed / resolved) * 100) : 0

  // Предстоящие: будущие запланированные (включая сегодня)
  const upcoming = filtered.filter(l => l.date >= today && l.status === 'scheduled')
  // История: прошедшие ИЛИ завершённые/отменённые
  const past = filtered.filter(l => l.date < today || l.status !== 'scheduled')

  function groupByDate(list: Lesson[]) {
    const map: Record<string, Lesson[]> = {}
    for (const l of list) (map[l.date] ??= []).push(l)
    return map
  }

  if (loading) return <p className="empty">Загрузка…</p>

  if (students.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
        <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: 15 }}>Ещё нет учеников.</p>
        <p style={{ margin: '6px 0 0', color: 'var(--text-faint)', fontSize: 13 }}>
          Поделитесь кодом приглашения на вкладке «Ученики».
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Фильтр по ученику */}
      {students.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-soft)', fontWeight: 500 }}>Ученик:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterStudentId('all')}
              style={{
                padding: '5px 14px', borderRadius: 999, border: '1px solid var(--border)',
                background: filterStudentId === 'all' ? 'var(--accent)' : 'var(--surface)',
                color: filterStudentId === 'all' ? 'var(--accent-on)' : 'var(--text)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
              }}
            >
              Все
            </button>
            {students.map(s => (
              <button
                key={s.id}
                onClick={() => setFilterStudentId(s.id)}
                style={{
                  padding: '5px 14px', borderRadius: 999, border: '1px solid var(--border)',
                  background: filterStudentId === s.id ? 'var(--accent)' : 'var(--surface)',
                  color: filterStudentId === s.id ? 'var(--accent-on)' : 'var(--text)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Карточка статистики */}
      {total > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 14 }}>Статистика посещаемости</h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatBox label="Всего уроков"   value={total} />
            <StatBox label="Проведено"      value={completed} color="var(--accent)" />
            <StatBox label="Отменено"       value={cancelled} color="var(--danger)" />
            <StatBox label="Предстоит"      value={scheduled} />
            {resolved > 0 && <StatBox label="% посещаемости" value={`${pct}%`} color="var(--accent)" />}
          </div>
          {resolved > 0 && (
            <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: 'var(--accent)', borderRadius: 999, transition: 'width .5s',
              }} />
            </div>
          )}
        </div>
      )}

      {/* Переключатель Предстоящие / История */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[
          { key: false, label: 'Предстоящие', count: upcoming.length },
          { key: true,  label: 'История',     count: past.length },
        ].map(({ key, label, count }) => (
          <button
            key={String(key)}
            className={`student-tab-btn ${showPast === key ? 'active' : ''}`}
            style={{
              border: 'none',
              borderBottom: `2px solid ${showPast === key ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
            }}
            onClick={() => setShowPast(key)}
          >
            {label}
            <span style={{
              marginLeft: 6, fontSize: 12,
              color: showPast === key ? 'var(--accent-strong)' : 'var(--text-faint)',
              background: showPast === key ? 'var(--accent-soft)' : 'var(--surface-2)',
              borderRadius: 999, padding: '1px 7px',
            }}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Список уроков */}
      {(() => {
        const display = showPast ? past : upcoming
        if (display.length === 0) return (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{showPast ? '📖' : '📅'}</div>
            <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: 14 }}>
              {showPast ? 'История пуста.' : 'Запланированных уроков нет.'}
            </p>
            {!showPast && (
              <p style={{ margin: '6px 0 0', color: 'var(--text-faint)', fontSize: 13 }}>
                Добавьте уроки на вкладке «Добавление уроков».
              </p>
            )}
          </div>
        )

        const grouped = groupByDate(display)
        const dates = Object.keys(grouped).sort(
          showPast ? (a, b) => b.localeCompare(a) : (a, b) => a.localeCompare(b)
        )

        return dates.map(d => {
          const isToday = d === today
          return (
            <section
              key={d}
              className="card"
              style={{
                marginBottom: 12,
                borderColor: isToday ? 'var(--accent)' : undefined,
                background: isToday ? 'var(--accent-soft)' : undefined,
              }}
            >
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>
                {fmtSectionDate(d)}
                <DayBadge date={d} today={today} tomorrow={tomorrow} />
              </h3>
              <ul className="lesson-list">
                {grouped[d].map(l => (
                  <li key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* Режим переноса */}
                    {rescheduleId === l.id ? (
                      <div style={{
                        padding: '12px 14px',
                        border: '1px solid var(--accent)',
                        borderRadius: 10,
                        background: 'var(--accent-soft)',
                      }}>
                        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)' }}>
                          Перенос урока · {nameOf(l.student_id)}
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)' }}>Дата</span>
                            <input
                              type="date"
                              value={rescheduleVals.date}
                              min={today}
                              onChange={e => setRescheduleVals(v => ({ ...v, date: e.target.value }))}
                              style={{
                                padding: '7px 10px', border: '1px solid var(--border)',
                                borderRadius: 8, background: 'var(--surface)',
                                color: 'var(--text)', fontSize: 13,
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)' }}>Начало</span>
                            <input
                              type="time"
                              value={rescheduleVals.start}
                              onChange={e => setRescheduleVals(v => ({ ...v, start: e.target.value }))}
                              style={{
                                padding: '7px 10px', border: '1px solid var(--border)',
                                borderRadius: 8, background: 'var(--surface)',
                                color: 'var(--text)', fontSize: 13,
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)' }}>Конец</span>
                            <input
                              type="time"
                              value={rescheduleVals.end}
                              onChange={e => setRescheduleVals(v => ({ ...v, end: e.target.value }))}
                              style={{
                                padding: '7px 10px', border: '1px solid var(--border)',
                                borderRadius: 8, background: 'var(--surface)',
                                color: 'var(--text)', fontSize: 13,
                              }}
                            />
                          </div>
                          <button
                            className="lesson-save"
                            style={{ padding: '8px 14px', fontSize: 13 }}
                            onClick={() => doReschedule(l)}
                            disabled={rescheduleSaving}
                          >
                            {rescheduleSaving ? '…' : 'Сохранить'}
                          </button>
                          <button
                            className="lesson-cancel"
                            onClick={() => setRescheduleId(null)}
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Обычный вид урока */
                      <div
                        className="lesson-item"
                        style={{ background: isToday ? 'var(--surface)' : undefined, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <span className="lesson-when">
                            {nameOf(l.student_id)}
                            <span className="lesson-time">{hhmm(l.start_time)}–{hhmm(l.end_time)}</span>
                            <span
                              className={`badge ${l.lesson_type === 'group' ? 'badge-grp' : 'badge-ind'}`}
                              style={{ marginLeft: 8 }}
                            >
                              {l.lesson_type === 'group' ? 'Групповое' : 'Индивид.'}
                            </span>
                          </span>
                          <span className="lesson-actions">
                            {l.status === 'scheduled' ? (
                              <>
                                <button
                                  className="lesson-save"
                                  style={{ fontSize: 13, padding: '5px 12px' }}
                                  onClick={() => { setStatus(l, 'completed'); setConfirmDeleteId(null) }}
                                >
                                  Провёл
                                </button>
                                <button className="lesson-cancel" onClick={() => { setStatus(l, 'cancelled'); setConfirmDeleteId(null) }}>
                                  Отменил
                                </button>
                                <button className="lesson-cancel" style={{ color: 'var(--text-soft)' }} onClick={() => startReschedule(l)}>
                                  Перенести
                                </button>
                                <button
                                  className="lesson-cancel"
                                  style={{ color: confirmDeleteId === l.id ? 'var(--danger)' : undefined }}
                                  onClick={() => setConfirmDeleteId(confirmDeleteId === l.id ? null : l.id)}
                                >
                                  Удалить
                                </button>
                              </>
                            ) : (
                              <span className={`badge ${STATUS_META[l.status]?.cls}`}>
                                {STATUS_META[l.status]?.label}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Подтверждение удаления — инлайн под строкой */}
                        {confirmDeleteId === l.id && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px',
                            background: 'var(--surface-2)',
                            borderRadius: 8,
                            border: '1px solid var(--danger)',
                          }}>
                            <span style={{ fontSize: 13, color: 'var(--text-soft)', flex: 1 }}>
                              Удалить урок? Это действие нельзя отменить.
                            </span>
                            <button
                              style={{
                                padding: '5px 14px', borderRadius: 8, border: 'none',
                                background: 'var(--danger)', color: '#fff',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              }}
                              onClick={() => confirmRemove(l)}
                            >
                              Да, удалить
                            </button>
                            <button className="lesson-cancel" onClick={() => setConfirmDeleteId(null)}>
                              Отмена
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      })()}
    </div>
  )
}
