'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type HW = {
  id: string
  title: string
  description: string | null
  deadline: string | null
  created_at: string
}
type Submission = {
  id: string
  homework_id: string
  student_id: string
  comment: string | null
  submitted_at: string
}
type Student = { id: string; name: string }

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

export function TeacherHomework({ students }: { students: Student[] }) {
  const [list, setList] = useState<HW[]>([])
  const [subs, setSubs] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: hw } = await supabase
      .from('homework')
      .select('id, title, description, deadline, created_at')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
    const hwIds = (hw ?? []).map((h: { id: string }) => h.id)
    const { data: sb } = hwIds.length > 0
      ? await supabase
          .from('homework_submissions')
          .select('id, homework_id, student_id, comment, submitted_at')
          .in('homework_id', hwIds)
      : { data: [] }
    setList((hw ?? []) as HW[])
    setSubs((sb ?? []) as Submission[])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!title.trim()) { setErr('Введите название задания'); return }
    setSaving(true); setErr(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('homework').insert({
      teacher_id: user.id,
      title: title.trim(),
      description: desc.trim() || null,
      deadline: deadline || null,
    })
    if (error) {
      setErr('Ошибка: ' + error.message)
    } else {
      const deadlineStr = deadline ? ` (до ${fmtDate(deadline)})` : ''
      for (const s of students) {
        await supabase.rpc('create_notification', {
          p_user_id: s.id,
          p_text: `Новое задание: «${title.trim()}»${deadlineStr}`,
        })
      }
      setTitle(''); setDesc(''); setDeadline('')
      load()
    }
    setSaving(false)
  }

  async function remove(id: string) {
    await supabase.from('homework').delete().eq('id', id)
    load()
  }

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? 'Ученик'
  const subsFor = (hwId: string) => subs.filter((s) => s.homework_id === hwId)

  if (loading) return <p className="empty">Загрузка…</p>

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="card">
        <h3>Новое задание</h3>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Название</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Упражнение 5, стр. 48"
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
          />
        </div>
        <div className="field">
          <label>Описание (необязательно)</label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Подробности задания"
          />
        </div>
        <div className="field">
          <label>Дедлайн (необязательно)</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        {err && <p className="enroll-msg-err">{err}</p>}
        <button className="btn" style={{ marginTop: 8 }} onClick={create} disabled={saving}>
          {saving ? 'Создаём…' : 'Создать задание'}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="empty" style={{ marginTop: 20 }}>Заданий пока нет.</p>
      ) : (
        list.map((hw) => {
          const hwSubs = subsFor(hw.id)
          const doneIds = new Set(hwSubs.map((s) => s.student_id))
          const overdue = hw.deadline
            ? new Date(hw.deadline) < new Date(new Date().toDateString())
            : false

          return (
            <div className="card" key={hw.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>{hw.title}</h3>
                  {hw.description && (
                    <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 6px' }}>
                      {hw.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {hw.deadline && (
                      <span style={{ fontSize: 13, color: overdue ? 'var(--danger)' : 'var(--text-faint)' }}>
                        {overdue ? 'Дедлайн истёк: ' : 'До: '}{fmtDate(hw.deadline)}
                      </span>
                    )}
                    <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                      Создано {fmtDate(hw.created_at.slice(0, 10))}
                    </span>
                  </div>
                </div>
                <button className="lesson-cancel" onClick={() => remove(hw.id)}>Удалить</button>
              </div>

              {students.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', margin: '0 0 8px' }}>
                    Выполнено: {doneIds.size} / {students.length}
                  </p>
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{
                      height: '100%',
                      width: students.length > 0 ? `${(doneIds.size / students.length) * 100}%` : '0%',
                      background: 'var(--accent)',
                      borderRadius: 999,
                      transition: 'width .4s',
                    }} />
                  </div>
                  <ul className="lesson-list">
                    {students.map((s) => {
                      const sub = hwSubs.find((x) => x.student_id === s.id)
                      return (
                        <li key={s.id} className="lesson-item">
                          <span className="lesson-when" style={{ fontWeight: 500 }}>{nameOf(s.id)}</span>
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                            {sub ? (
                              <>
                                <span className="badge badge-scheduled">Сдано</span>
                                {sub.comment && (
                                  <span style={{ fontSize: 12, color: 'var(--text-soft)', maxWidth: 220, textAlign: 'right' }}>
                                    {sub.comment}
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                  {new Date(sub.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                                </span>
                              </>
                            ) : (
                              <span className="badge badge-cancelled">Не сдано</span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
