'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Message = {
  id: string
  sender_id: string
  receiver_id: string | null
  text: string | null
  created_at: string
  sender?: { name: string }
}

type Peer = { id: string; name: string }

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

export function Chat({ peers, currentUserId }: { peers: Peer[]; currentUserId: string }) {
  const [activePeer, setActivePeer] = useState<Peer | null>(peers[0] ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  async function loadMessages(peerId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, text, created_at, sender:profiles!messages_sender_id_fkey(name)')
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${currentUserId})`
      )
      .order('created_at')
    setMessages((data ?? []) as unknown as Message[])
    setLoading(false)
  }

  useEffect(() => {
    if (!activePeer) return
    loadMessages(activePeer.id)

    const channel = supabase
      .channel(`chat-${currentUserId}-${activePeer.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const msg = payload.new as Message
          const isRelevant =
            (msg.sender_id === currentUserId && msg.receiver_id === activePeer.id) ||
            (msg.sender_id === activePeer.id && msg.receiver_id === currentUserId)
          if (!isRelevant) return
          // fetch sender name
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', msg.sender_id)
            .single()
          setMessages((prev) => [...prev, { ...msg, sender: profile ?? undefined }])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePeer?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!text.trim() || !activePeer) return
    const t = text.trim()
    setText('')

    if (textareaRef.current) {
  textareaRef.current.style.height = 'auto'
}
    await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: activePeer.id,
      text: t,
    })
    // Уведомление собеседнику
    const { data: me } = await supabase.from('profiles').select('name').eq('id', currentUserId).single()
    await supabase.rpc('create_notification', {
      p_user_id: activePeer.id,
      p_text: `Новое сообщение от ${me?.name ?? 'пользователя'}`,
    })
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

  if (peers.length === 0) {
    return (
      <div className="chat-empty-state">
        <p>Нет собеседников. Дождитесь, пока к вам запишутся ученики, или запишитесь к учителю.</p>
      </div>
    )
  }

  // Group messages by day
  const grouped: { day: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const day = fmtDay(msg.created_at)
    if (!grouped.length || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, msgs: [msg] })
    } else {
      grouped[grouped.length - 1].msgs.push(msg)
    }
  }

  return (
    <div className="chat-layout">
      {/* Sidebar: list of peers */}
      <aside className="chat-peers">
        <p className="chat-peers-label">Переписки</p>
        {peers.map((p) => (
          <button
            key={p.id}
            className={`chat-peer-btn ${activePeer?.id === p.id ? 'active' : ''}`}
            onClick={() => setActivePeer(p)}
          >
            <span className="chat-peer-av">{p.name.charAt(0).toUpperCase()}</span>
            <span className="chat-peer-name">{p.name}</span>
          </button>
        ))}
      </aside>

      {/* Main chat area */}
      <div className="chat-main">
        {activePeer && (
          <header className="chat-header">
            <span className="chat-peer-av sm">{activePeer.name.charAt(0).toUpperCase()}</span>
            <span className="chat-header-name">{activePeer.name}</span>
          </header>
        )}

        <div className="chat-messages">
          {loading && <p className="chat-loading">Загрузка…</p>}
          {!loading && messages.length === 0 && (
            <p className="chat-no-msgs">Напишите первое сообщение</p>
          )}
          {grouped.map(({ day, msgs }) => (
            <div key={day}>
              <div className="chat-day-sep"><span>{day}</span></div>
              {msgs.map((msg) => {
                const mine = msg.sender_id === currentUserId
                return (
                  <div key={msg.id} className={`chat-msg-row ${mine ? 'mine' : 'theirs'}`}>
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

        <div className="chat-input-row">
  <textarea
    className="chat-input"
    value={text}
    onChange={(e) => setText(e.target.value)}
  />

  <button
    onClick={send}
    disabled={!text.trim()}
    className="chat-send-btn"
  >
    Отправить
  </button>
</div>
      </div>
    </div>
  )
}
