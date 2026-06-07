'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const hhmm = (t: string) => t.slice(0, 5)
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })
const TIMES: string[] = []
for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) TIMES.push(`${String(h).padStart(2, '0')}:${m}`)

type Lesson = { id: string; student_id: string; date: string; start_time: string; end_time: string }
type Student = { id: string; name: string }

export function TeacherLessons({ students }: { students: Student[] }) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('16:00')
  const [editEnd, setEditEnd] = useState('18:00')
  const [err, setErr] = useState<string | null>(null)
  const supabase = createClient()

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? 'Ученик'

  async function load() {
    const ids = students.map((s) => s.id)
    if (ids.length === 0) { setLoading(false); return }
    const { data } = await supabase
      .from('lessons')
      .select('id, student_id, date, start_time, end_time')
      .in('student_id', ids)
      .gte('date', todayStr)
      .order('date')
      .order('start_time')
    setLessons((data ?? []) as Lesson[])
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(l: Lesson) {
    setEditId(l.id); setEditStart(hhmm(l.start_time)); setEditEnd(hhmm(l.end_time)); setErr(null)
  }
  async function saveEdit(l: Lesson) {
    setErr(null)
    if (editStart >= editEnd) { setErr('Начало должно быть раньше конца'); return }
    const { error } = await supabase.from('lessons').update({ start_time: editStart, end_time: editEnd }).eq('id', l.id)
    if (error) {
      setErr(error.code === '23P01' || /no_overlap/i.test(error.message) ? 'У ученика уже есть урок в это время' : error.message)
      return
    }
    await supabase.rpc('create_notification', { p_user_id: l.student_id, p_text: `Занятие ${new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} перенесено на ${editStart}` })
    setEditId(null); load()
  }
  async function remove(l: Lesson) {
    await supabase.from('lessons').delete().eq('id', l.id)
    await supabase.rpc('create_notification', { p_user_id: l.student_id, p_text: `Занятие ${new Date(l.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${hhmm(l.start_time)} отменено` })
    load()
  }

  // Группировка по дате
  const byDate: Record<string, Lesson[]> = {}
  for (const l of lessons) (byDate[l.date] ??= []).push(l)
  const dates = Object.keys(byDate).sort()

  if (loading) return <p className="empty">Загрузка…</p>
  if (lessons.length === 0) return <p className="empty">Запланированных уроков нет.</p>

  return (
    <div style={{ maxWidth: 620 }}>
      {dates.map((d) => (
        <section className="card" key={d}>
          <h3>{fmtDate(d)}</h3>
          <ul className="lesson-list" style={{ marginTop: 12 }}>
            {byDate[d].map((l) =>
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
                  </span>
                  <span className="lesson-actions">
                    <button className="lesson-cancel" onClick={() => startEdit(l)}>Изменить</button>
                    <button className="lesson-cancel" onClick={() => remove(l)}>Удалить</button>
                  </span>
                </li>
              )
            )}
          </ul>
        </section>
      ))}
      {err && <p className="enroll-msg-err">{err}</p>}
    </div>
  )
}
