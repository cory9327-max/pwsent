import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, fmtTime } from '../lib/format'
import { Icon } from './ui'

/** 알림 종: 안 읽은 개수 표시, 누르면 알림 목록 */
export default function NotificationBell() {
  const { t, lang } = useT()
  const { user, can } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [items, setItems] = useState([])
  const [available, setAvailable] = useState(true)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(30)
    if (error) return setAvailable(false) // 14 SQL 실행 전
    setItems(data || [])
  }, [user.id])

  useEffect(() => {
    // 입국 전날 알림을 만들어 둔 뒤 목록을 불러옴
    supabase.rpc('make_due_notifications').then(load, load)
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => { setOpen(false); load() }, [loc.pathname])

  if (!available) return null
  const unread = items.filter((n) => !n.read_at).length
  const when = (d) => (d ? `${fmtDate(d, lang)} ${fmtTime(d, lang)}` : t('tv.timeTbd'))

  async function markAll() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null)
    load()
  }
  async function openItem(n) {
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    load()
    if (can('foreign') && n.kind !== 'dorm_cancelled') { setOpen(false); nav('/foreign?tab=visits') }
  }

  const body = (n) => {
    const d = n.data || {}
    const arrive = [when(d.arrive_at), d.arrive_flight, [d.arrive_airport, d.arrive_terminal].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
    return (
      <>
        <strong>{t(`notif.${n.kind}`, { name: d.name || '—' })}</strong>
        {n.kind !== 'dorm_cancelled' && <span>{t('tv.arrive')}: {arrive}</span>}
        {n.kind !== 'dorm_cancelled' && d.depart_at && <span>{t('tv.depart')}: {when(d.depart_at)}{d.depart_flight ? ` · ${d.depart_flight}` : ''}</span>}
        {n.kind === 'dorm_cancelled' && d.arrive_at && <span>{t('notif.was', { d: when(d.arrive_at) })}</span>}
      </>
    )
  }

  return (
    <div className="bell-wrap">
      <button className="icon-btn bell" onClick={() => setOpen(!open)} aria-label={t('notif.title')} aria-expanded={open}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="bell-scrim" onClick={() => setOpen(false)} />
          <div className="bell-panel" role="dialog" aria-label={t('notif.title')}>
            <div className="bell-head">
              <strong>{t('notif.title')}</strong>
              {unread > 0 && <button className="link-btn small" onClick={markAll}>{t('notif.readAll')}</button>}
            </div>
            {items.length === 0 ? <div className="bell-empty">{t('notif.empty')}</div> : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button className={`bell-item ${n.read_at ? '' : 'unread'}`} onClick={() => openItem(n)}>
                      {body(n)}
                      <em>{when(n.created_at)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
