'use client'

import { useState } from 'react'

const REASONS_TEACHER = [
  'Заболел',
  'Личные обстоятельства',
  'Технические проблемы',
  'Ученик не вышел на связь',
  'Другое',
]

const REASONS_STUDENT = [
  'Заболел',
  'Личные обстоятельства',
  'Технические проблемы',
  'Не успел подготовиться',
  'Другое',
]

type Props = {
  role: 'teacher' | 'student'
  lessonDate: string      // человекочитаемая строка, например "15 июня в 14:00"
  onConfirm: (reason: string, comment: string) => void
  onClose: () => void
}

export function CancelLessonModal({ role, lessonDate, onConfirm, onClose }: Props) {
  const reasons = role === 'teacher' ? REASONS_TEACHER : REASONS_STUDENT
  const [selected, setSelected] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  function handleConfirm() {
    if (!selected) return
    onConfirm(selected, comment.trim())
  }

  return (
    /* Затемнённый фон */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        backdropFilter: 'blur(2px)',
      }}
    >
      {/* Окно */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Заголовок */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
              Отмена урока
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-soft)' }}>
              {lessonDate}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-faint)', fontSize: 20, lineHeight: 1,
              padding: '2px 4px', borderRadius: 6,
            }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {/* Причины */}
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-soft)' }}>
            Выберите причину отмены <span style={{ color: 'var(--danger)' }}>*</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reasons.map(r => (
              <button
                key={r}
                onClick={() => setSelected(r)}
                style={{
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${selected === r ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected === r ? 'var(--accent-soft)' : 'var(--surface-2)',
                  color: selected === r ? 'var(--accent-strong)' : 'var(--text)',
                  fontSize: 14,
                  fontWeight: selected === r ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {selected === r ? '✓ ' : ''}{r}
              </button>
            ))}
          </div>
        </div>

        {/* Комментарий */}
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-soft)' }}>
            Комментарий <span style={{ fontWeight: 400 }}>(необязательно)</span>
          </p>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Дополнительная информация…"
            rows={3}
            style={{
              width: '100%',
              padding: '9px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 14,
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Кнопки */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="lesson-cancel"
            style={{ padding: '8px 18px', fontSize: 14 }}
          >
            Назад
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: selected ? 'var(--danger)' : 'var(--surface-2)',
              color: selected ? '#fff' : 'var(--text-faint)',
              fontSize: 14,
              fontWeight: 600,
              cursor: selected ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
            }}
          >
            Подтвердить отмену
          </button>
        </div>
      </div>
    </div>
  )
}