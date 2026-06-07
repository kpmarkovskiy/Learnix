'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'

type Note = { id: string; text: string; is_read: boolean; created_at: string }

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

const S: Record<string, CSSProperties> = {
  wrap: { position: 'relative', display: 'inline-block' },
  btn: {
    position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 10,
    background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
  },
  badge: {
    position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px',
    borderRadius: 999, background: 'var(--danger, #ef4444)', color: '#fff', fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  },
  panel: {
    position: 'absolute', top: 48, right: 0, width: 300, maxHeight: 380, overflowY: 'auto',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
    boxShadow: '0 12px 32px rgba(0,0,0,0.22)', zIndex: 100,
  },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', fontWeight: 600, fontSize: 14, borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, background: 'var(--surface)',
  },
  markAll: {
    border: 'none', background: 'transparent', color: 'var(--accent)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
  },
  empty: { padding: '20px 14px', color: 'var(--text-faint)', fontSize: 14, textAlign: 'center', margin: 0 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  item: {
    display: 'flex', alignItems: 'flex-start', gap: 9,
    padding: '11px 14px', borderBottom: '1px solid var(--border)',
  },
  dot: { width: 8, height: 8, flex: '0 0 8px', borderRadius: '50%', background: 'var(--danger, #ef4444)', marginTop: 6 },
  dotEmpty: { width: 8, flex: '0 0 8px' },
  time: { fontSize: 12, color: 'var(--text-faint)' },
}

export function NotificationBell() {
  const [items, setItems] = useState<Note[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('notifications')
        .select('id, text, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setItems((data ?? []) as Note[])
      channel = supabase
        .channel('notifications-bell')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => setItems((prev) => [payload.new as Note, ...prev].slice(0, 30))
        )
        .subscribe()
    })()
    return () => { if (channel) supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const unread = items.filter((n) => !n.is_read).length

  async function markOne(n: Note) {
    if (n.is_read) return
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
  }

  async function markAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
  }

  return (
    <div ref={ref} style={S.wrap}>
      <style>{`
        .learnix-bell-scroll { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .learnix-bell-scroll::-webkit-scrollbar { width: 8px; }
        .learnix-bell-scroll::-webkit-scrollbar-track { background: transparent; }
        .learnix-bell-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }
        .learnix-bell-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-faint); }
        .learnix-bell-item:hover { background: var(--surface-2); }
      `}</style>

      <button style={S.btn} onClick={() => setOpen((o) => !o)} aria-label="Уведомления">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span style={S.badge}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="learnix-bell-scroll" style={S.panel}>
          <div style={S.head}>
            <span>Уведомления</span>
            {unread > 0 && <button style={S.markAll} onClick={markAll}>Прочитать всё</button>}
          </div>
          {items.length === 0 ? (
            <p style={S.empty}>Пока пусто</p>
          ) : (
            <ul style={S.list}>
              {items.map((n) => (
                <li
                  key={n.id}
                  className="learnix-bell-item"
                  style={{ ...S.item, cursor: n.is_read ? 'default' : 'pointer' }}
                  onClick={() => markOne(n)}
                  title={n.is_read ? '' : 'Отметить прочитанным'}
                >
                  <span style={n.is_read ? S.dotEmpty : S.dot} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: n.is_read ? 400 : 600 }}>
                      {n.text}
                    </span>
                    <span style={S.time}>{ago(n.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
