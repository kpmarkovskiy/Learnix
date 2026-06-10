'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Attachment = { type: 'link' | 'file'; name: string; url: string; mime?: string }

type HW = {
  id: string
  title: string
  description: string | null
  deadline: string | null
  created_at: string
  attachments: Attachment[]
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

function AttachIcon({ mime }: { mime?: string }) {
  if (!mime) return <span>🔗</span>
  if (mime.startsWith('image/')) return <span>🖼️</span>
  if (mime.startsWith('video/')) return <span>🎬</span>
  if (mime.startsWith('audio/')) return <span>🎵</span>
  if (mime.includes('pdf'))      return <span>📄</span>
  if (mime.includes('word') || mime.includes('doc')) return <span>📝</span>
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

  // Вложения для нового задания
  const [newLink, setNewLink]           = useState('')
  const [newFiles, setNewFiles]         = useState<File[]>([])
  const [uploadingNew, setUploadingNew] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Стейт для окна проверки
  const [reviewing, setReviewing] = useState<{ subId: string; hwTitle: string; studentName: string } | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)

  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: hw } = await supabase
      .from('homework')
      .select('id, title, description, deadline, created_at, attachments')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
    const hwIds = (hw ?? []).map((h: { id: string }) => h.id)
    const { data: sb } = hwIds.length > 0
      ? await supabase
          .from('homework_submissions')
          .select('id, homework_id, student_id, comment, submitted_at, attachments, status, review_comment')
          .in('homework_id', hwIds)
      : { data: [] }
    setList(((hw ?? []) as any[]).map((h) => ({
      ...h,
      attachments: Array.isArray(h.attachments) ? h.attachments : [],
    })) as HW[])
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
    setSaving(true); setUploadingNew(true); setErr(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Загружаем файлы учителя
    const teacherAttachments: Attachment[] = []
    for (const file of newFiles) {
      const ext = file.name.split('.').pop()
const path = `teacher/${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('homework-attachments').upload(path, file)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('homework-attachments').getPublicUrl(path)
        teacherAttachments.push({ type: 'file', name: file.name, url: publicUrl, mime: file.type })
      }
    }
    // Добавляем ссылку
    const link = newLink.trim()
    if (link) {
      const url = link.startsWith('http') ? link : 'https://' + link
      teacherAttachments.push({ type: 'link', name: url, url })
    }

    const { error } = await supabase.from('homework').insert({
      teacher_id: user.id,
      title: title.trim(),
      description: desc.trim() || null,
      deadline: deadline || null,
      attachments: teacherAttachments,
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
      setNewLink(''); setNewFiles([])
      load()
    }
    setSaving(false); setUploadingNew(false)
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

      const { error: updateError } = await supabase
        .from('homework_submissions')
        .update({ status: action, review_comment: reviewComment.trim() || null })
        .eq('id', subId)

      if (updateError) {
        alert('Ошибка: ' + updateError.message)
        return
      }

      const hw = list.find((h) => h.id === sub.homework_id)
      const text = action === 'approved'
        ? `Работа «${hw?.title}» принята ✓`
        : `Работа «${hw?.title}» возвращена на доработку${reviewComment.trim() ? ': ' + reviewComment.trim() : ''}`

      const { error: rpcError } = await supabase.rpc('create_notification', {
        p_user_id: sub.student_id,
        p_text: text,
      })
      if (rpcError) {
        await supabase.from('notifications').insert({
          user_id: sub.student_id,
          text,
          is_read: false,
        })
      }

      setReviewing(null)
      setReviewComment('')
      load()
    } finally {
      setReviewLoading(false)
    }
  }

  const nameOf  = (id: string) => students.find((s) => s.id === id)?.name ?? 'Ученик'
  const subsFor = (hwId: string) => subs.filter((s) => s.homework_id === hwId)

  if (loading) return <p className="empty">Загрузка…</p>

  const pendingReviewCount = subs.filter((s) => s.status === 'submitted').length

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Модалка проверки */}
      {reviewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 600 }}>
            <h3 style={{ marginBottom: 4 }}>Проверка работы</h3>
<p style={{ fontSize: 14, color: 'var(--text-soft)', marginBottom: 16 }}>
  {reviewing.studentName} · {reviewing.hwTitle}
</p>
{(() => {
  const sub = subs.find((s) => s.id === reviewing.subId)
  return sub?.attachments?.length ? (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', margin: '0 0 8px' }}>Работа ученика:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {sub.attachments.map((a, i) => {
          const isImage = a.mime?.startsWith('image/')
          if (isImage) return (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', maxWidth: '100%' }}>
              <img src={a.url} alt={a.name} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
            </a>
          )
          return (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', textDecoration: 'none' }}>
              <AttachIcon mime={a.mime} />
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            </a>
          )
        })}
      </div>
      {sub.comment && (
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '10px 0 0', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {sub.comment}
        </p>
      )}
    </div>
  ) : null
})()}
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

        {/* ──── Блок вложений учителя ──── */}
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: 8 }}>
            Материалы к заданию (необязательно)
          </label>

          {/* Предпросмотр добавленных файлов */}
          {newFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {newFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 13 }}>
                  <AttachIcon mime={f.type} />
                  <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button
                    onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, lineHeight: 1, padding: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Поле для ссылки */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ flex: 1, minWidth: 200, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }}
              placeholder="Ссылка на материал (https://…)"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
            />
            <button
              className="lesson-cancel"
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              📎 Файл
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.zip"
              style={{ display: 'none' }}
              onChange={(e) => {
                const added = Array.from(e.target.files ?? [])
                setNewFiles((p) => [...p, ...added])
                e.target.value = ''
              }}
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '6px 0 0' }}>
            Ученики смогут открыть эти материалы при выполнении задания
          </p>
        </div>

        {err && <p className="enroll-msg-err">{err}</p>}
        <button className="btn" style={{ marginTop: 8 }} onClick={create} disabled={saving || uploadingNew}>
          {saving ? 'Создаём…' : 'Создать задание'}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="empty" style={{ marginTop: 20 }}>Заданий пока нет.</p>
      ) : (
        list.map((hw) => {
          const hwSubs      = subsFor(hw.id)
          const approvedIds = new Set(hwSubs.filter((s) => s.status === 'approved').map((s) => s.student_id))
          const submittedCount = hwSubs.filter((s) => s.status === 'submitted').length
          const overdue = hw.deadline ? new Date(hw.deadline) < new Date(new Date().toDateString()) : false

          return (
            <div className="card" key={hw.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ marginBottom: 4 }}>{hw.title}</h3>
                  {hw.description && (
                    <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 6px' }}>{hw.description}</p>
                  )}

                  {/* Вложения учителя */}
                  {hw.attachments?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
                      {hw.attachments.map((a, i) => {
                        const isImage = a.mime?.startsWith('image/')
                        const isVideo = a.mime?.startsWith('video/')
                        const isAudio = a.mime?.startsWith('audio/')
                        const isLink  = a.type === 'link'

                        if (isImage) return (
                          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', maxWidth: 320 }}>
                            <img src={a.url} alt={a.name} style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
                            <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-soft)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span>🖼️</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            </div>
                          </a>
                        )

                        if (isVideo) return (
                          <div key={i} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', maxWidth: 320 }}>
                            <video src={a.url} controls style={{ width: '100%', display: 'block', maxHeight: 200, background: '#000' }} />
                            <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-soft)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span>🎬</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            </div>
                          </div>
                        )

                        if (isAudio) return (
                          <div key={i} style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 320 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span>🎵</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            </div>
                            <audio src={a.url} controls style={{ width: '100%' }} />
                          </div>
                        )

                        return (
                          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))', borderRadius: 10, fontSize: 12, color: 'var(--text)', textDecoration: 'none', alignSelf: 'flex-start' }}>
                            <AttachIcon mime={a.mime} />
                            <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isLink ? (() => { try { return new URL(a.url).hostname } catch { return a.url } })() : a.name}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>↗</span>
                          </a>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
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
                      const sub  = hwSubs.find((x) => x.student_id === s.id)
                      const meta = sub ? STATUS_META[sub.status] : null

                      return (
                        <li key={s.id} className="lesson-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                          <span className="lesson-when" style={{ fontWeight: 500 }}>{nameOf(s.id)}</span>

                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 1, minWidth: 160 }}>
                            {sub ? (
                              <>
                                <span className={`badge ${meta!.cls}`}>{meta!.label}</span>

                                {/* Вложения ученика */}
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
                                        <AttachIcon mime={a.mime} />
                                        <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {a.type === 'link' ? (() => { try { return new URL(a.url).hostname } catch { return a.url } })() : a.name}
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {sub.comment && (
                                  <span style={{ fontSize: 12, color: 'var(--text-soft)', maxWidth: 240, textAlign: 'right' }}>
                                    {sub.comment}
                                  </span>
                                )}

                                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                  {new Date(sub.submitted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                                </span>

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