'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

async function getSignedUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from('chat-files')
    .createSignedUrl(filePath, 60 * 60)

  if (error) {
    console.error('SIGNED URL ERROR:', error)
    return null
  }

  return data.signedUrl
}

type Message = {
  id: string
  sender_id: string
  receiver_id: string | null
  text: string | null
  file_url: string | null
  created_at: string
  chat_type: 'direct' | 'announcement' | 'group'
  sender?: { name: string; avatar_url: string | null }
}

type Peer = { id: string; name: string; avatar_url?: string | null }
type ChatMode = 'announcement' | 'group' | 'direct'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

function groupByDay(messages: Message[]) {
  const grouped: { day: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const day = fmtDay(msg.created_at)
    if (!grouped.length || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, msgs: [msg] })
    } else {
      grouped[grouped.length - 1].msgs.push(msg)
    }
  }
  return grouped
}

function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarUrl ? 'transparent' : 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: '#fff',
      overflow: 'hidden', flexShrink: 0,
      border: '1.5px solid var(--border)',
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.charAt(0).toUpperCase()
      }
    </div>
  )
}

export function Chat({
  peers,
  currentUserId,
  role,
  teacherId,
  currentUserAvatar,
}: {
  peers: Peer[]
  currentUserId: string
  role: 'teacher' | 'student'
  teacherId?: string
  currentUserAvatar?: string | null
}) 

