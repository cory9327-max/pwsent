import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, fmtTime, seoulDate } from '../lib/format'
import CheckIn, { isAttendanceEvent } from '../components/CheckIn'
import { POLL_SELECT, PollCard, PollForm, isOpen } from '../components/Polls'
import { LOG_SELECT, LogCard } from '../components/TrainingLog'
import EventForm from '../components/EventForm'
import { Empty, Icon, TypeBadge } from '../components/ui'

export default function Dashboard() {
  const { t, lang } = useT()
  const { user, profile, isAdmin } = useAuth()
  const [events, setEvents] = useState([])
  const [mine, setMine] = useState({})
  const [polls, setPolls] = useState([])
  const [logs, setLogs] = useState([])
  const [cats, setCats] = useState([])
  const [pending, setPending] = useState(0)
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 15 * 864e5)
    const [ev, pl, lg, ct] = await Promise.all([
      supabase.from('events').select('*').gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at'),
      supabase.from('polls').select(POLL_SELECT + ', events(id,title)').order('created_at', { ascending: false }).limit(20),
      supabase.from('training_logs').select(LOG_SELECT).order('log_date', { ascending: false }).limit(2),
      supabase.from('training_categories').select('*').order('name'),
    ])
    const evs = ev.data || []
    setEvents(evs)
    setPolls((pl.data || []).filter(isOpen).slice(0, 4))
    setLogs(lg.data || [])
    setCats(ct.data || [])
    const ids = evs.filter(isAttendanceEvent).map((e) => e.id)
    if (ids.length) {
      const { data } = await supabase.from('attendance').select('*').eq('user_id', user.id).in('event_id', ids)
      setMine(Object.fromEntries((data || []).map((a) => [a.event_id, a])))
    }
    if (isAdmin) {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      setPending(count || 0)
    }
  }, [user.id, isAdmin])

  useEffect(() => { load() }, [load])

  const today = seoulDate()
  const todays = events.filter((e) => seoulDate(e.starts_at) === today)
  const upcoming = events.filter((e) => seoulDate(e.starts_at) !== today)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('dash.hello', { name: profile.display_name })}</h1>
          <p className="muted">{fmtDate(new Date(), lang, { year: 'numeric', month: 'long' })}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => setModal('poll')}><Icon name="poll" size={16} /> {t('poll.new')}</button>
          <button className="btn primary" onClick={() => setModal('event')}><Icon name="plus" size={16} /> {t('event.new')}</button>
        </div>
      </div>

      {pending > 0 && (
        <Link to="/members" className="banner">
          <Icon name="users" /> {t('dash.pending', { n: pending })} <span className="banner-go">→</span>
        </Link>
      )}

      <section>
        <h2 className="sec-title">{t('dash.today')}</h2>
        {todays.length === 0 ? <Empty>{t('dash.noToday')}</Empty> : (
          <div className="today-grid">
            {todays.map((e) => (
              <div key={e.id} className={`card today type-l-${e.type}`}>
                <Link to={`/events/${e.id}`} className="today-main">
                  <TypeBadge type={e.type} />
                  <h3>{e.title}</h3>
                  <div className="meta"><Icon name="clock" size={14} /> {fmtTime(e.starts_at, lang)}{e.location && <> · <Icon name="pin" size={14} /> {e.location}</>}</div>
                </Link>
                <CheckIn event={e} record={mine[e.id]} onDone={load} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="two-col">
        <section>
          <div className="sec-head">
            <h2 className="sec-title">{t('dash.upcoming')}</h2>
            <Link to="/schedule" className="link small">{t('common.viewAll')}</Link>
          </div>
          {upcoming.length === 0 ? <Empty>{t('dash.noUpcoming')}</Empty> : (
            <ul className="event-list card">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`}>
                    <div className="ev-date"><strong>{fmtDate(e.starts_at, lang)}</strong><span>{fmtTime(e.starts_at, lang)}</span></div>
                    <div className="ev-main"><span>{e.title}</span>{e.location && <span className="meta">{e.location}</span>}</div>
                    <TypeBadge type={e.type} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="sec-head">
            <h2 className="sec-title">{t('dash.openPolls')}</h2>
            <Link to="/polls" className="link small">{t('common.viewAll')}</Link>
          </div>
          {polls.length === 0 ? <Empty>{t('poll.empty')}</Empty> : (
            <div className="stack">
              {polls.map((p) => <PollCard key={p.id} poll={p} onChange={load} onEdit={(x) => setModal({ poll: x })} />)}
            </div>
          )}
        </section>
      </div>

      {logs.length > 0 && (
        <section>
          <div className="sec-head">
            <h2 className="sec-title">{t('dash.recentTraining')}</h2>
            <Link to="/training" className="link small">{t('common.viewAll')}</Link>
          </div>
          <div className="two-col">{logs.map((l) => <LogCard key={l.id} log={l} categories={cats} onChange={load} />)}</div>
        </section>
      )}

      {modal === 'event' && <EventForm onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'poll' && <PollForm events={events} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal?.poll && <PollForm poll={modal.poll} events={events} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}
