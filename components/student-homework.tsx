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
  teacher_feedback: string | null
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
        .select('id, homework_id, comment, submitted_at, teacher_feedback')
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
  const done    = list.filter((hw) =>  subs.find((s) => s.homework_id === hw.id))
  const overduePending = pending.filter((hw) => isOverdue(hw.deadline))
  const pct = list.length > 0 ? Math.round((done.length / list.length) * 100) : 0
  const streakEmoji = pct === 100 ? '🏆' : pct >= 75 ? '🔥' : pct >= 50 ? '✨' : pct >= 25 ? '📚' : '🌱'
 
  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {streakEmoji} Прогресс по заданиям
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: pct === 100 ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.02em' }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: pct === 100 ? 'var(--accent)' : overduePending.length > 0 ? 'var(--danger)' : 'var(--accent)',
            borderRadius: 999,
            transition: 'width .5s ease',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
            <strong style={{ color: 'var(--accent-strong)', fontWeight: 700 }}>{done.length}</strong> сдано
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
            <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{pending.length - overduePending.length}</strong> ожидает
          </span>
          {overduePending.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
              <strong style={{ color: 'var(--danger)', fontWeight: 700 }}>{overduePending.length}</strong> просрочено
            </span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
            <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{list.length}</strong> всего
          </span>
        </div>
      </div>
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
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10 }}>
            {sub.comment && <p style={{ margin: '0 0 8px', fontSize: 14 }}>{sub.comment}</p>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                Сдано {new Date(sub.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </span>
              <button className="lesson-cancel" onClick={() => onUnsubmit(hw.id)}>Отменить сдачу</button>
            </div>
          </div>
          {sub.teacher_feedback && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              borderRadius: 10,
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Отзыв учителя
              </p>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>{sub.teacher_feedback}</p>
            </div>
          )}
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