'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const hhmm = (t: string) => t.slice(0, 5)
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

const TIMES: string[] = []
for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) TIMES.push(`${String(h).padStart(2, '0')}:${m}`)

const todayStr = (() => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
})()

type Slot = { id: string; date: string; start_time: string; end_time: string }
type Student = { id: string; name: string }

export function LessonForm({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? '')
  const [slots, setSlots] = useState<Slot[]>([])
  const [date, setDate] = useState('')
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const supabase = createClient()

  // Грузим свободные окна выбранного ученика.
  useEffect(() => {
    setDate('')
    setError(null)
    setOk(null)
    if (!studentId) {
      setSlots([])
      return
    }
    supabase
      .from('availability')
      .select('id, date, start_time, end_time')
      .eq('student_id', studentId)
      .gte('date', todayStr)
      .order('date')
      .order('start_time')
      .then(({ data }) => setSlots((data ?? []) as Slot[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  // Доступные даты — только те, где у ученика есть окна.
  const dates = useMemo(() => Array.from(new Set(slots.map((s) => s.date))), [slots])
  const daySlots = date ? slots.filter((s) => s.date === date) : []

  // При выборе даты подставляем время первого окна.
  useEffect(() => {
    const w = slots.find((s) => s.date === date)
    if (w) {
      setStart(hhmm(w.start_time))
      setEnd(hhmm(w.end_time))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function schedule() {
    setError(null)
    setOk(null)
    if (!studentId) return setError('Выберите ученика')
    if (!date) return setError('Выберите дату')
    if (start >= end) return setError('Начало должно быть раньше конца')

    // Время должно целиком помещаться в одно свободное окно.
    const inWindow = daySlots.some(
      (s) => hhmm(s.start_time) <= start && hhmm(s.end_time) >= end
    )
    if (!inWindow) return setError('Это время вне свободных окон ученика')

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
      if (insErr.code === '23P01' || /no_overlap/i.test(insErr.message)) {
        setError('На это время уже есть занятие')
      } else if (/свободн/i.test(insErr.message)) {
        setError('Это время вне свободных окон ученика')
      } else {
        setError(insErr.message)
      }
      return
    }

    await supabase.rpc('create_notification', {
      p_user_id: studentId,
      p_text: `Новое занятие ${fmtDate(date)} в ${start}`,
    })
    setOk('Урок назначен')
  }

  if (students.length === 0) {
    return <p className="empty">Сначала к вам должен записаться хотя бы один ученик.</p>
  }

  return (
    <div>
      <div className="avail-form">
        <div className="avail-field">
          <label>Ученик</label>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="avail-field">
          <label>Дата</label>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            <option value="">— выберите —</option>
            {dates.map((d) => (
              <option key={d} value={d}>{fmtDate(d)}</option>
            ))}
          </select>
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

      {studentId && dates.length === 0 && (
        <p className="empty" style={{ marginTop: 12 }}>
          Этот ученик ещё не указал свободное время.
        </p>
      )}
      {date && daySlots.length > 0 && (
        <p className="card-hint" style={{ marginTop: 12 }}>
          Свободно: {daySlots.map((s) => `${hhmm(s.start_time)}–${hhmm(s.end_time)}`).join(', ')}
        </p>
      )}

      {error && <p className="enroll-msg-err">{error}</p>}
      {ok && <p className="enroll-msg-ok">{ok}</p>}
    </div>
  )
}
