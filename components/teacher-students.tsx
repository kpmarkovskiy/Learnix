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
type Student = { id: string; name: string }

export function TeacherStudents({
  students,
  inviteCode,
}: {
  students: Student[]
  inviteCode: string | null
}) {
  const [avail, setAvail] = useState<Slot[]>([])
  const supabase = createClient()
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  useEffect(() => {
    const ids = students.map((s) => s.id)
    if (ids.length === 0) return
    supabase
      .from('availability')
      .select('student_id, date, start_time, end_time')
      .in('student_id', ids)
      .gte('date', todayStr)
      .order('date')
      .order('start_time')
      .then(({ data }) => setAvail((data ?? []) as Slot[]))
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
        <p className="empty" style={{ marginTop: 22 }}>Пока никто не записался.</p>
      ) : (
        <div className="student-grid" style={{ marginTop: 22 }}>
          {students.map((s) => {
            const slots = avail.filter((a) => a.student_id === s.id)
            return (
              <section className="card" key={s.id}>
                <div className="stud-head">
                  <span className={`person-avatar ${avatarClass(s.name)}`}>
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="person-name">{s.name}</span>
                </div>
                {slots.length > 0 ? (
                  <div className="chips" style={{ marginTop: 12 }}>
                    {slots.map((w, i) => (
                      <span className="chip" key={i} style={{ cursor: 'default' }}>
                        {fmtShort(w.date)} {hhmm(w.start_time)}–{hhmm(w.end_time)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="empty" style={{ marginTop: 12 }}>Свободное время не указано.</p>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
