'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CopyCode } from '@/components/copy-code'

const hhmm = (t: string) => t.slice(0, 5)
const fmtShort = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })

const AV = ['av-coral', 'av-blue', 'av-violet', 'av-teal', 'av-amber']
function avatarClass(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AV[Math.abs(h) % AV.length]
}

type Slot = { student_id: string; date: string; start_time: string; end_time: string }
type LessonStat = { student_id: string; status: string }
type Student = { id: string; name: string }

function MiniBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  return (
    <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginTop: 4 }}>
      <div style={{
        height: '100%', width: `${value}%`,
        background: color, borderRadius: 999, transition: 'width .4s',
      }} />
    </div>
  )
}

export function TeacherStudents({
  students,
  inviteCode,
}: {
  students: Student[]
  inviteCode: string | null
}) {
  const [avail, setAvail] = useState<Slot[]>([])
  const [lessons, setLessons] = useState<LessonStat[]>([])
  const supabase = createClient()
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  useEffect(() => {
    const ids = students.map((s) => s.id)
    if (ids.length === 0) return
    Promise.all([
      supabase
        .from('availability')
        .select('student_id, date, start_time, end_time')
        .in('student_id', ids)
        .gte('date', todayStr)
        .order('date')
        .order('start_time'),
      supabase
        .from('lessons')
        .select('student_id, status')
        .in('student_id', ids),
    ]).then(([{ data: av }, { data: ls }]) => {
      setAvail((av ?? []) as Slot[])
      setLessons((ls ?? []) as LessonStat[])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <section className="card" style={{ maxWidth: 460 }}>
        <h3>Код приглашения</h3>
        <p className="card-hint">Передайте код ученикам — по нему они запишутся к вам.</p>
        <div className="code-row">
          <span className="code-value">{inviteCode ?? '—'}</span>
          {inviteCode && <CopyCode code={inviteCode} />}
        </div>
      </section>

      {students.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 22 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
          <p className="empty">Пока никто не записался.</p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            Поделитесь кодом приглашения выше.
          </p>
        </div>
      ) : (
        <div className="student-grid" style={{ marginTop: 22 }}>
          {students.map((s) => {
            const slots = avail.filter((a) => a.student_id === s.id)
            const ls = lessons.filter((l) => l.student_id === s.id)
            const total     = ls.length
            const completed = ls.filter(l => l.status === 'completed').length
            const cancelled = ls.filter(l => l.status === 'cancelled').length
            const scheduled = ls.filter(l => l.status === 'scheduled').length
            const resolved  = completed + cancelled
            const pct       = resolved > 0 ? Math.round((completed / resolved) * 100) : null

            return (
              <section className="card" key={s.id}>
                {/* Шапка: аватар + имя */}
                <div className="stud-head">
                  <span className={`person-avatar ${avatarClass(s.name)}`}>
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="person-name">{s.name}</span>
                </div>

                {/* Статистика уроков */}
                {total > 0 && (
                  <div style={{
                    marginTop: 14,
                    padding: '12px 14px',
                    background: 'var(--surface-2)',
                    borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: pct !== null ? 8 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{total}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>уроков</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{completed}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>проведено</span>
                      </div>
                      {cancelled > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)', lineHeight: 1 }}>{cancelled}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>отменено</span>
                        </div>
                      )}
                      {scheduled > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-soft)', lineHeight: 1 }}>{scheduled}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>предстоит</span>
                        </div>
                      )}
                      {pct !== null && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 'auto' }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{pct}%</span>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>посещаемость</span>
                        </div>
                      )}
                    </div>
                    {pct !== null && <MiniBar value={pct} />}
                  </div>
                )}

                {/* Свободное время */}
                {slots.length > 0 ? (
                  <div className="chips" style={{ marginTop: 12 }}>
                    {slots.map((w, i) => (
                      <span className="chip" key={i} style={{ cursor: 'default' }}>
                        {fmtShort(w.date)} {hhmm(w.start_time)}–{hhmm(w.end_time)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="empty" style={{ marginTop: 12, fontSize: 13 }}>Свободное время не указано.</p>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
