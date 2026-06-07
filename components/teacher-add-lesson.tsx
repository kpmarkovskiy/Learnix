'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const hhmm = (t: string) => t.slice(0, 5)
const toMin = (t: string) => { const [h, m] = hhmm(t).split(':').map(Number); return h * 60 + m }
function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const TIMES: string[] = []
for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) TIMES.push(`${String(h).padStart(2, '0')}:${m}`)

type Slot = { student_id: string; date: string; start_time: string; end_time: string }
type Lesson = { id: string; student_id: string; date: string; start_time: string; end_time: string; lesson_type: string }
type Student = { id: string; name: string }

function mapErr(e: { code?: string; message: string }) {
  if (e.code === '23P01' || /no_overlap/i.test(e.message)) return 'conflict'
  if (/свободн/i.test(e.message)) return 'nowin'
  if (/учител/i.test(e.message)) return 'teacher'
  return 'other'
}

export function TeacherAddLesson({ students }: { students: Student[] }) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())

  const [avail, setAvail] = useState<Slot[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [viewY, setViewY] = useState(today.getFullYear())
  const [viewM, setViewM] = useState(today.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [ltype, setLtype] = useState<'individual' | 'group'>('individual')
  const [checked, setChecked] = useState<string[]>([])
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('16:00')
  const [editEnd, setEditEnd] = useState('18:00')
  const [editErr, setEditErr] = useState<string | null>(null)

  const supabase = createClient()
  const ids = useMemo(() => students.map((s) => s.id), [students])
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? 'Ученик'

  async function load() {
    if (ids.length === 0) return
    const [{ data: a }, { data: l }] = await Promise.all([
      supabase.from('availability').select('student_id, date, start_time, end_time').in('student_id', ids).gte('date', todayStr),
      supabase.from('lessons').select('id, student_id, date, start_time, end_time, lesson_type').in('student_id', ids).gte('date', todayStr),
    ])
    setAvail((a ?? []) as Slot[])
    setLessons((l ?? []) as Lesson[])
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Дни, где у кого-то осталось НЕЗАНЯТОЕ свободное время (окно минус уроки).
  const freeDates = useMemo(() => {
    const set = new Set<string>()
    const dates = new Set(avail.map((a) => a.date))
    for (const date of dates) {
      let has = false
      for (const s of students) {
        const windows = avail.filter((w) => w.student_id === s.id && w.date === date)
        const busy = lessons
          .filter((l) => l.student_id === s.id && l.date === date)
          .map((l) => ({ s: toMin(l.start_time), e: toMin(l.end_time) }))
        for (const w of windows) {
          const ws = toMin(w.start_time), we = toMin(w.end_time)
          let cursor = ws
          const rel = busy.filter((b) => b.e > ws && b.s < we).sort((a, b) => a.s - b.s)
          let free = false
          for (const b of rel) {
            if (b.s > cursor) { free = true; break }
            cursor = Math.max(cursor, b.e)
            if (cursor >= we) break
          }
          if (!free && cursor < we) free = true
          if (free) { has = true; break }
        }
        if (has) break
      }
      if (has) set.add(date)
    }
    return set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail, lessons, students])

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
    setSelected(ds); setMsg(null); setChecked([]); setEditId(null)
  }
  function toggle(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function statusFor(sid: string): 'busy' | 'free' | 'none' {
    if (!selected) return 'none'
    const busy = lessons.some((l) => l.student_id === sid && l.date === selected && hhmm(l.start_time) < end && hhmm(l.end_time) > start)
    if (busy) return 'busy'
    const free = avail.some((w) => w.student_id === sid && w.date === selected && hhmm(w.start_time) <= start && hhmm(w.end_time) >= end)
    return free ? 'free' : 'none'
  }
  const statusText = { busy: 'занят', free: 'свободен', none: 'нет окна' }

  async function assign() {
    if (!selected) return
    setMsg(null)
    if (checked.length === 0) return setMsg({ type: 'err', text: 'Отметьте хотя бы одного ученика' })
    if (start >= end) return setMsg({ type: 'err', text: 'Начало должно быть раньше конца' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    let ok = 0, conflict = 0, nowin = 0, teacher = 0, other = 0
    for (const sid of checked) {
      const { error } = await supabase.from('lessons').insert({
        teacher_id: user.id, student_id: sid, date: selected, start_time: start, end_time: end, lesson_type: ltype,
      })
      if (error) {
        const k = mapErr(error)
        if (k === 'conflict') conflict++
        else if (k === 'nowin') nowin++
        else if (k === 'teacher') teacher++
        else other++
      } else {
        ok++
        await supabase.rpc('create_notification', { p_user_id: sid, p_text: `Новое занятие ${fmtDate(selected)} в ${start}` })
      }
    }
    let text = `Назначено: ${ok}`
    if (conflict) text += `, занято: ${conflict}`
    if (nowin) text += `, вне окна: ${nowin}`
    if (teacher) text += `, пересечение у вас: ${teacher}`
    if (other) text += `, ошибок: ${other}`
    setMsg({ type: ok > 0 ? 'ok' : 'err', text })
    setChecked([])
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
      const k = mapErr(error)
      setEditErr(
        k === 'conflict' ? 'У ученика уже есть урок в это время'
          : k === 'nowin' ? 'Это время вне свободных окон ученика'
          : k === 'teacher' ? 'На это время у вас уже есть другое занятие'
          : error.message
      )
      return
    }
    await supabase.rpc('create_notification', { p_user_id: l.student_id, p_text: `Занятие ${fmtDate(l.date)} перенесено на ${editStart}` })
    setEditId(null); load()
  }

  const selLabel = selected ? fmtDate(selected) : ''

  if (students.length === 0) {
    return <p className="empty">Сначала к вам должен записаться хотя бы один ученик.</p>
  }

  return (
    <div className="add-grid">
      <div className="card">
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
                {freeDates.has(ds) && <span className="cal-dot-free" />}
              </div>
            )
          })}
        </div>
        <p className="cal-legend"><span className="leg-free" /> есть свободное время</p>
      </div>

      <div className="card">
        {!selected ? (
          <p className="empty">Выберите дату в календаре слева.</p>
        ) : (
          <>
            <h4 style={{ marginBottom: 12 }}>{selLabel}</h4>
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
              <div className="avail-field">
                <label>Тип</label>
                <select value={ltype} onChange={(e) => setLtype(e.target.value as 'individual' | 'group')}>
                  <option value="individual">Индивидуальное</option>
                  <option value="group">Групповое</option>
                </select>
              </div>
            </div>

            <p className="card-hint" style={{ marginTop: 14 }}>Кому назначить:</p>
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
                <p className="card-hint" style={{ marginTop: 18 }}>Уроки в этот день:</p>
                <ul className="lesson-list">
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
                          {nameOf(l.student_id)}
                          <span className="lesson-time">{hhmm(l.start_time)}–{hhmm(l.end_time)}</span>
                          <span className={`badge ${l.lesson_type === 'group' ? 'badge-grp' : 'badge-ind'}`} style={{ marginLeft: 8 }}>
                            {l.lesson_type === 'group' ? 'Групповое' : 'Индивид.'}
                          </span>
                        </span>
                        <span className="lesson-actions">
                          <button className="lesson-cancel" onClick={() => startEdit(l)}>Изменить</button>
                        </span>
                      </li>
                    )
                  )}
                </ul>
                {editErr && <p className="enroll-msg-err">{editErr}</p>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
