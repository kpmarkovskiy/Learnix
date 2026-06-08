'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ProfileEdit() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [status, setStatus]   = useState<'idle' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg]   = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      supabase.from('profiles').select('name').eq('id', user.id).single()
        .then(({ data }) => {
          setName(data?.name ?? '')
          setLoading(false)
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setErrMsg('Имя не может быть пустым'); setStatus('err'); return }
    setSaving(true); setStatus('idle')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({ name: trimmed }).eq('id', user.id)
    if (error) { setErrMsg(error.message); setStatus('err') }
    else        { setName(trimmed); setStatus('ok') }
    setSaving(false)
    if (!error) setTimeout(() => setStatus('idle'), 3000)
  }

  if (loading) return <p className="empty">Загрузка…</p>

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Личные данные</h3>
        <p className="card-hint">Обновите отображаемое имя в платформе.</p>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Email</label>
          <input value={email} disabled style={{ opacity: .55, cursor: 'not-allowed' }} />
        </div>

        <div className="field">
          <label>Имя</label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setStatus('idle') }}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            placeholder="Как вас зовут?"
            autoComplete="off"
          />
        </div>

        {status === 'err' && (
          <p style={{ fontSize: 13, color: 'var(--danger)', margin: '0 0 12px' }}>{errMsg}</p>
        )}
        {status === 'ok' && (
          <p style={{ fontSize: 13, color: 'var(--accent-strong)', margin: '0 0 12px' }}>
            Имя успешно обновлено.
          </p>
        )}

        <button className="btn" style={{ marginTop: 4 }} onClick={save} disabled={saving}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
