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
  teacher_feedback: string | null
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
  // Подтверждение удаления задания
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Обратная связь: { [submissionId]: { open: bool, text: string, saving: bool } }
  const [feedbackState, setFeedbackState] = useState<Record<string, { open: boolean; text: string; saving: boolean }>>({})
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
          .select('id, homework_id, student_id, comment, submitted_at, teacher_feedback')
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

  async function confirmRemove(id: string) {
    setConfirmDeleteId(null)
    await supabase.from('homework').delete().eq('id', id)
    load()
  }

  async function saveFeedback(sub: Submission) {
    const fb = feedbackState[sub.id]
    if (!fb) return
    setFeedbackState(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], saving: true } }))
    await supabase
      .from('homework_submissions')
      .update({ teacher_feedback: fb.text.trim() || null })
      .eq('id', sub.id)
    // Уведомить ученика
    const hw = list.find(h => h.id === sub.homework_id)
    if (hw) {
      await supabase.rpc('create_notification', {
        p_user_id: sub.student_id,
        p_text: `Учитель оставил отзыв к заданию «${hw.title}»`,
      })
    }
    setFeedbackState(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], saving: false, open: false } }))
    load()
  }

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? 'Ученик'
  const subsFor = (hwId: string) => subs.filter((s) => s.homework_id === hwId)

  if (loading) return <p className="empty">Загрузка…</p>

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Форма создания задания */}
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
        <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <p className="empty">Заданий пока нет.</p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            Создайте первое задание выше.
          </p>
        </div>
      ) : (
        list.map((hw) => {
          const hwSubs = subsFor(hw.id)
          const doneIds = new Set(hwSubs.map((s) => s.student_id))
          const overdue = hw.deadline
            ? new Date(hw.deadline) < new Date(new Date().toDateString())
            : false

          return (
            <div className="card" key={hw.id} style={{ marginTop: 16 }}>
              {/* Шапка задания */}
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
                {/* Кнопка удаления с подтверждением */}
                {confirmDeleteId === hw.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>Точно удалить?</span>
                    <button
                      style={{
                        padding: '4px 12px', borderRadius: 8, border: 'none',
                        background: 'var(--danger)', color: '#fff',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                      onClick={() => confirmRemove(hw.id)}
                    >
                      Да
                    </button>
                    <button className="lesson-cancel" onClick={() => setConfirmDeleteId(null)}>
                      Нет
                    </button>
                  </div>
                ) : (
                  <button
                    className="lesson-cancel"
                    style={{ flexShrink: 0 }}
                    onClick={() => setConfirmDeleteId(hw.id)}
                  >
                    Удалить
                  </button>
                )}
              </div>

              {/* Прогресс и список учеников */}
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
                      const fb = feedbackState[sub?.id ?? '']
                      return (
                        <li key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                          <div className="lesson-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                            {/* Строка ученик + статус */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="lesson-when" style={{ fontWeight: 500 }}>{nameOf(s.id)}</span>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                {sub ? (
                                  <span className="badge badge-scheduled">Сдано</span>
                                ) : (
                                  <span className="badge badge-cancelled">Не сдано</span>
                                )}
                              </div>
                            </div>

                            {/* Если сдано — показываем детали */}
                            {sub && (
                              <div style={{
                                padding: '10px 12px',
                                background: 'var(--surface-2)',
                                borderRadius: 8,
                              }}>
                                {sub.comment && (
                                  <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text)' }}>
                                    <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>Ответ: </span>
                                    {sub.comment}
                                  </p>
                                )}
                                <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-faint)' }}>
                                  Сдано {new Date(sub.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                                </p>

                                {/* Отзыв учителя */}
                                {sub.teacher_feedback && !fb?.open && (
                                  <div style={{
                                    padding: '8px 10px',
                                    background: 'var(--accent-soft)',
                                    borderRadius: 8,
                                    marginBottom: 6,
                                    border: '1px solid var(--accent)',
                                  }}>
                                    <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                      Ваш отзыв
                                    </p>
                                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>{sub.teacher_feedback}</p>
                                  </div>
                                )}

                                {/* Форма отзыва */}
                                {fb?.open ? (
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <textarea
                                      rows={2}
                                      placeholder="Напишите отзыв на работу ученика…"
                                      value={fb.text}
                                      onChange={e => setFeedbackState(prev => ({
                                        ...prev,
                                        [sub.id]: { ...prev[sub.id], text: e.target.value },
                                      }))}
                                      style={{
                                        flex: 1, minWidth: 180, padding: '8px 10px',
                                        border: '1px solid var(--border)', borderRadius: 8,
                                        background: 'var(--surface)', color: 'var(--text)',
                                        fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                                      }}
                                    />
                                    <button
                                      className="lesson-save"
                                      style={{ padding: '8px 14px', fontSize: 13 }}
                                      disabled={fb.saving}
                                      onClick={() => saveFeedback(sub)}
                                    >
                                      {fb.saving ? '…' : 'Сохранить'}
                                    </button>
                                    <button
                                      className="lesson-cancel"
                                      onClick={() => setFeedbackState(prev => ({
                                        ...prev,
                                        [sub.id]: { ...prev[sub.id], open: false },
                                      }))}
                                    >
                                      Отмена
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="lesson-cancel"
                                    style={{ fontSize: 12 }}
                                    onClick={() => setFeedbackState(prev => ({
                                      ...prev,
                                      [sub.id]: { open: true, text: sub.teacher_feedback ?? '', saving: false },
                                    }))}
                                  >
                                    {sub.teacher_feedback ? 'Изменить отзыв' : '+ Написать отзыв'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
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
