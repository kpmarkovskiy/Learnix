'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Attachment = { type: 'link' | 'file'; name: string; url: string; mime?: string }

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
  attachments: Attachment[]
  status: 'submitted' | 'approved' | 'rejected'
  review_comment: string | null
}

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

function isOverdue(deadline: string | null) {
  if (!deadline) return false
  return new Date(deadline) < new Date(new Date().toDateString())
}

const STATUS_META = {
  submitted: { label: 'На проверке', cls: 'badge-scheduled' },
  approved:  { label: 'Принято ✓',   cls: 'badge-completed' },
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

export function StudentHomework() {
  const [list, setList]           = useState<HW[]>([])
  const [subs, setSubs]           = useState<Sub[]>([])
  const [loading, setLoading]     = useState(true)
  const [comments, setComments]   = useState<Record<string, string>>({})
  const [links, setLinks]         = useState<Record<string, string>>({})
  const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({})
  const [uploading, setUploading] = useState<string | null>(null)
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
        .select('id, homework_id, comment, submitted_at, attachments, status, review_comment')
        .eq('student_id', user.id),
    ])
    setList(((hw ?? []) as any[]).map((h) => ({
      ...h,
      teacher: Array.isArray(h.teacher) ? h.teacher[0] : h.teacher,
    })) as HW[])
    setSubs(((sb ?? []) as any[]).map((s) => ({
      ...s,
      attachments:    Array.isArray(s.attachments) ? s.attachments : [],
      status:         s.status ?? 'submitted',
      review_comment: s.review_comment ?? null,
    })) as Sub[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(hwId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUploading(hwId)

    // Загружаем файлы в Storage
    const newAttachments: Attachment[] = []
    const files = pendingFiles[hwId] ?? []
    for (const file of files) {
      const path = `${user.id}/${hwId}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('homework-attachments').upload(path, file)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('homework-attachments').getPublicUrl(path)
        newAttachments.push({ type: 'file', name: file.name, url: publicUrl, mime: file.type })
      }
    }

    // Добавляем ссылку если есть
    const link = (links[hwId] ?? '').trim()
    if (link) {
      const url = link.startsWith('http') ? link : 'https://' + link
      newAttachments.push({ type: 'link', name: url, url })
    }

    const comment = (comments[hwId] ?? '').trim() || null
    const existing = subs.find((s) => s.homework_id === hwId)

    if (existing) {
      const merged = [...(existing.attachments ?? []), ...newAttachments]
      await supabase
        .from('homework_submissions')
        .update({ comment, submitted_at: new Date().toISOString(), attachments: merged, status: 'submitted', review_comment: null })
        .eq('id', existing.id)
    } else {
      await supabase.from('homework_submissions').insert({
        homework_id: hwId,
        student_id: user.id,
        comment,
        attachments: newAttachments,
        status: 'submitted',
      })
    }

    setComments((p) => ({ ...p, [hwId]: '' }))
    setLinks((p) => ({ ...p, [hwId]: '' }))
    setPendingFiles((p) => ({ ...p, [hwId]: [] }))
    load()
    setUploading(null)
  }

  async function unsubmit(hwId: string) {
    const existing = subs.find((s) => s.homework_id === hwId)
    if (!existing) return
    await supabase.from('homework_submissions').delete().eq('id', existing.id)
    load()
  }

  async function removeAttachment(subId: string, idx: number) {
    const sub = subs.find((s) => s.id === subId)
    if (!sub) return
    const updated = sub.attachments.filter((_, i) => i !== idx)
    await supabase.from('homework_submissions').update({ attachments: updated }).eq('id', subId)
    load()
  }

  if (loading) return <p className="empty">Загрузка…</p>
  if (list.length === 0) return <p className="empty">Заданий от учителей пока нет.</p>

  const pending      = list.filter((hw) => !subs.find((s) => s.homework_id === hw.id))
  const done         = list.filter((hw) =>  subs.find((s) => s.homework_id === hw.id))
  const overduePending = pending.filter((hw) => isOverdue(hw.deadline))
  const pct = list.length > 0 ? Math.round((done.length / list.length) * 100) : 0
  const streakEmoji = pct === 100 ? '🏆' : pct >= 75 ? '🔥' : pct >= 50 ? '✨' : pct >= 25 ? '📚' : '🌱'

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Прогресс */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{streakEmoji} Прогресс по заданиям</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: pct === 100 ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.02em' }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: overduePending.length > 0 ? 'var(--danger)' : 'var(--accent)', borderRadius: 999, transition: 'width .5s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-soft)' }}><strong style={{ color: 'var(--accent-strong)', fontWeight: 700 }}>{done.length}</strong> сдано</span>
          <span style={{ fontSize: 13, color: 'var(--text-soft)' }}><strong style={{ color: 'var(--text)', fontWeight: 700 }}>{pending.length - overduePending.length}</strong> ожидает</span>
          {overduePending.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-soft)' }}><strong style={{ color: 'var(--danger)', fontWeight: 700 }}>{overduePending.length}</strong> просрочено</span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-soft)' }}><strong style={{ color: 'var(--text)', fontWeight: 700 }}>{list.length}</strong> всего</span>
        </div>
      </div>

      {pending.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)', marginBottom: 10 }}>
            Не сдано — {pending.length}
          </h4>
          {pending.map((hw) => (
            <HwCard
              key={hw.id} hw={hw} sub={null}
              comment={comments[hw.id] ?? ''} onCommentChange={(v) => setComments((p) => ({ ...p, [hw.id]: v }))}
              link={links[hw.id] ?? ''} onLinkChange={(v) => setLinks((p) => ({ ...p, [hw.id]: v }))}
              files={pendingFiles[hw.id] ?? []} onFilesChange={(f) => setPendingFiles((p) => ({ ...p, [hw.id]: f }))}
              uploading={uploading === hw.id}
              onSubmit={() => submit(hw.id)}
              onUnsubmit={() => unsubmit(hw.id)}
              onRemoveAttachment={removeAttachment}
            />
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)', margin: '24px 0 10px' }}>
            Сдано — {done.length}
          </h4>
          {done.map((hw) => (
            <HwCard
              key={hw.id} hw={hw} sub={subs.find((s) => s.homework_id === hw.id)!}
              comment={comments[hw.id] ?? ''} onCommentChange={(v) => setComments((p) => ({ ...p, [hw.id]: v }))}
              link={links[hw.id] ?? ''} onLinkChange={(v) => setLinks((p) => ({ ...p, [hw.id]: v }))}
              files={pendingFiles[hw.id] ?? []} onFilesChange={(f) => setPendingFiles((p) => ({ ...p, [hw.id]: f }))}
              uploading={uploading === hw.id}
              onSubmit={() => submit(hw.id)}
              onUnsubmit={() => unsubmit(hw.id)}
              onRemoveAttachment={removeAttachment}
            />
          ))}
        </>
      )}
    </div>
  )
}

function HwCard({
  hw, sub,
  comment, onCommentChange,
  link, onLinkChange,
  files, onFilesChange,
  uploading, onSubmit, onUnsubmit, onRemoveAttachment,
}: {
  hw: HW
  sub: Sub | null
  comment: string; onCommentChange: (v: string) => void
  link: string; onLinkChange: (v: string) => void
  files: File[]; onFilesChange: (f: File[]) => void
  uploading: boolean
  onSubmit: () => void
  onUnsubmit: () => void
  onRemoveAttachment: (subId: string, idx: number) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const overdue = isOverdue(hw.deadline)
  const statusMeta = sub ? STATUS_META[sub.status] : null
  const isRejected = sub?.status === 'rejected'

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* Шапка */}
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
        {statusMeta ? (
          <span className={`badge ${statusMeta.cls}`} style={{ flexShrink: 0 }}>{statusMeta.label}</span>
        ) : (
          <span className="badge" style={{ flexShrink: 0, background: overdue ? 'var(--accent-soft)' : 'var(--surface-2)', color: overdue ? 'var(--danger)' : 'var(--text-soft)', border: '1px solid var(--border)' }}>
            {overdue ? 'Просрочено' : 'Не сдано'}
          </span>
        )}
      </div>

      {/* Комментарий учителя при возврате */}
      {isRejected && sub?.review_comment && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--danger) 30%, var(--border))', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>Комментарий учителя:</p>
          <p style={{ margin: '4px 0 0', fontSize: 14 }}>{sub.review_comment}</p>
        </div>
      )}

      {/* Уже сданная работа */}
      {sub && sub.status !== 'rejected' && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10 }}>
          {sub.comment && <p style={{ margin: '0 0 8px', fontSize: 14 }}>{sub.comment}</p>}
          {sub.attachments?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {sub.attachments.map((a, i) => (
                <AttachmentChip key={i} a={a} onRemove={sub.status === 'submitted' ? () => onRemoveAttachment(sub.id, i) : undefined} />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Сдано {new Date(sub.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </span>
            {sub.status === 'submitted' && (
              <button className="lesson-cancel" onClick={onUnsubmit}>Отменить сдачу</button>
            )}
          </div>
        </div>
      )}

      {/* Форма сдачи (новая работа или после отклонения) */}
      {(!sub || isRejected) && (
        <div style={{ marginTop: 14 }}>
          {/* Вложения уже добавленные (при повторной сдаче после rejection) */}
          {isRejected && sub && sub.attachments?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {sub.attachments.map((a, i) => (
                <AttachmentChip key={i} a={a} onRemove={() => onRemoveAttachment(sub.id, i)} />
              ))}
            </div>
          )}

          {/* Новые файлы в очереди */}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 13 }}>
                  <AttachIcon a={{ type: "file", name: f.name, url: "", mime: f.type }} />
                  <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button onClick={() => onFilesChange(files.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Комментарий */}
          <input
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
            placeholder="Комментарий (необязательно)"
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
          />

          {/* Ссылка */}
          <input
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
            placeholder="Ссылка (https://...)"
            value={link}
            onChange={(e) => onLinkChange(e.target.value)}
          />

          {/* Кнопки */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="lesson-cancel"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => fileRef.current?.click()}
            >
              📎 Прикрепить файл
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                const newFiles = Array.from(e.target.files ?? [])
                onFilesChange([...files, ...newFiles])
                e.target.value = ''
              }}
            />
            <button
              className="btn"
              style={{ flex: 1, minWidth: 120 }}
              onClick={onSubmit}
              disabled={uploading}
            >
              {uploading ? 'Отправляем…' : isRejected ? 'Пересдать' : 'Сдать'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 13, color: 'var(--text)', textDecoration: 'none', maxWidth: 220 }}
      onClick={(e) => e.stopPropagation()}
    >
      <AttachIcon a={a} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {a.type === 'link' ? new URL(a.url).hostname : a.name}
      </span>
      {onRemove && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, lineHeight: 1, padding: 0, marginLeft: 2 }}
        >×</button>
      )}
    </a>
  )
}