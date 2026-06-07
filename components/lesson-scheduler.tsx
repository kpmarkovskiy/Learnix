'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const hhmm = (t: string) => t.slice(0, 5)

// Время с шагом 30 минут (06:00 … 23:30)
const TIMES: string[] = []
for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) TIMES.push(`${String(h).padStart(2, '0')}:${m}`)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })

const todayStr = (() => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate()
  ).padStart(2, '0')}`
})()

type Slot = { id: string; date: string; start_time: string; end_time: string }
type Lesson = {
  id: string
  date: string
  start_time: string
  end_time: string
  status: 'scheduled' | 'completed' | 'cancelled'
}

const STATUS: Record<Lesson['status'], { label: string; cls: string }> = {
  scheduled: { label: 'Запланировано', cls: 'badge-scheduled' },
  completed: { label: 'Проведено', cls: 'badge-completed' },
  cancelled: { label: 'Отменено', cls: 'badge-cancelled' },
}

export function LessonScheduler({
  studentId,
  studentName,
}: {
  studentId: string
  studentName: string
}) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [date, setDate] = useState(todayStr)
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    // Свободные окна ученика (учитель видит их по RLS-политике is_teacher()).
    const { data: a } = await supabase
      .from('availability')
      .select('id, date, start_time, end_time')
      .eq('student_id', studentId)
      .gte('date', todayStr)
      .order('date')
      .order('start_time')
    setSlots((a ?? []) as Slot[])

    // Занятия с этим учеником (RLS отдаёт только уроки текущего учителя).
    const { data: l } = await supabase
      .from('lessons')
      .select('id, date, start_time, end_time, status')
      .eq('student_id', studentId)
      .gte('date', todayStr)
      .order('date')
      .order('start_time')
    setLessons((l ?? []) as Lesson[])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Подставить окно в форму по клику
  function useWindow(s: Slot) {
    setDate(s.date)
    setStart(hhmm(s.start_time))
    setEnd(hhmm(s.end_time))
    setError(null)
  }

  async function schedule() {
    setError(null)
    if (!date) {
      setError('Выберите дату')
      return
    }
    if (start >= end) {
      setError('Начало должно быть раньше конца')
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error: insErr } = await supabase.from('lessons').insert({
      teacher_id: user.id,
      student_id: studentId,
      date,
      start_time: start,
      end_time: end,
    })
    if (insErr) {
      // 23P01 — нарушение exclusion-констрейнта (пересечение уроков)
      if (insErr.code === '23P01' || /no_overlap/i.test(insErr.message)) {
        setError('На это время уже есть занятие')
      } else {
        setError(insErr.message)
      }
      return
    }

    // Уведомление ученику (единая функция из базы).
    await supabase.rpc('create_notification', {
      p_user_id: studentId,
      p_text: `Новое занятие ${fmtDate(date)} в ${start}`,
    })

    load()
  }

  async function cancel(lesson: Lesson) {
    await supabase.from('lessons').update({ status: 'cancelled' }).eq('id', lesson.id)
    await supabase.rpc('create_notification', {
      p_user_id: studentId,
      p_text: `Занятие ${fmtDate(lesson.date)} отменено`,
    })
    load()
  }

  async function remove(lesson: Lesson) {
    await supabase.from('lessons').delete().eq('id', lesson.id)
    load()
  }

  const hasSlots = useMemo(() => slots.length > 0, [slots])

  return (
    <>
      <section className="card">
        <h3>Свободное время ученика</h3>
        <p className="card-hint">
          Нажмите на окно, чтобы подставить его в форму ниже.
        </p>
        {hasSlots ? (
          <div className="chips">
            {slots.map((s) => (
              <button key={s.id} className="chip" onClick={() => useWindow(s)}>
                {fmtDate(s.date)} · {hhmm(s.start_time)}–{hhmm(s.end_time)}
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">{studentName} ещё не указал свободное время.</p>
        )}
      </section>

      <section className="card">
        <h3>Назначить занятие</h3>
        <div className="avail-form">
          <div className="avail-field">
            <label>Дата</label>
            <input
              type="date"
              min={todayStr}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="avail-field">
            <label>С</label>
            <select value={start} onChange={(e) => setStart(e.target.value)}>
              {TIMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="avail-field">
            <label>До</label>
            <select value={end} onChange={(e) => setEnd(e.target.value)}>
              {TIMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button className="btn avail-add" onClick={schedule}>
            Назначить
          </button>
        </div>
        {error && <p className="enroll-msg-err">{error}</p>}
      </section>

      <section className="card">
        <h3>Занятия</h3>
        {lessons.length > 0 ? (
          <ul className="lesson-list">
            {lessons.map((l) => (
              <li key={l.id} className="lesson-item">
                <span className="lesson-when">
                  {fmtDate(l.date)}
                  <span className="lesson-time">
                    {hhmm(l.start_time)}–{hhmm(l.end_time)}
                  </span>
                </span>
                <span className="lesson-actions">
                  <span className={`badge ${STATUS[l.status].cls}`}>
                    {STATUS[l.status].label}
                  </span>
                  {l.status === 'scheduled' && (
                    <button className="lesson-cancel" onClick={() => cancel(l)}>
                      Отменить
                    </button>
                  )}
                  {l.status === 'cancelled' && (
                    <button className="lesson-cancel" onClick={() => remove(l)}>
                      Удалить
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Занятий пока нет.</p>
        )}
      </section>
    </>
  )
}
