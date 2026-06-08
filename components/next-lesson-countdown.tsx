'use client'

import { useEffect, useState } from 'react'

type Lesson = {
  id: string
  date: string
  start_time: string
  end_time: string
  status: string
  teacher?: { name: string }
}

function getNextLesson(lessons: Lesson[]): Lesson | null {
  const now = new Date()
  const upcoming = lessons
    .filter((l) => l.status === 'scheduled')
    .filter((l) => {
      // считаем урок "идущим" пока не закончился (end_time)
      const end = new Date(`${l.date}T${l.end_time}`)
      return end > now
    })
    .sort((a, b) => {
      const da = new Date(`${a.date}T${a.start_time}`).getTime()
      const db = new Date(`${b.date}T${b.start_time}`).getTime()
      return da - db
    })
  return upcoming[0] ?? null
}

function getTimeUntil(lesson: Lesson): { days: number; hours: number; minutes: number; seconds: number; total: number } {
  const now = new Date().getTime()
  const target = new Date(`${lesson.date}T${lesson.start_time}`).getTime()
  const total = Math.max(0, target - now)

  const seconds = Math.floor((total / 1000) % 60)
  const minutes = Math.floor((total / 1000 / 60) % 60)
  const hours = Math.floor((total / 1000 / 60 / 60) % 24)
  const days = Math.floor(total / 1000 / 60 / 60 / 24)

  return { days, hours, minutes, seconds, total }
}

function fmtDate(d: string, t: string) {
  const dt = new Date(`${d}T${t}`)
  return dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function NextLessonCountdown({ lessons }: { lessons: Lesson[] }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const next = getNextLesson(lessons)

  // Отладка: видно в консоли браузера
  // console.log('[NextLessonCountdown] lessons:', lessons, '→ next:', next)

  if (!next) return null

  const { days, hours, minutes, seconds, total } = getTimeUntil(next)

  // Урок начнётся прямо сейчас
  const isNow = total === 0

  // Менее 1 часа — «срочно»
  const isUrgent = total > 0 && total < 60 * 60 * 1000
  // Менее 24 часов — «скоро»
  const isSoon = total > 0 && total < 24 * 60 * 60 * 1000 && !isUrgent

  return (
    <>
      <style>{`
        .nxl-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px 24px;
          margin-bottom: 20px;
          position: relative;
          overflow: hidden;
          transition: border-color .2s;
        }
        .nxl-card.urgent {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .nxl-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--accent);
          border-radius: var(--radius) var(--radius) 0 0;
          opacity: 0;
          transition: opacity .3s;
        }
        .nxl-card.urgent::before,
        .nxl-card.soon::before {
          opacity: 1;
        }
        .nxl-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 4px;
        }
        .nxl-when {
          font-size: 14px;
          color: var(--text-soft);
          margin-bottom: 16px;
          text-transform: capitalize;
        }
        .nxl-when strong {
          color: var(--text);
          font-weight: 600;
        }
        .nxl-tiles {
          display: flex;
          gap: 10px;
          align-items: flex-end;
        }
        .nxl-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 52px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 8px 8px;
          transition: background .2s, transform .15s;
        }
        .nxl-card.urgent .nxl-tile {
          background: color-mix(in srgb, var(--accent) 12%, var(--surface));
        }
        .nxl-num {
          font-family: var(--font-display), Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          line-height: 1;
          color: var(--text);
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
          min-width: 2ch;
          text-align: center;
        }
        .nxl-card.urgent .nxl-num {
          color: var(--accent-strong);
        }
        .nxl-unit {
          font-size: 11px;
          color: var(--text-faint);
          margin-top: 3px;
          font-weight: 500;
        }
        .nxl-sep {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-faint);
          margin-bottom: 14px;
          line-height: 1;
        }
        .nxl-now {
          font-size: 20px;
          font-weight: 700;
          color: var(--accent);
          animation: nxl-pulse 1s ease-in-out infinite;
        }
        .nxl-teacher {
          margin-top: 12px;
          font-size: 13px;
          color: var(--text-soft);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .nxl-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--accent);
          animation: nxl-blink 1.4s ease-in-out infinite;
          flex-shrink: 0;
        }
        .nxl-card:not(.urgent) .nxl-dot { animation: none; background: var(--text-faint); }
        @keyframes nxl-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes nxl-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div className={`nxl-card ${isUrgent ? 'urgent' : ''} ${isSoon ? 'soon' : ''}`}>
        <div className="nxl-label">⏱ Следующий урок</div>
        <div className="nxl-when">
          <strong>{fmtDate(next.date, next.start_time)}</strong>
          {'  '}·{'  '}
          {next.start_time.slice(0, 5)}–{next.end_time.slice(0, 5)}
        </div>

        {isNow ? (
          <div className="nxl-now">Урок идёт прямо сейчас! 🎉</div>
        ) : (
          <div className="nxl-tiles">
            {days > 0 && (
              <>
                <div className="nxl-tile">
                  <span className="nxl-num">{days}</span>
                  <span className="nxl-unit">{days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</span>
                </div>
                <span className="nxl-sep">:</span>
              </>
            )}
            <div className="nxl-tile">
              <span className="nxl-num">{pad(hours)}</span>
              <span className="nxl-unit">ч</span>
            </div>
            <span className="nxl-sep">:</span>
            <div className="nxl-tile">
              <span className="nxl-num">{pad(minutes)}</span>
              <span className="nxl-unit">мин</span>
            </div>
            <span className="nxl-sep">:</span>
            <div className="nxl-tile">
              <span className="nxl-num">{pad(seconds)}</span>
              <span className="nxl-unit">сек</span>
            </div>
          </div>
        )}

        {next.teacher?.name && (
          <div className="nxl-teacher">
            <span className="nxl-dot" />
            {next.teacher.name}
          </div>
        )}
      </div>
    </>
  )
}