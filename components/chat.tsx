'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Message = {
  id: string
  sender_id: string
  receiver_id: string | null
  text: string | null
  created_at: string
  chat_type: 'direct' | 'announcement' | 'group'
  sender?: { name: string }
}

type Peer = { id: string; name: string }
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

export function Chat({
  peers,
  currentUserId,
  role,
  teacherId,
}: {
  peers: Peer[]
  currentUserId: string
  role: 'teacher' | 'student'
  teacherId?: string // для студента — id его учителя
}) {
  const [mode, setMode] = useState<ChatMode>(role === 'teacher' ? 'announcement' : 'announcement')
  const [activePeer, setActivePeer] = useState<Peer | null>(peers[0] ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Загрузка сообщений в зависимости от режима
  async function loadMessages() {
    setLoading(true)
    let query = supabase
      .from('messages')
      .select('id, sender_id, receiver_id, text, created_at, chat_type, sender:profiles!messages_sender_id_fkey(name)')
      .order('created_at')

    if (mode === 'announcement') {
      // Объявления: chat_type=announcement, от учителя (teacherId или currentUserId если учитель)
      const tId = role === 'teacher' ? currentUserId : teacherId
      query = query.eq('chat_type', 'announcement').eq('sender_id', tId ?? '')
    } else if (mode === 'group') {
      // Групповой: chat_type=group
      // Для студента — только от его учителя
      if (role === 'student' && teacherId) {
        query = query.eq('chat_type', 'group').or(`sender_id.eq.${teacherId},sender_id.eq.${currentUserId}`)
      } else {
        query = query.eq('chat_type', 'group')
      }
    } else if (mode === 'direct' && activePeer) {
      // Личный: между двумя людьми
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
          .select('name')
          .eq('id', msg.sender_id)
          .single()

        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
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

  // Может ли пользователь писать в текущем режиме
  const canWrite =
    mode === 'direct' ||
    mode === 'group' ||
    (mode === 'announcement' && role === 'teacher')

  async function send() {
    if (!text.trim() || !canWrite) return
    const t = text.trim()
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const payload: Record<string, unknown> = {
      sender_id: currentUserId,
      text: t,
      chat_type: mode,
      receiver_id: null,
    }

    if (mode === 'direct' && activePeer) {
      payload.receiver_id = activePeer.id
    }

    await supabase.from('messages').insert(payload)

    // Уведомления
    const { data: me } = await supabase.from('profiles').select('name').eq('id', currentUserId).single()
    const myName = me?.name ?? 'пользователь'

    if (mode === 'announcement' && role === 'teacher') {
      // Уведомить всех учеников
      for (const peer of peers) {
        await supabase.rpc('create_notification', {
          p_user_id: peer.id,
          p_text: `📢 Объявление от ${myName}`,
        })
      }
    } else if (mode === 'group') {
      // Уведомить всех кроме себя
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

  // Заголовок активного чата
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

        {/* Объявления */}
        <button
          className={`chat-peer-btn ${mode === 'announcement' ? 'active' : ''}`}
          onClick={() => setMode('announcement')}
        >
          <span className="chat-peer-av">📢</span>
          <span className="chat-peer-name">Объявления</span>
        </button>

        {/* Общий чат */}
        <button
          className={`chat-peer-btn ${mode === 'group' ? 'active' : ''}`}
          onClick={() => setMode('group')}
        >
          <span className="chat-peer-av">👥</span>
          <span className="chat-peer-name">Общий чат</span>
        </button>

        {/* Личные переписки */}
        {peers.length > 0 && (
          <>
            <p className="chat-peers-label" style={{ marginTop: 12 }}>Личные</p>
            {peers.map((p) => (
              <button
                key={p.id}
                className={`chat-peer-btn ${mode === 'direct' && activePeer?.id === p.id ? 'active' : ''}`}
                onClick={() => { setMode('direct'); setActivePeer(p) }}
              >
                <span className="chat-peer-av">{p.name.charAt(0).toUpperCase()}</span>
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
                    {!mine && mode !== 'direct' && (
                      <span className="chat-sender-name">{msg.sender?.name}</span>
                    )}
                    <div className="chat-bubble">
                      <span className="chat-bubble-text">{msg.text}</span>
                      <span className="chat-bubble-time">{fmtTime(msg.created_at)}</span>
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
