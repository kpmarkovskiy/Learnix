'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ProfileEdit() {
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus]       = useState<'idle' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg]       = useState('')
  const [loading, setLoading]     = useState(true)
  const fileRef                   = useRef<HTMLInputElement>(null)
  const supabase                  = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      supabase.from('profiles').select('name, avatar_url').eq('id', user.id).single()
        .then(({ data }) => {
          setName(data?.name ?? '')
          setAvatarUrl(data?.avatar_url ?? null)
          setLoading(false)
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadAvatar(file: File) {
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const ext = file.name.split('.').pop()
    const path = `${user.id}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (upErr) { setErrMsg(upErr.message); setStatus('err'); setUploading(false); return }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = data.publicUrl + '?t=' + Date.now()

    await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
    setAvatarUrl(url)
    setUploading(false)
  }

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

  const initials = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Личные данные</h3>
        <p className="card-hint">Обновите отображаемое имя и фото профиля.</p>

        {/* Аватарка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0' }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: avatarUrl ? 'transparent' : 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 700, color: '#fff',
              cursor: 'pointer', overflow: 'hidden',
              border: '2px solid var(--border)',
              flexShrink: 0,
            }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials
            }
          </div>
          <div>
            <button
              className="btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: 13 }}
            >
              {uploading ? 'Загружаем…' : 'Загрузить фото'}
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
              JPG или PNG, до 2 МБ
            </p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }}
        />

        <div className="field" style={{ marginTop: 8 }}>
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