{
  const [mode, setMode] = useState<ChatMode>('announcement')
  const [activePeer, setActivePeer] = useState<Peer | null>(peers[0] ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('profiles').select('name').eq('id', currentUserId).single()
      .then(({ data }) => setCurrentUserName(data?.name ?? ''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMessages() {
    setLoading(true)
    let query = supabase
      .from('messages')
      .select('id, sender_id, receiver_id, text, file_url, created_at, chat_type, sender:profiles!messages_sender_id_fkey(name, avatar_url)')
      .order('created_at')

    if (mode === 'announcement') {
      const tId = role === 'teacher' ? currentUserId : teacherId
      query = query.eq('chat_type', 'announcement').eq('sender_id', tId ?? '')
    } else if (mode === 'group') {
  query = query.eq('chat_type', 'group')
} else if (mode === 'direct' && activePeer) {
      query = query
        .eq('chat_type', 'direct')
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${activePeer.id}),and(sender_id.eq.${activePeer.id},receiver_id.eq.${currentUserId})`
        )
    }

    const { data } = await query
    setMessages((data ?? []) as unknown as Message[])
    setLoading(false)
  }

  useEffect(() => {
    loadMessages()

    const channelKey =
      mode === 'direct'
        ? `chat-direct-${currentUserId}-${activePeer?.id}`
        : `chat-${mode}-${currentUserId}`

    const channel = supabase
      .channel(channelKey)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as Message

        let relevant = false
        if (mode === 'announcement' && msg.chat_type === 'announcement') {
          const tId = role === 'teacher' ? currentUserId : teacherId
          relevant = msg.sender_id === tId
        } else if (mode === 'group' && msg.chat_type === 'group') {
          if (role === 'student' && teacherId) {
            relevant = msg.sender_id === teacherId || msg.sender_id === currentUserId
          } else {
            relevant = true
          }
        } else if (mode === 'direct' && msg.chat_type === 'direct' && activePeer) {
          relevant =
            (msg.sender_id === currentUserId && msg.receiver_id === activePeer.id) ||
            (msg.sender_id === activePeer.id && msg.receiver_id === currentUserId)
        }

        if (!relevant) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, avatar_url')
          .eq('id', msg.sender_id)
          .single()

        setMessages((prev) => {
  if (prev.some((m) => m.id === msg.id)) return prev
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const playTone = (freq: number, startTime: number, duration: number, gainValue: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }
    const t = ctx.currentTime
    playTone(880, t, 0.18, 0.12)
    playTone(1100, t + 0.12, 0.22, 0.09)
  } catch { /* ignore */ }
  return [...prev, { ...msg, sender: profile ?? undefined }]
})
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activePeer?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const canWrite =
    mode === 'direct' ||
    mode === 'group' ||
    (mode === 'announcement' && role === 'teacher')

  async function send() {
    if ((!text.trim() && !file) || !canWrite) return
    let uploadedFileUrl: string | null = null

  if (file) {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('chat-files')
    .upload(fileName, file)

  console.log('UPLOAD ERROR:', error)

  if (!error) {
    uploadedFileUrl = fileName
  }
}
    const t = text.trim()
    setText('')
    setFile(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const payload: Record<string, unknown> = {
      sender_id: currentUserId,
      text: t,
      file_url: uploadedFileUrl,
      chat_type: mode,
      receiver_id: null,
    }

    if (mode === 'direct' && activePeer) {
      payload.receiver_id = activePeer.id
    }

    await supabase.from('messages').insert(payload)

    const myName = currentUserName || 'пользователь'

    if (mode === 'announcement' && role === 'teacher') {
      for (const peer of peers) {
        await supabase.rpc('create_notification', {
          p_user_id: peer.id,
          p_text: `📢 Объявление от ${myName}`,
        })
      }
    } else if (mode === 'group') {
      for (const peer of peers) {
        await supabase.rpc('create_notification', {
          p_user_id: peer.id,
          p_text: `💬 Сообщение в общем чате от ${myName}`,
        })
      }
    } else if (mode === 'direct' && activePeer) {
      await supabase.rpc('create_notification', {
        p_user_id: activePeer.id,
        p_text: `Новое сообщение от ${myName}`,
      })
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const grouped = groupByDay(messages)

  const chatTitle =
    mode === 'announcement' ? '📢 Объявления'
    : mode === 'group' ? '👥 Общий чат'
    : activePeer ? activePeer.name
    : 'Выберите собеседника'

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className="chat-peers">
        <p className="chat-peers-label">Чаты</p>

        <button
          className={`chat-peer-btn ${mode === 'announcement' ? 'active' : ''}`}
          onClick={() => setMode('announcement')}
        >
          <span className="chat-peer-av">📢</span>
          <span className="chat-peer-name">Объявления</span>
        </button>

        <button
          className={`chat-peer-btn ${mode === 'group' ? 'active' : ''}`}
          onClick={() => setMode('group')}
        >
          <span className="chat-peer-av">👥</span>
          <span className="chat-peer-name">Общий чат</span>
        </button>

        {peers.length > 0 && (
          <>
            <p className="chat-peers-label" style={{ marginTop: 12 }}>Личные</p>
            {peers.map((p) => (
              <button
                key={p.id}
                className={`chat-peer-btn ${mode === 'direct' && activePeer?.id === p.id ? 'active' : ''}`}
                onClick={() => { setMode('direct'); setActivePeer(p) }}
              >
                <Avatar name={p.name} avatarUrl={p.avatar_url} size={28} />
                <span className="chat-peer-name">{p.name}</span>
              </button>
            ))}
          </>
        )}
      </aside>

      {/* Main */}
      <div className="chat-main">
        <header className="chat-header">
          <span className="chat-header-name">{chatTitle}</span>
          {mode === 'announcement' && role === 'student' && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>
              только чтение
            </span>
          )}
        </header>

        <div className="chat-messages">
          {loading && <p className="chat-loading">Загрузка…</p>}
          {!loading && messages.length === 0 && (
            <p className="chat-no-msgs">
              {mode === 'announcement' && role === 'student'
                ? 'Объявлений пока нет'
                : 'Напишите первое сообщение'}
            </p>
          )}
          {grouped.map(({ day, msgs }) => (
            <div key={day}>
              <div className="chat-day-sep"><span>{day}</span></div>
              {msgs.map((msg) => {
                const mine = msg.sender_id === currentUserId
                return (
                  <div key={msg.id} className={`chat-msg-row ${mine ? 'mine' : 'theirs'}`}>
                    {!mine && (
                      <Avatar
                        name={msg.sender?.name ?? '?'}
                        avatarUrl={msg.sender?.avatar_url}
                        size={32}
                      />
                    )}
                    <div className="chat-msg-body">
                      {!mine && mode !== 'direct' && (
                        <span className="chat-sender-name">{msg.sender?.name}</span>
                      )}
                      <div className="chat-bubble">
                        <span className="chat-bubble-text">{msg.text}</span>
                        {msg.file_url && (
                          <FileLink filePath={msg.file_url} />
                        )}
                        <span className="chat-bubble-time">{fmtTime(msg.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {canWrite ? (
          <div className="chat-input-row">
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              className="chat-send-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📎
            </button>
            {file && (
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-soft)',
                  maxWidth: 150,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {file.name}
              </span>
            )}
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={text}
              onChange={handleInput}
              onKeyDown={onKey}
              placeholder={
                mode === 'announcement'
                  ? 'Написать объявление всем ученикам…'
                  : mode === 'group'
                  ? 'Написать в общий чат…'
                  : `Написать ${activePeer?.name ?? ''}…`
              }
              rows={1}
            />
            <button onClick={send} disabled={!text.trim()} className="chat-send-btn">
              Отправить
            </button>
          </div>
        ) : (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
            color: 'var(--text-faint)',
            fontSize: 13,
          }}>
            Только учитель может писать объявления
          </div>
        )}
      </div>
    </div>
  )
}

function FileLink({ filePath }: { filePath: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const signed = await getSignedUrl(filePath)
      setUrl(signed)
    }

    load()
  }, [filePath])

  if (!url) {
    return <div style={{ fontSize: 13 }}>⏳ Загрузка файла...</div>
  }

  const isImage =
    filePath.endsWith('.png') ||
    filePath.endsWith('.jpg') ||
    filePath.endsWith('.jpeg') ||
    filePath.endsWith('.webp')

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        background: '#f3f4f6',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {isImage && (
        <img
          src={url}
          style={{
            width: '100%',
            borderRadius: 8,
            maxHeight: 250,
            objectFit: 'cover',
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 13 }}>
          📎 {filePath.split('/').pop()}
        </span>

        {/* ✅ ВАЖНО: это и есть скачивание */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft: 'auto',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: 'white',
            cursor: 'pointer',
            fontSize: 13,
            textDecoration: 'none',
            color: '#000',
          }}
        >
          Скачать
        </a>
      </div>
    </div>
  )
}