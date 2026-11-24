import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, seoulDate } from '../lib/format'
import CalendarSubscribe from '../components/CalendarSubscribe'
import { Empty, LangSwitch, RoleBadge, StatusPill, TypeBadge } from '../components/ui'

export default function MyPage() {
  const { t, lang } = useT()
  const { user, profile, signOut } = useAuth()
  const [items, setItems] = useState([])

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 60 * 864e5)
      const joined = new Date(profile.approved_at || profile.created_at)
      const from = since > joined ? since : joined
      from.setHours(0, 0, 0, 0)
      const { data: evs } = await supabase.from('events').select('id,title,type,starts_at')
        .in('type', ['training', 'match']).gte('starts_at', from.toISOString()).lte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: false })
      const ids = (evs || []).map((e) => e.id)
      const { data: att } = ids.length
        ? await supabase.from('attendance').select('*').eq('user_id', user.id).in('event_id', ids)
        : { data: [] }
      const m = Object.fromEntries((att || []).map((a) => [a.event_id, a.status]))
      const today = seoulDate()
      setItems((evs || []).map((e) => ({ ...e, status: m[e.id] || (seoulDate(e.starts_at) < today ? 'absent' : 'none') })))
    })()
  }, [user.id, profile])

  const c = items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] || 0) + 1 }), {})
  const counted = items.filter((i) => i.status !== 'none').length
  const rate = counted ? Math.round((((c.present || 0) + (c.late || 0)) / counted) * 100) : null

  return (
    <div className="page">
      <div className="page-head"><h1>{t('nav.me')}</h1></div>
      <div className="two-col">
        <div className="card">
          <div className="member-top">
            <div className="avatar lg">{profile.display_name.slice(0, 1)}</div>
            <div>
              <h2 className="no-margin">{profile.display_name}</h2>
              <div className="meta">{t(`name.${profile.name_type || 'real'}`)} · <RoleBadge role={profile.role} /></div>
              <div className="meta">{profile.email}</div>
            </div>
          </div>
          <p className="muted small">{t('me.nameLocked')}</p>
          <h3>{t('me.language')}</h3>
          <LangSwitch />
          <h3>{t('calsub.title')}</h3>
          <CalendarSubscribe />
          <div className="form-actions"><button className="btn ghost" onClick={signOut}>{t('auth.signOut')}</button></div>
        </div>
        <div className="card">
          <h3 className="no-margin">{t('me.myAttendance')}</h3>
          <p className="muted small">{t('me.last60')}</p>
          <div className="stat-row compact">
            <div className="stat"><span className="stat-label">{t('att.rate')}</span><strong className="stat-value">{rate === null ? '—' : `${rate}%`}</strong></div>
            <div className="stat"><span className="stat-label">{t('att.present')}</span><strong className="stat-value ok">{c.present || 0}</strong></div>
            <div className="stat"><span className="stat-label">{t('att.late')}</span><strong className="stat-value warn-text">{c.late || 0}</strong></div>
            <div className="stat"><span className="stat-label">{t('att.absent')}</span><strong className="stat-value bad">{c.absent || 0}</strong></div>
          </div>
          {items.length === 0 ? <Empty>{t('att.noData')}</Empty> : (
            <ul className="event-list">
              {items.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`}>
                    <div className="ev-date"><strong>{fmtDate(e.starts_at, lang)}</strong></div>
                    <div className="ev-main"><span>{e.title}</span></div>
                    <TypeBadge type={e.type} />
                    <StatusPill status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
