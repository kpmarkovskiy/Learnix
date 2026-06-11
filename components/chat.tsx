'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

async function getSignedUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from('chat-files')
    .createSignedUrl(filePath, 60 * 60)
  if (error) return null
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
  reply_to_id: string | null
  reply_to_text: string | null
  reply_to_sender: string | null
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
}) {
  const [mode, setMode]               = useState<ChatMode>('announcement')
  const [activePeer, setActivePeer]   = useState<Peer | null>(peers[0] ?? null)
  const [messages, setMessages]       = useState<Message[]>([])
  const [text, setText]               = useState('')
  const [file, setFile]               = useState<File | null>(null)
  const [replyTo, setReplyTo]         = useState<Message | null>(null)
  const [forwardMsg, setForwardMsg]   = useState<Message | null>(null)
  const [copiedId, setCopiedId]       = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [recording, setRecording]     = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [loading, setLoading]         = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  const bottomRef        = useRef<HTMLDivElement>(null)
  const textareaRef      = useRef<HTMLTextAreaElement>(null)
  const fileInputRef     = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    supabase.from('profiles').select('name').eq('id', currentUserId).single()
      .then(({ data }) => setCurrentUserName(data?.name ?? ''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMessages() {
    setLoading(true)
    let query = supabase
      .from('messages')
      .select('id, sender_id, receiver_id, text, file_url, reply_to_id, reply_to_text, reply_to_sender, created_at, chat_type, sender:profiles!messages_sender_id_fkey(name, avatar_url)')
      .order('created_at')

    if (mode === 'announcement') {
      const tId = role === 'teacher' ? currentUserId : teacherId
      query = query.eq('chat_type', 'announcement').eq('sender_id', tId ?? '')
    } else if (mode === 'group') {
      query = query.eq('chat_type', 'group')
    } else if (mode === 'direct' && activePeer) {
      query = query
        .eq('chat_type', 'direct')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${activePeer.id}),and(sender_id.eq.${activePeer.id},receiver_id.eq.${currentUserId})`)
    }

    const { data } = await query
    setMessages((data ?? []) as unknown as Message[])
    setLoading(false)
  }

  useEffect(() => {
    loadMessages()

    const channelKey = mode === 'direct'
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
          relevant = role === 'student' && teacherId
            ? msg.sender_id === teacherId || msg.sender_id === currentUserId
            : true
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
            const playTone = (freq: number, startTime: number, dur: number, gain: number) => {
              const osc = ctx.createOscillator()
              const g   = ctx.createGain()
              osc.connect(g); g.connect(ctx.destination)
              osc.type = 'sine'
              osc.frequency.setValueAtTime(freq, startTime)
              g.gain.setValueAtTime(0, startTime)
              g.gain.linearRampToValueAtTime(gain, startTime + 0.02)
              g.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
              osc.start(startTime); osc.stop(startTime + dur)
            }
            const t = ctx.currentTime
            playTone(880, t, 0.18, 0.12)
            playTone(1100, t + 0.12, 0.22, 0.09)
          } catch { /* ignore */ }
          return [...prev, { ...msg, sender: profile ?? undefined }]
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const deleted = payload.old as { id: string }
        setMessages(prev => prev.filter(m => m.id !== deleted.id))
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

  async function deleteMessage(id: string) {
    const { error } = await supabase.from('messages').delete().eq('id', id).eq('sender_id', currentUserId)
    if (!error) setMessages(prev => prev.filter(m => m.id !== id))
  }

  const fmtRecordTime = (sec: number) =>
    `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      audioChunksRef.current = []

      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())

        if (audioChunksRef.current.length === 0) {
          alert('Запись не удалась — нет данных')
          return
        }

        const mType = mr.mimeType || 'audio/webm'
        const blob  = new Blob(audioChunksRef.current, { type: mType })
        const ext   = mType.includes('ogg') ? 'ogg' : mType.includes('mp4') ? 'mp4' : 'webm'
        const fileName = `voice_${Date.now()}.${ext}`

        const { error: uploadErr } = await supabase.storage.from('chat-files').upload(fileName, blob)
        if (uploadErr) {
          alert(`Ошибка загрузки голосового: ${uploadErr.message}`)
          return
        }

        const payload: Record<string, unknown> = {
          sender_id: currentUserId,
          text: null,
          file_url: fileName,
          chat_type: mode,
          receiver_id: mode === 'direct' && activePeer ? activePeer.id : null,
          reply_to_id: null, reply_to_text: null, reply_to_sender: null,
        }
        const { error: insertErr } = await supabase.from('messages').insert(payload)
        if (insertErr) {
          alert(`Ошибка отправки: ${insertErr.message}`)
          return
        }

        const myName = currentUserName || 'пользователь'
        if (mode === 'announcement' && role === 'teacher') {
          for (const peer of peers) await supabase.rpc('create_notification', { p_user_id: peer.id, p_text: `🎤 Голосовое от ${myName}` })
        } else if (mode === 'group') {
          for (const peer of peers) await supabase.rpc('create_notification', { p_user_id: peer.id, p_text: `🎤 Голосовое в общем чате от ${myName}` })
        } else if (mode === 'direct' && activePeer) {
          await supabase.rpc('create_notification', { p_user_id: activePeer.id, p_text: `🎤 Голосовое от ${myName}` })
        }
      }

      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch {
      alert('Нет доступа к микрофону')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    setRecording(false)
  }

  async function copyMessage(msgId: string, t: string) {
    await navigator.clipboard.writeText(t)
    setCopiedId(msgId)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function forward(peer: Peer) {
    if (!forwardMsg) return
    await supabase.from('messages').insert({
      sender_id: currentUserId,
      text: forwardMsg.text,
      file_url: forwardMsg.file_url,
      chat_type: 'direct',
      receiver_id: peer.id,
      reply_to_id: null,
      reply_to_text: null,
      reply_to_sender: null,
    })
    await supabase.rpc('create_notification', {
      p_user_id: peer.id,
      p_text: `Новое сообщение от ${currentUserName || 'пользователя'}`,
    })
    setForwardMsg(null)
  }

  async function send() {
    if ((!text.trim() && !file) || !canWrite) return
    let uploadedFileUrl: string | null = null

    if (file) {
      const ext      = file.name.split('.').pop()
      const fileName = `${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('chat-files').upload(fileName, file)
      if (!error) uploadedFileUrl = fileName
    }

    const t = text.trim()
    setText('')
    setFile(null)
    setReplyTo(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const payload: Record<string, unknown> = {
      sender_id:       currentUserId,
      text:            t || null,
      file_url:        uploadedFileUrl,
      chat_type:       mode,
      receiver_id:     null,
      reply_to_id:     replyTo?.id     ?? null,
      reply_to_text:   replyTo?.text   ?? null,
      reply_to_sender: replyTo?.sender?.name ?? null,
    }

    if (mode === 'direct' && activePeer) {
      payload.receiver_id = activePeer.id
    }

    await supabase.from('messages').insert(payload)

    const myName = currentUserName || 'пользователь'
    if (mode === 'announcement' && role === 'teacher') {
      for (const peer of peers) {
        await supabase.rpc('create_notification', { p_user_id: peer.id, p_text: `📢 Объявление от ${myName}` })
      }
    } else if (mode === 'group') {
      for (const peer of peers) {
        await supabase.rpc('create_notification', { p_user_id: peer.id, p_text: `💬 Сообщение в общем чате от ${myName}` })
      }
    } else if (mode === 'direct' && activePeer) {
      await supabase.rpc('create_notification', { p_user_id: activePeer.id, p_text: `Новое сообщение от ${myName}` })
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const grouped   = groupByDay(messages)
  const chatTitle =
    mode === 'announcement' ? '📢 Объявления'
    : mode === 'group'      ? '👥 Общий чат'
    : activePeer            ? activePeer.name
    : 'Выберите собеседника'

  return (
    <div className="chat-layout">

      {/* ── Модалка пересылки ── */}
      {forwardMsg && (
        <div className="chat-forward-overlay" onClick={() => setForwardMsg(null)}>
          <div className="chat-forward-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>Переслать сообщение</h3>
            {forwardMsg.text && (
              <p style={{ fontSize: 13, color: 'var(--text-soft)', margin: '0 0 16px', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 10, borderLeft: '3px solid var(--accent)' }}>
                {forwardMsg.text}
              </p>
            )}
            {peers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Нет собеседников для пересылки</p>
            ) : (
              <ul className="people-list" style={{ marginBottom: 12 }}>
                {peers.map(peer => (
                  <li key={peer.id} className="person-row" style={{ cursor: 'pointer' }} onClick={() => forward(peer)}>
                    <Avatar name={peer.name} avatarUrl={peer.avatar_url} size={32} />
                    <span className="person-info">
                      <span className="person-name">{peer.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button className="lesson-cancel" onClick={() => setForwardMsg(null)}>Отмена</button>
          </div>
        </div>
      )}

      {/* ── Модалка удаления ── */}
      {confirmDeleteId && (
        <div className="chat-forward-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="chat-forward-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 320, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Удалить сообщение?</p>
            <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 20 }}>Это действие нельзя отменить</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="lesson-cancel" onClick={() => setConfirmDeleteId(null)}>Отмена</button>
              <button
                onClick={() => { deleteMessage(confirmDeleteId); setConfirmDeleteId(null) }}
                style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: 'var(--danger)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Сайдбар ── */}
      <aside className="chat-peers">
        <p className="chat-peers-label">Чаты</p>
        <button className={`chat-peer-btn ${mode === 'announcement' ? 'active' : ''}`} onClick={() => setMode('announcement')}>
          <span className="chat-peer-av">📢</span>
          <span className="chat-peer-name">Объявления</span>
        </button>
        <button className={`chat-peer-btn ${mode === 'group' ? 'active' : ''}`} onClick={() => setMode('group')}>
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

      {/* ── Основная область ── */}
      <div className="chat-main">
        <header className="chat-header">
          <span className="chat-header-name">{chatTitle}</span>
          {mode === 'announcement' && role === 'student' && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>только чтение</span>
          )}
        </header>

        <div className="chat-messages">
          {loading && <p className="chat-loading">Загрузка…</p>}
          {!loading && messages.length === 0 && (
            <p className="chat-no-msgs">
              {mode === 'announcement' && role === 'student' ? 'Объявлений пока нет' : 'Напишите первое сообщение'}
            </p>
          )}
          {grouped.map(({ day, msgs }) => (
            <div key={day}>
              <div className="chat-day-sep"><span>{day}</span></div>
              {msgs.map((msg) => {
                const mine = msg.sender_id === currentUserId
                return (
                  <div key={msg.id} className={`chat-msg-row ${mine ? 'mine' : 'theirs'}`}>
                    {!mine && <Avatar name={msg.sender?.name ?? '?'} avatarUrl={msg.sender?.avatar_url} size={32} />}

                    {/* Панель действий */}
                    <div className="chat-msg-actions">
                      <button className="chat-action-btn" title="Ответить"
                        onClick={() => { setReplyTo(msg); textareaRef.current?.focus() }}>↩</button>
                      {msg.text && (
                        <button className="chat-action-btn"
                          title={copiedId === msg.id ? 'Скопировано!' : 'Копировать'}
                          onClick={() => copyMessage(msg.id, msg.text!)}>
                          {copiedId === msg.id ? '✓' : '⊡'}
                        </button>
                      )}
                      {peers.length > 0 && (
                        <button className="chat-action-btn" title="Переслать"
                          onClick={() => setForwardMsg(msg)}>⇥</button>
                      )}
                      {mine && (
                        <button className="chat-action-btn" title="Удалить"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => setConfirmDeleteId(msg.id)}>✕</button>
                      )}
                    </div>

                    <div className="chat-msg-body">
                      {!mine && mode !== 'direct' && (
                        <span className="chat-sender-name">{msg.sender?.name}</span>
                      )}
                      <div className="chat-bubble">
                        {/* Цитата */}
                        {msg.reply_to_id && (
                          <div className="chat-reply-ref">
                            <span className="chat-reply-ref-sender">{msg.reply_to_sender}</span>
                            <span className="chat-reply-ref-text">{msg.reply_to_text}</span>
                          </div>
                        )}
                        <span className="chat-bubble-text">{msg.text}</span>
                        {msg.file_url && <FileLink filePath={msg.file_url} />}
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
          <>
            {/* Черновик ответа */}
            {replyTo && (
              <div className="chat-reply-draft">
                <div>
                  <span className="chat-reply-draft-label">↩ {replyTo.sender?.name ?? 'Вы'}</span>
                  <span className="chat-reply-draft-text">{replyTo.text}</span>
                </div>
                <button onClick={() => setReplyTo(null)}>×</button>
              </div>
            )}
            <div className="chat-input-row">
              <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {!recording && (
                <button type="button" className="chat-send-btn" onClick={() => fileInputRef.current?.click()} title="Прикрепить файл">📎</button>
              )}
              {!recording && file && (
                <span style={{ fontSize: 12, color: 'var(--text-soft)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </span>
              )}
              {recording && (
                <span className="chat-recording-indicator">
                  <span className="chat-recording-dot" />
                  {fmtRecordTime(recordingTime)}
                </span>
              )}
              <textarea
                ref={textareaRef}
                className="chat-input"
                value={text}
                onChange={handleInput}
                onKeyDown={onKey}
                placeholder={
                  mode === 'announcement' ? 'Написать объявление всем ученикам…'
                  : mode === 'group'      ? 'Написать в общий чат…'
                  : `Написать ${activePeer?.name ?? ''}…`
                }
                rows={1}
              />
              {!recording ? (
                <button type="button" className="chat-send-btn" onClick={startRecording} title="Голосовое сообщение">🎤</button>
              ) : (
                <button type="button" className="chat-send-btn chat-send-btn--stop" onClick={stopRecording} title="Остановить и отправить">⏹ Отправить</button>
              )}
              {!recording && (
                <button onClick={send} disabled={!text.trim() && !file} className="chat-send-btn">
                  Отправить
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
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
    getSignedUrl(filePath).then(setUrl)
  }, [filePath])

  if (!url) return <div style={{ fontSize: 13 }}>⏳ Загрузка файла...</div>

  const isAudio = /\.(webm|ogg|mp3|m4a|wav|mp4)$/i.test(filePath) && filePath.startsWith('voice_')
  if (isAudio) {
    return (
      <div style={{ marginTop: 6 }}>
        <audio controls src={url} style={{ width: '100%', maxWidth: 280, height: 36 }} />
      </div>
    )
  }

  const lower = filePath.toLowerCase()
  const isImage = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(filePath)

  let icon = '📄'
  if (lower.endsWith('.pdf')) icon = '📕'
  else if (lower.endsWith('.doc') || lower.endsWith('.docx')) icon = '📝'
  else if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) icon = '📊'
  else if (lower.endsWith('.zip') || lower.endsWith('.rar')) icon = '🗜️'
  else if (isImage) icon = '🖼️'

  return (
    <div style={{ marginTop: 8, padding: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isImage && (
        <img src={url} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: 250, objectFit: 'cover' }} />
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>{icon} {filePath.split('/').pop()}</span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, textDecoration: 'none', color: 'var(--text)' }}>
          Скачать
        </a>
      </div>
    </div>
  )
}
