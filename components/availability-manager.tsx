'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DAYS = [
  { value: 'mon', label: 'Понедельник' },
  { value: 'tue', label: 'Вторник' },
  { value: 'wed', label: 'Среда' },
  { value: 'thu', label: 'Четверг' },
  { value: 'fri', label: 'Пятница' },
  { value: 'sat', label: 'Суббота' },
  { value: 'sun', label: 'Воскресенье' },
]
const dayLabel = (v: string) => DAYS.find((d) => d.value === v)?.label ?? v
const dayOrder = (v: string) => DAYS.findIndex((d) => d.value === v)
const hhmm = (t: string) => t.slice(0, 5) // "16:00:00" -> "16:00"

type Slot = { id: string; day: string; start_time: string; end_time: string }

export function AvailabilityManager() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [day, setDay] = useState('mon')
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    // RLS отдаёт только окна текущего ученика — фильтровать вручную не нужно.
    const { data } = await supabase
      .from('availability')
      .select('id, day, start_time, end_time')

    const sorted = (data ?? []).sort(
      (a, b) =>
        dayOrder(a.day) - dayOrder(b.day) ||
        a.start_time.localeCompare(b.start_time)
    )
    setSlots(sorted as Slot[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add() {
    setError(null)
    if (start >= end) {
      setError('Начало должно быть раньше конца')
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('availability').insert({
      student_id: user.id,
      day,
      start_time: start,
      end_time: end,
    })
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  async function remove(id: string) {
    await supabase.from('availability').delete().eq('id', id)
    setSlots((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div>
      <div className="avail-form">
        <div className="avail-field">
          <label>День</label>
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="avail-field">
          <label>С</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="avail-field">
          <label>До</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button className="btn avail-add" onClick={add}>
          Добавить
        </button>
      </div>

      {error && <p className="enroll-msg-err">{error}</p>}

      {loading ? (
        <p className="empty" style={{ marginTop: 16 }}>Загрузка…</p>
      ) : slots.length > 0 ? (
        <ul className="avail-list">
          {slots.map((s) => (
            <li key={s.id} className="avail-item">
              <span>
                <span className="slot-day">{dayLabel(s.day)}</span>
                <span className="slot-time">
                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </span>
              </span>
              <button
                className="avail-del"
                onClick={() => remove(s.id)}
                aria-label="Удалить окно"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty" style={{ marginTop: 16 }}>
          Пока не указано ни одного окна.
        </p>
      )}
    </div>
  )
}
