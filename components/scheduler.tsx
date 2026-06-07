'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const hhmm = (t: string) => t.slice(0, 5)
function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

const TIMES: string[] = []
for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) TIMES.push(`${String(h).padStart(2, '0')}:${m}`)

type Slot = { id: string; date: string; start_time: string; end_time: string }
type Lesson = { id: string; date: string; start_time: string; end_time: string; status: string }

// Панель назначения под одного выбранного ученика.
export function Scheduler({ studentId, studentName }: { studentId: string; studentName: string }) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())

  const [avail, setAvail] = useState<Slot[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [viewY, setViewY] = useState(today.getFullYear())
  const [viewM, setViewM] = useState(today.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [error, setError] = useState<string | null>(null)

  // Перенос урока
  const [editId, setEditId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('16:00')
  const [editEnd, setEditEnd] = useState('18:00')
  const [editErr, setEditErr] = useState<string | null>(null)

  const supabase = createClient()

  async function load() {
    const [{ data: a }, { data: l }] = await Promise.all([
      supabase
        .from('availability')
        .select('id, date, start_time, end_time')
        .eq('student_id', studentId)
        .gte('date', todayStr),
      supabase
        .from('lessons')
        .select('id, date, start_time, end_time, status')
        .eq('student_id', studentId)
        .gte('date', todayStr),
    ])
    setAvail((a ?? []) as Slot[])
    setLessons((l ?? []) as Lesson[])
  }

  useEffect(() => {
    load()
    setSelected(null)
    setError(null)
    setEditId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  const availDates = useMemo(() => new Set(avail.map((a) => a.date)), [avail])
  const lessonDates = useMemo(() => new Set(lessons.map((l) => l.date)), [lessons])

  const dayAvail = selected ? avail.filter((a) => a.date === selected) : []
  const dayLessons = selected
    ? lessons.filter((l) => l.date === selected).sort((a, b) => a.start_time.localeCompare(b.start_time))
    : []

  const offset = (new Date(viewY, viewM, 1).getDay() + 6) % 7
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  const mt = new Date(viewY, viewM, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  const title = mt.charAt(0).toUpperCase() + mt.slice(1)
  const atCurrentMonth = viewY === today.getFullYear() && viewM === today.getMonth()

  function prevMonth() {
    if (atCurrentMonth) return
    if (viewM === 0) { setViewY(viewY - 1); setViewM(11) } else setViewM(viewM - 1)
  }
  function nextMonth() {
    if (viewM === 11) { setViewY(viewY + 1); setViewM(0) } else setViewM(viewM + 1)
  }

  function pick(d: number | null) {
    if (d === null) return
    const ds = ymd(viewY, viewM, d)
    if (ds < todayStr) return
    setSelected(ds)
    setError(null)
    setEditId(null)
    const w = avail.find((s) => s.date === ds)
    if (w) { setStart(hhmm(w.start_time)); setEnd(hhmm(w.end_time)) }
  }

  async function assign() {
    if (!selected) return
    setError(null)
    if (start >= end) { setError('Начало должно быть раньше конца'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: insErr } = await supabase.from('lessons').insert({
      teacher_id: user.id, student_id: studentId, date: selected, start_time: start, end_time: end,
    })
    if (insErr) {
      if (insErr.code === '23P01' || /no_overlap/i.test(insErr.message)) {
        setError('У ученика уже есть урок в это время')
      } else setError(insErr.message)
      return
    }
    await supabase.rpc('create_notification', {
      p_user_id: studentId,
      p_text: `Новое занятие ${fmtDate(selected)} в ${start}`,
    })
    load()
  }

  function startEdit(l: Lesson) {
    setEditId(l.id)
    setEditStart(hhmm(l.start_time))
    setEditEnd(hhmm(l.end_time))
    setEditErr(null)
  }

  async function saveEdit(l: Lesson) {
    setEditErr(null)
    if (editStart >= editEnd) { setEditErr('Начало должно быть раньше конца'); return }
    const { error: upErr } = await supabase
      .from('lessons')
      .update({ start_time: editStart, end_time: editEnd })
      .eq('id', l.id)
    if (upErr) {
      if (upErr.code === '23P01' || /no_overlap/i.test(upErr.message)) {
        setEditErr('У ученика уже есть урок в это время')
      } else setEditErr(upErr.message)
      return
    }
    await supabase.rpc('create_notification', {
      p_user_id: studentId,
      p_text: `Занятие ${fmtDate(l.date)} перенесено на ${editStart}`,
    })
    setEditId(null)
    load()
  }

  // Отмена = урок убирается совсем (ученику уходит уведомление).
  async function cancelLesson(l: Lesson) {
    await supabase.from('lessons').delete().eq('id', l.id)
    await supabase.rpc('create_notification', {
      p_user_id: studentId,
      p_text: `Занятие ${fmtDate(l.date)} в ${hhmm(l.start_time)} отменено`,
    })
    load()
  }

  const selLabel = selected
    ? new Date(selected + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : ''

  return (
    <div>
      <div className="sched-cal">
        <div className="cal-head">
          <span className="cal-title">{title}</span>
          <div className="cal-nav">
            <button onClick={prevMonth} disabled={atCurrentMonth} aria-label="Предыдущий месяц">‹</button>
            <button onClick={nextMonth} aria-label="Следующий месяц">›</button>
          </div>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
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
                {lessonDates.has(ds) ? (
                  <span className="cal-dot" />
                ) : availDates.has(ds) ? (
                  <span className="cal-dot-free" />
                ) : null}
              </div>
            )
          })}
        </div>
        <p className="cal-legend">
          <span className="leg-free" /> свободен
          <span className="leg-busy" /> есть урок
        </p>
      </div>

      {selected && (
        <div className="day-detail">
          <h4>{selLabel} · {studentName}</h4>

          <p className="card-hint">Свободное время ученика:</p>
          {dayAvail.length > 0 ? (
            <div className="chips" style={{ marginBottom: 16 }}>
              {dayAvail.map((s) => (
                <button
                  key={s.id}
                  className="chip"
                  onClick={() => { setStart(hhmm(s.start_time)); setEnd(hhmm(s.end_time)) }}
                >
                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </button>
              ))}
            </div>
          ) : (
            <p className="empty" style={{ marginBottom: 16 }}>
              В этот день ученик не отметил свободное время.
            </p>
          )}

          <div className="avail-form">
            <div className="avail-field">
              <label>С</label>
              <select value={start} onChange={(e) => setStart(e.target.value)}>
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="avail-field">
              <label>До</label>
              <select value={end} onChange={(e) => setEnd(e.target.value)}>
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button className="btn avail-add" onClick={assign}>Назначить</button>
          </div>
          {error && <p className="enroll-msg-err">{error}</p>}

          {dayLessons.length > 0 && (
            <ul className="lesson-list" style={{ marginTop: 16 }}>
              {dayLessons.map((l) =>
                editId === l.id ? (
                  <li key={l.id} className="lesson-item">
                    <span className="lesson-edit">
                      <select value={editStart} onChange={(e) => setEditStart(e.target.value)}>
                        {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span>–</span>
                      <select value={editEnd} onChange={(e) => setEditEnd(e.target.value)}>
                        {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </span>
                    <span className="lesson-actions">
                      <button className="lesson-save" onClick={() => saveEdit(l)}>Сохранить</button>
                      <button className="lesson-cancel" onClick={() => setEditId(null)}>×</button>
                    </span>
                  </li>
                ) : (
                  <li key={l.id} className="lesson-item">
                    <span className="lesson-when">
                      <span className="lesson-time">{hhmm(l.start_time)}–{hhmm(l.end_time)}</span>
                    </span>
                    <span className="lesson-actions">
                      <button className="lesson-cancel" onClick={() => startEdit(l)}>Изменить</button>
                      <button className="lesson-cancel" onClick={() => cancelLesson(l)}>Отменить</button>
                    </span>
                  </li>
                )
              )}
            </ul>
          )}
          {editErr && <p className="enroll-msg-err">{editErr}</p>}
        </div>
      )}
    </div>
  )
}
