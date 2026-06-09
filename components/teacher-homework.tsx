'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Attachment = { type: 'link' | 'file'; name: string; url: string; mime?: string }

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
  attachments: Attachment[]
  status: 'submitted' | 'approved' | 'rejected'
  review_comment: string | null
}
type Student = { id: string; name: string }

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

const STATUS_META = {
  submitted: { label: 'На проверке', cls: 'badge-scheduled' },
  approved:  { label: 'Принято',      cls: 'badge-completed' },
  rejected:  { label: 'На доработку', cls: 'badge-cancelled' },
}

function AttachIcon({ a }: { a: Attachment }) {
  if (a.type === 'link') return <span>🔗</span>
  const mime = a.mime ?? ''
  if (mime.startsWith('image/')) return <span>🖼️</span>
  if (mime.startsWith('video/')) return <span>🎬</span>
  if (mime.startsWith('audio/')) return <span>🎵</span>
  if (mime.includes('pdf'))      return <span>📄</span>
  return <span>📎</span>
}

export function TeacherHomework({ students }: { students: Student[] }) {
  const [list, setList]         = useState<HW[]>([])
  const [subs, setSubs]         = useState<Submission[]>([])
  const [loading, setLoading]   = useState(true)
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  // Стейт для окна проверки
  const [reviewing, setReviewing] = useState<{ subId: string; hwTitle: string; studentName: string } | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)

  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: hw }, { data: sb }] = await Promise.all([
      supabase
        .from('homework')
        .select('id, title, description, deadline, created_at')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('homework_submissions')
        .select('id, homework_id, student_id, comment, submitted_at, attachments, status, review_comment'),
    ])
    setList((hw ?? []) as HW[])
    const normalized = ((sb ?? []) as any[]).map((s) => ({
      ...s,
      attachments:    Array.isArray(s.attachments) ? s.attachments : [],
      status:         s.status ?? 'submitted',
      review_comment: s.review_comment ?? null,
    }))
    setSubs(normalized as Submission[])
    setLoading(false)
  }

  useEffect(() => {
    load()

    const channel = supabase
      .channel('teacher-homework-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homework_submissions' }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function review(subId: string, action: 'approved' | 'rejected') {
    setReviewLoading(true)
    try {
      const sub = subs.find((s) => s.id === subId)
      if (!sub) return

      // 1. Обновляем статус
      const { error: updateError } = await supabase
        .from('homework_submissions')
        .update({
          status: action,
          review_comment: reviewComment.trim() || null,
        })
        .eq('id', subId)

      if (updateError) {
        console.error('Ошибка обновления:', updateError)
        alert('Ошибка: ' + updateError.message)
        return
      }

      // 2. Уведомление ученику
      const hw = list.find((h) => h.id === sub.homework_id)
      const text = action === 'approved'
        ? `Работа «${hw?.title}» принята ✓`
        : `Работа «${hw?.title}» возвращена на доработку${reviewComment.trim() ? ': ' + reviewComment.trim() : ''}`

      // Пробуем RPC, если нет — вставляем напрямую в notifications
      const { error: rpcError } = await supabase.rpc('create_notification', {
        p_user_id: sub.student_id,
        p_text: text,
      })
      if (rpcError) {
        console.warn('RPC недоступен, вставляем напрямую:', rpcError.message)
        await supabase.from('notifications').insert({
          user_id: sub.student_id,
          text,
          is_read: false,
        })
      }

      setReviewing(null)
      setReviewComment('')
      load()
    } catch (e) {
      console.error('Непредвиденная ошибка:', e)
    } finally {
      setReviewLoading(false)
    }
  }

  const nameOf  = (id: string) => students.find((s) => s.id === id)?.name ?? 'Ученик'
  const subsFor = (hwId: string) => subs.filter((s) => s.homework_id === hwId)

  if (loading) return <p className="empty">Загрузка…</p>

  // Считаем сколько работ ждут проверки
  const pendingReviewCount = subs.filter((s) => s.status === 'submitted').length

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Модалка проверки */}
      {reviewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 460 }}>
            <h3 style={{ marginBottom: 4 }}>Проверка работы</h3>
            <p style={{ fontSize: 14, color: 'var(--text-soft)', marginBottom: 16 }}>
              {reviewing.studentName} · {reviewing.hwTitle}
            </p>
            <div className="field">
              <label>Комментарий (необязательно)</label>
              <input
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Что нужно исправить или похвалить…"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--accent)' }}
                onClick={() => review(reviewing.subId, 'approved')}
                disabled={reviewLoading}
              >
                ✓ Принять
              </button>
              <button
                className="lesson-cancel"
                style={{ flex: 1, padding: '10px 0', textAlign: 'center', border: '1px solid var(--danger)', color: 'var(--danger)' }}
                onClick={() => review(reviewing.subId, 'rejected')}
                disabled={reviewLoading}
              >
                ↩ На доработку
              </button>
              <button
                className="lesson-cancel"
                onClick={() => { setReviewing(null); setReviewComment('') }}
                disabled={reviewLoading}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Бейдж ожидающих проверки */}
      {pendingReviewCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border))', borderRadius: 'var(--radius)', marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>📬</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {pendingReviewCount} {pendingReviewCount === 1 ? 'работа ждёт' : 'работы ждут'} проверки
          </span>
        </div>
      )}

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
        <p className="empty" style={{ marginTop: 20 }}>Заданий пока нет.</p>
      ) : (
        list.map((hw) => {
          const hwSubs    = subsFor(hw.id)
          const approvedIds = new Set(hwSubs.filter((s) => s.status === 'approved').map((s) => s.student_id))
          const submittedCount = hwSubs.filter((s) => s.status === 'submitted').length
          const overdue = hw.deadline ? new Date(hw.deadline) < new Date(new Date().toDateString()) : false

          return (
            <div className="card" key={hw.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>{hw.title}</h3>
                  {hw.description && (
                    <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 6px' }}>{hw.description}</p>
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
                    {submittedCount > 0 && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                        📬 {submittedCount} на проверке
                      </span>
                    )}
                  </div>
                </div>
                <button className="lesson-cancel" onClick={() => remove(hw.id)}>Удалить</button>
              </div>

              {students.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', margin: '0 0 8px' }}>
                    Принято: {approvedIds.size} / {students.length}
                  </p>
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{
                      height: '100%',
                      width: students.length > 0 ? `${(approvedIds.size / students.length) * 100}%` : '0%',
                      background: 'var(--accent)',
                      borderRadius: 999,
                      transition: 'width .4s',
                    }} />
                  </div>

                  <ul className="lesson-list">
                    {students.map((s) => {
                      const sub = hwSubs.find((x) => x.student_id === s.id)
                      const meta = sub ? STATUS_META[sub.status] : null

                      return (
                        <li key={s.id} className="lesson-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                          <span className="lesson-when" style={{ fontWeight: 500 }}>{nameOf(s.id)}</span>

                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 1, minWidth: 160 }}>
                            {sub ? (
                              <>
                                <span className={`badge ${meta!.cls}`}>{meta!.label}</span>

                                {/* Вложения */}
                                {sub.attachments?.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                                    {sub.attachments.map((a, i) => (
                                      <a
                                        key={i}
                                        href={a.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, color: 'var(--text)', textDecoration: 'none' }}
                                      >
                                        <AttachIcon a={a} />
                                        <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {a.type === 'link' ? (() => { try { return new URL(a.url).hostname } catch { return a.url } })() : a.name}
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {/* Комментарий ученика */}
                                {sub.comment && (
                                  <span style={{ fontSize: 12, color: 'var(--text-soft)', maxWidth: 240, textAlign: 'right' }}>
                                    {sub.comment}
                                  </span>
                                )}

                                {/* Дата сдачи */}
                                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                  {new Date(sub.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                                </span>

                                {/* Кнопка проверки — только для submitted */}
                                {sub.status === 'submitted' && (
                                  <button
                                    className="lesson-save"
                                    style={{ fontSize: 12, padding: '5px 12px' }}
                                    onClick={() => {
                                      setReviewing({ subId: sub.id, hwTitle: hw.title, studentName: s.name })
                                      setReviewComment('')
                                    }}
                                  >
                                    Проверить
                                  </button>
                                )}

                                {/* Комментарий учителя */}
                                {sub.review_comment && (
                                  <span style={{ fontSize: 12, color: sub.status === 'rejected' ? 'var(--danger)' : 'var(--accent)', maxWidth: 240, textAlign: 'right', fontStyle: 'italic' }}>
                                    «{sub.review_comment}»
                                  </span>
                                )}
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