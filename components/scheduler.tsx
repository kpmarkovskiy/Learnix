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

type Slot = { id: string; student_id: string; date: string; start_time: string; end_time: string }
type Lesson = { id: string; student_id: string; date: string; start_time: string; end_time: string; status: string }
type Student = { id: string; name: string }

export function Scheduler({ students, viewStudentId }: { students: Student[]; viewStudentId: string }) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())

  const [avail, setAvail] = useState<Slot[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [viewY, setViewY] = useState(today.getFullYear())
  const [viewM, setViewM] = useState(today.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [checked, setChecked] = useState<string[]>([])
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('16:00')
  const [editEnd, setEditEnd] = useState('18:00')
  const [editErr, setEditErr] = useState<string | null>(null)

  const supabase = createClient()
  const ids = useMemo(() => students.map((s) => s.id), [students])

  async function load() {
    if (ids.length === 0) return
    const [{ data: a }, { data: l }] = await Promise.all([
      supabase.from('availability').select('id, student_id, date, start_time, end_time').in('student_id', ids).gte('date', todayStr),
      supabase.from('lessons').select('id, student_id, date, start_time, end_time, status').in('student_id', ids).gte('date', todayStr),
    ])
    setAvail((a ?? []) as Slot[])
    setLessons((l ?? []) as Lesson[])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Смена просматриваемого ученика — сбрасываем выбор дня.
  useEffect(() => {
    setSelected(null)
    setEditId(null)
    setMsg(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStudentId])

  // При выборе дня по умолчанию отмечаем просматриваемого ученика.
  useEffect(() => {
    if (selected) setChecked([viewStudentId])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, viewStudentId])

  const myAvail = useMemo(() => avail.filter((a) => a.student_id === viewStudentId), [avail, viewStudentId])
  const availDates = useMemo(() => new Set(myAvail.map((a) => a.date)), [myAvail])
  const lessonDates = useMemo(
    () => new Set(lessons.filter((l) => l.student_id === viewStudentId).map((l) => l.date)),
    [lessons, viewStudentId]
  )

  const dayAvail = selected ? myAvail.filter((a) => a.date === selected) : []
  const dayLessons = selected
    ? lessons.filter((l) => l.student_id === viewStudentId && l.date === selected)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
    : []

  // Статус ученика на выбранный слот: занят / свободен / нет окна.
  function statusFor(sid: string): 'busy' | 'free' | 'none' {
    if (!selected) return 'none'
    const busy = lessons.some(
      (l) => l.student_id === sid && l.date === selected && hhmm(l.start_time) < end && hhmm(l.end_time) > start
    )
    if (busy) return 'busy'
    const free = avail.some(
      (w) => w.student_id === sid && w.date === selected && hhmm(w.start_time) <= start && hhmm(w.end_time) >= end
    )
    return free ? 'free' : 'none'
  }

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
    setMsg(null)
    setEditId(null)
    const w = myAvail.find((s) => s.date === ds)
    if (w) { setStart(hhmm(w.start_time)); setEnd(hhmm(w.end_time)) }
  }

  function toggle(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function assign() {
    if (!selected) return
    setMsg(null)
    if (checked.length === 0) return setMsg({ type: 'err', text: 'Отметьте хотя бы одного ученика' })
    if (start >= end) return setMsg({ type: 'err', text: 'Начало должно быть раньше конца' })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let ok = 0, conflict = 0, other = 0
    for (const sid of checked) {
      const { error } = await supabase.from('lessons').insert({
        teacher_id: user.id, student_id: sid, date: selected, start_time: start, end_time: end,
      })
      if (error) {
        if (error.code === '23P01' || /no_overlap/i.test(error.message)) conflict++
        else other++
      } else {
        ok++
        await supabase.rpc('create_notification', {
          p_user_id: sid, p_text: `Новое занятие ${fmtDate(selected)} в ${start}`,
        })
      }
    }
    let text = `Назначено: ${ok}`
    if (conflict) text += `, занято: ${conflict}`
    if (other) text += `, ошибок: ${other}`
    setMsg({ type: ok > 0 ? 'ok' : 'err', text })
    load()
  }

  function startEdit(l: Lesson) {
    setEditId(l.id); setEditStart(hhmm(l.start_time)); setEditEnd(hhmm(l.end_time)); setEditErr(null)
  }
  async function saveEdit(l: Lesson) {
    setEditErr(null)
    if (editStart >= editEnd) { setEditErr('Начало должно быть раньше конца'); return }
    const { error } = await supabase.from('lessons').update({ start_time: editStart, end_time: editEnd }).eq('id', l.id)
    if (error) {
      setEditErr(error.code === '23P01' || /no_overlap/i.test(error.message) ? 'У ученика уже есть урок в это время' : error.message)
      return
    }
    await supabase.rpc('create_notification', { p_user_id: l.student_id, p_text: `Занятие ${fmtDate(l.date)} перенесено на ${editStart}` })
    setEditId(null); load()
  }
  async function cancelLesson(l: Lesson) {
    await supabase.from('lessons').delete().eq('id', l.id)
    await supabase.rpc('create_notification', { p_user_id: l.student_id, p_text: `Занятие ${fmtDate(l.date)} в ${hhmm(l.start_time)} отменено` })
    load()
  }

  const selLabel = selected
    ? new Date(selected + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : ''
  const statusText = { busy: 'занят', free: 'свободен', none: 'нет окна' }

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
                {lessonDates.has(ds) ? <span className="cal-dot" /> : availDates.has(ds) ? <span className="cal-dot-free" /> : null}
              </div>
            )
          })}
        </div>
        <p className="cal-legend"><span className="leg-free" /> свободен <span className="leg-busy" /> есть урок</p>
      </div>

      {selected && (
        <div className="day-detail">
          <h4>{selLabel}</h4>

          {dayAvail.length > 0 && (
            <>
              <p className="card-hint">Свободное время:</p>
              <div className="chips" style={{ marginBottom: 16 }}>
                {dayAvail.map((s) => (
                  <button key={s.id} className="chip" onClick={() => { setStart(hhmm(s.start_time)); setEnd(hhmm(s.end_time)) }}>
                    {hhmm(s.start_time)}–{hhmm(s.end_time)}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="avail-form">
            <div className="avail-field">
              <label>С</label>
              <select value={start} onChange={(e) => setStart(e.target.value)}>{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            <div className="avail-field">
              <label>До</label>
              <select value={end} onChange={(e) => setEnd(e.target.value)}>{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
          </div>

          <p className="card-hint" style={{ marginTop: 14 }}>Кому назначить на это время:</p>
          <ul className="pick-list">
            {students.map((s) => {
              const st = statusFor(s.id)
              return (
                <li key={s.id}>
                  <label className="pick-row">
                    <input type="checkbox" checked={checked.includes(s.id)} onChange={() => toggle(s.id)} />
                    <span className="pick-info">
                      <span className="pick-name">{s.name}</span>
                      <span className={`pick-free ${st === 'free' ? 'fit' : ''} ${st === 'busy' ? 'busy' : ''}`}>
                        {statusText[st]}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <button className="btn avail-add" onClick={assign}>Назначить</button>
          {msg && <p className={msg.type === 'ok' ? 'enroll-msg-ok' : 'enroll-msg-err'}>{msg.text}</p>}

          {dayLessons.length > 0 && (
            <>
              <p className="card-hint" style={{ marginTop: 18 }}>Уроки {selLabel} у {students.find((s) => s.id === viewStudentId)?.name}:</p>
              <ul className="lesson-list">
                {dayLessons.map((l) =>
                  editId === l.id ? (
                    <li key={l.id} className="lesson-item">
                      <span className="lesson-edit">
                        <select value={editStart} onChange={(e) => setEditStart(e.target.value)}>{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                        <span>–</span>
                        <select value={editEnd} onChange={(e) => setEditEnd(e.target.value)}>{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                      </span>
                      <span className="lesson-actions">
                        <button className="lesson-save" onClick={() => saveEdit(l)}>Сохранить</button>
                        <button className="lesson-cancel" onClick={() => setEditId(null)}>×</button>
                      </span>
                    </li>
                  ) : (
                    <li key={l.id} className="lesson-item">
                      <span className="lesson-when"><span className="lesson-time">{hhmm(l.start_time)}–{hhmm(l.end_time)}</span></span>
                      <span className="lesson-actions">
                        <button className="lesson-cancel" onClick={() => startEdit(l)}>Изменить</button>
                        <button className="lesson-cancel" onClick={() => cancelLesson(l)}>Отменить</button>
                      </span>
                    </li>
                  )
                )}
              </ul>
              {editErr && <p className="enroll-msg-err">{editErr}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
