'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type HW = {
  id: string
  title: string
  description: string | null
  deadline: string | null
  teacher?: { name: string }
}
type Sub = {
  id: string
  homework_id: string
  comment: string | null
  submitted_at: string
}

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

function isOverdue(deadline: string | null) {
  if (!deadline) return false
  return new Date(deadline) < new Date(new Date().toDateString())
}

export function StudentHomework() {
  const [list, setList] = useState<HW[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: hw }, { data: sb }] = await Promise.all([
      supabase
        .from('homework')
        .select('id, title, description, deadline, teacher:profiles!homework_teacher_id_fkey(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('homework_submissions')
        .select('id, homework_id, comment, submitted_at')
        .eq('student_id', user.id),
    ])
    setList((hw ?? []) as HW[])
    setSubs((sb ?? []) as Sub[])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(hwId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSubmitting(hwId)
    const comment = (comments[hwId] ?? '').trim() || null
    const existing = subs.find((s) => s.homework_id === hwId)
    if (existing) {
      await supabase
        .from('homework_submissions')
        .update({ comment, submitted_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('homework_submissions').insert({
        homework_id: hwId,
        student_id: user.id,
        comment,
      })
    }
    setComments((prev) => ({ ...prev, [hwId]: '' }))
    load()
    setSubmitting(null)
  }

  async function unsubmit(hwId: string) {
    const existing = subs.find((s) => s.homework_id === hwId)
    if (!existing) return
    await supabase.from('homework_submissions').delete().eq('id', existing.id)
    load()
  }

  if (loading) return <p className="empty">Загрузка…</p>
  if (list.length === 0) return <p className="empty">Заданий от учителей пока нет.</p>

  const pending = list.filter((hw) => !subs.find((s) => s.homework_id === hw.id))
  const done = list.filter((hw) => subs.find((s) => s.homework_id === hw.id))

  return (
    <div style={{ maxWidth: 680 }}>
      {pending.length > 0 && (
        <>
          <h4 style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)', marginBottom: 10 }}>
            Не сдано — {pending.length}
          </h4>
          {pending.map((hw) => <HwCard key={hw.id} hw={hw} sub={null} comments={comments} setComments={setComments} submitting={submitting} onSubmit={submit} onUnsubmit={unsubmit} />)}
        </>
      )}

      {done.length > 0 && (
        <>
          <h4 style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)', margin: '24px 0 10px' }}>
            Сдано — {done.length}
          </h4>
          {done.map((hw) => <HwCard key={hw.id} hw={hw} sub={subs.find((s) => s.homework_id === hw.id)!} comments={comments} setComments={setComments} submitting={submitting} onSubmit={submit} onUnsubmit={unsubmit} />)}
        </>
      )}
    </div>
  )
}

function HwCard({
  hw, sub, comments, setComments, submitting, onSubmit, onUnsubmit,
}: {
  hw: HW
  sub: Sub | null
  comments: Record<string, string>
  setComments: React.Dispatch<React.SetStateAction<Record<string, string>>>
  submitting: string | null
  onSubmit: (id: string) => void
  onUnsubmit: (id: string) => void
}) {
  const overdue = isOverdue(hw.deadline)

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h3 style={{ marginBottom: 4, fontSize: 17 }}>{hw.title}</h3>
          {hw.description && (
            <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 6px' }}>{hw.description}</p>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {hw.teacher?.name && (
              <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Учитель: {hw.teacher.name}</span>
            )}
            {hw.deadline && (
              <span style={{ fontSize: 13, color: overdue && !sub ? 'var(--danger)' : 'var(--text-faint)', fontWeight: overdue && !sub ? 600 : 400 }}>
                {overdue ? 'Просрочено: ' : 'До: '}{fmtDate(hw.deadline)}
              </span>
            )}
          </div>
        </div>
        {sub ? (
          <span className="badge badge-scheduled" style={{ flexShrink: 0 }}>Сдано</span>
        ) : (
          <span className="badge" style={{ flexShrink: 0, background: overdue ? 'var(--accent-soft)' : 'var(--surface-2)', color: overdue ? 'var(--danger)' : 'var(--text-soft)', border: '1px solid var(--border)' }}>
            {overdue ? 'Просрочено' : 'Не сдано'}
          </span>
        )}
      </div>

      {sub ? (
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10 }}>
          {sub.comment && <p style={{ margin: '0 0 8px', fontSize: 14 }}>{sub.comment}</p>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Сдано {new Date(sub.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </span>
            <button className="lesson-cancel" onClick={() => onUnsubmit(hw.id)}>Отменить сдачу</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{
              flex: 1, minWidth: 180,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
            placeholder="Комментарий (необязательно)"
            value={comments[hw.id] ?? ''}
            onChange={(e) => setComments((prev) => ({ ...prev, [hw.id]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(hw.id) }}
          />
          <button
            className="btn"
            style={{ width: 'auto', padding: '10px 20px', flexShrink: 0 }}
            onClick={() => onSubmit(hw.id)}
            disabled={submitting === hw.id}
          >
            {submitting === hw.id ? '…' : 'Сдать'}
          </button>
        </div>
      )}
    </div>
  )
}
