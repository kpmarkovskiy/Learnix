'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const hhmm = (t: string) => t.slice(0, 5) // "16:00:00" -> "16:00"

// Дата в формате YYYY-MM-DD без сдвигов часовых поясов.
function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

type Slot = { id: string; date: string; start_time: string; end_time: string }

export function AvailabilityManager() {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())

  const [viewY, setViewY] = useState(today.getFullYear())
  const [viewM, setViewM] = useState(today.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    // Берём только сегодняшние и будущие окна (прошлое не показываем).
    const { data } = await supabase
      .from('availability')
      .select('id, date, start_time, end_time')
      .gte('date', todayStr)
      .order('date')
      .order('start_time')
    setSlots((data ?? []) as Slot[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Даты, у которых есть окна — чтобы рисовать точку на календаре.
  const datesWithSlots = useMemo(() => new Set(slots.map((s) => s.date)), [slots])
  const daySlots = selected ? slots.filter((s) => s.date === selected) : []

  // Сетка месяца (неделя начинается с понедельника).
  const offset = (new Date(viewY, viewM, 1).getDay() + 6) % 7
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const mt = new Date(viewY, viewM, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  })
  const title = mt.charAt(0).toUpperCase() + mt.slice(1)

  const atCurrentMonth =
    viewY === today.getFullYear() && viewM === today.getMonth()

  function prevMonth() {
    if (atCurrentMonth) return
    if (viewM === 0) {
      setViewY(viewY - 1)
      setViewM(11)
    } else setViewM(viewM - 1)
  }
  function nextMonth() {
    if (viewM === 11) {
      setViewY(viewY + 1)
      setViewM(0)
    } else setViewM(viewM + 1)
  }

  function pick(d: number | null) {
    if (d === null) return
    const ds = ymd(viewY, viewM, d)
    if (ds < todayStr) return // прошлое выбрать нельзя
    setSelected(ds)
    setError(null)
  }

  async function add() {
    if (!selected) return
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
      date: selected,
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

  const selectedLabel = selected
    ? new Date(selected + 'T00:00:00').toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      })
    : ''

  return (
    <div>
      <div className="cal-head">
        <span className="cal-title">{title}</span>
        <div className="cal-nav">
          <button onClick={prevMonth} disabled={atCurrentMonth} aria-label="Предыдущий месяц">
            ‹
          </button>
          <button onClick={nextMonth} aria-label="Следующий месяц">
            ›
          </button>
        </div>
      </div>

      <div className="cal-grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={'e' + i} className="cal-cell empty-cell" />
          const ds = ymd(viewY, viewM, d)
          const cls = ['cal-cell']
          if (ds < todayStr) cls.push('past')
          if (ds === todayStr) cls.push('today')
          if (ds === selected) cls.push('selected')
          return (
            <div key={ds} className={cls.join(' ')} onClick={() => pick(d)}>
              {d}
              {datesWithSlots.has(ds) && <span className="cal-dot" />}
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="day-detail">
          <h4>{selectedLabel}</h4>
          <div className="avail-form">
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

          {daySlots.length > 0 ? (
            <ul className="avail-list">
              {daySlots.map((s) => (
                <li key={s.id} className="avail-item">
                  <span className="slot-time">
                    {hhmm(s.start_time)}–{hhmm(s.end_time)}
                  </span>
                  <button className="avail-del" onClick={() => remove(s.id)} aria-label="Удалить">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty" style={{ marginTop: 14 }}>
              На этот день окон нет — добавьте время выше.
            </p>
          )}
        </div>
      )}

      {!selected && !loading && (
        <p className="empty" style={{ marginTop: 16 }}>
          Выберите день в календаре, чтобы указать время.
        </p>
      )}
    </div>
  )
}
