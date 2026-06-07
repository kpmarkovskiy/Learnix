'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const hhmm = (t: string) => t.slice(0, 5)
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const fmtShort = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })

const TIMES: string[] = []
for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) TIMES.push(`${String(h).padStart(2, '0')}:${m}`)

const todayStr = (() => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
})()

type Slot = { id: string; student_id: string; date: string; start_time: string; end_time: string }
type Student = { id: string; name: string }

export function LessonForm({ students }: { students: Student[] }) {
  const [avail, setAvail] = useState<Slot[]>([])
  const [checked, setChecked] = useState<string[]>([])
  const [date, setDate] = useState(todayStr)
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('18:00')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const supabase = createClient()

  // Свободное время всех учеников учителя (учитель видит его по RLS).
  useEffect(() => {
    const ids = students.map((s) => s.id)
    if (ids.length === 0) return
    supabase
      .from('availability')
      .select('id, student_id, date, start_time, end_time')
      .in('student_id', ids)
      .gte('date', todayStr)
      .order('date')
      .order('start_time')
      .then(({ data }) => setAvail((data ?? []) as Slot[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function schedule() {
    setMsg(null)
    if (checked.length === 0) return setMsg({ type: 'err', text: 'Отметьте хотя бы одного ученика' })
    if (!date) return setMsg({ type: 'err', text: 'Выберите дату' })
    if (start >= end) return setMsg({ type: 'err', text: 'Начало должно быть раньше конца' })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    let ok = 0
    let conflict = 0
    let other = 0

    for (const sid of checked) {
      const { error } = await supabase.from('lessons').insert({
        teacher_id: user.id,
        student_id: sid,
        date,
        start_time: start,
        end_time: end,
      })
      if (error) {
        if (error.code === '23P01' || /no_overlap/i.test(error.message)) conflict++
        else other++
      } else {
        ok++
        await supabase.rpc('create_notification', {
          p_user_id: sid,
          p_text: `Новое занятие ${fmtDate(date)} в ${start}`,
        })
      }
    }

    let text = `Назначено: ${ok}`
    if (conflict) text += `, конфликт по времени: ${conflict}`
    if (other) text += `, ошибок: ${other}`
    setMsg({ type: ok > 0 ? 'ok' : 'err', text })
    if (ok > 0) setChecked([])
  }

  if (students.length === 0) {
    return <p className="empty">Сначала к вам должен записаться хотя бы один ученик.</p>
  }

  return (
    <div>
      <div className="avail-form">
        <div className="avail-field">
          <label>Дата</label>
          <input type="date" min={todayStr} value={date} onChange={(e) => setDate(e.target.value)} />
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
      </div>

      <p className="card-hint" style={{ marginTop: 14 }}>Кому назначить:</p>
      <ul className="pick-list">
        {students.map((s) => {
          const slots = avail.filter((a) => a.student_id === s.id)
          const day = date ? slots.filter((a) => a.date === date) : []
          const fit = day.some((w) => hhmm(w.start_time) <= start && hhmm(w.end_time) >= end)

          let free: string
          if (date) {
            free = day.length
              ? day.map((w) => `${hhmm(w.start_time)}–${hhmm(w.end_time)}`).join(', ')
              : 'в этот день окон не отмечено'
          } else {
            free = slots.length
              ? slots.slice(0, 3).map((w) => `${fmtShort(w.date)} ${hhmm(w.start_time)}–${hhmm(w.end_time)}`).join(' · ')
              : 'нет свободных окон'
          }

          return (
            <li key={s.id}>
              <label className="pick-row">
                <input
                  type="checkbox"
                  checked={checked.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
                <span className="pick-info">
                  <span className="pick-name">{s.name}</span>
                  <span className={`pick-free ${date && fit ? 'fit' : ''}`}>
                    {date && fit ? '✓ свободен · ' : ''}
                    {free}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <button className="btn avail-add" onClick={schedule}>
        Назначить
      </button>

      {msg && <p className={msg.type === 'ok' ? 'enroll-msg-ok' : 'enroll-msg-err'}>{msg.text}</p>}
    </div>
  )
}
