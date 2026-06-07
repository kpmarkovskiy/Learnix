'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function EnrollForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function enroll() {
    if (!code.trim()) return
    setLoading(true)
    setMsg(null)

    const supabase = createClient()
    const { error } = await supabase.rpc('enroll_by_code', { p_code: code.trim() })

    if (error) {
      setMsg({ type: 'err', text: error.message })
      setLoading(false)
      return
    }

    setMsg({ type: 'ok', text: 'Готово! Вы записаны.' })
    setCode('')
    setLoading(false)
    router.refresh() // перечитать список учителей на странице
  }

  return (
    <div>
      <div className="enroll-form">
        <input
          className="enroll-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Код учителя"
          maxLength={6}
        />
        <button className="btn enroll-btn" onClick={enroll} disabled={loading}>
          {loading ? 'Записываем…' : 'Записаться'}
        </button>
      </div>
      {msg && (
        <p className={msg.type === 'ok' ? 'enroll-msg-ok' : 'enroll-msg-err'}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
