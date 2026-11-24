import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, fmtTime, localeOf, seoulDate } from '../lib/format'
import EventForm from '../components/EventForm'
import CalendarSubscribe from '../components/CalendarSubscribe'
import { Empty, Icon, Modal, TypeBadge } from '../components/ui'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

export default function Schedule() {
  const { t, lang } = useT()
  const { nameOf } = useAuth()
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [events, setEvents] = useState([])
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(seoulDate())
  const [modal, setModal] = useState(null)
  const [sub, setSub] = useState(false)

  const load = useCallback(async () => {
    const from = new Date(ym.y, ym.m, 1)
    const to = new Date(ym.y, ym.m + 1, 1)
    from.setDate(from.getDate() - 7); to.setDate(to.getDate() + 7)
    const { data } = await supabase.from('events').select('*')
      .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at')
    setEvents(data || [])
  }, [ym])
  useEffect(() => { load() }, [load])

  const shown = events.filter((e) => filter === 'all' || e.type === filter)
  const byDay = useMemo(() => {
    const m = {}
    for (const e of shown) (m[seoulDate(e.starts_at)] ||= []).push(e)
    return m
  }, [shown])

  // 달력 칸 (일요일 시작)
  const first = new Date(ym.y, ym.m, 1).getDay()
  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(ymd(ym.y, ym.m, d))
  while (cells.length % 7) cells.push(null)

  const weekdays = [...Array(7)].map((_, i) =>
    new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short' }).format(new Date(2024, 0, 7 + i)))
  const title = new Intl.DateTimeFormat(localeOf(lang), { year: 'numeric', month: 'long' }).format(new Date(ym.y, ym.m, 1))
  const move = (k) => setYm(({ y, m }) => { const d = new Date(y, m + k, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const today = seoulDate()
  const monthList = shown.filter((e) => seoulDate(e.starts_at).startsWith(`${ym.y}-${pad(ym.m + 1)}`))
  const dayList = byDay[selected] || []

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('nav.schedule')}</h1>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => setSub(true)}><Icon name="share" size={16} /> {t('calsub.title')}</button>
          <button className="btn primary" onClick={() => setModal({ date: selected })}><Icon name="plus" size={16} /> {t('event.new')}</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="month-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="prev"><Icon name="chevL" /></button>
          <strong>{title}</strong>
          <button className="icon-btn" onClick={() => move(1)} aria-label="next"><Icon name="chevR" /></button>
          <button className="btn ghost small" onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSelected(today) }}>{t('cal.today')}</button>
        </div>
        <div className="seg small">
          {['all', 'general', 'training', 'match'].map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? t('common.all') : t(`etype.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-layout">
        <div className="card cal">
          <div className="cal-grid head">{weekdays.map((w, i) => <div key={i} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</div>)}</div>
          <div className="cal-grid">
            {cells.map((d, i) => (
              <button key={i} disabled={!d}
                className={`cal-cell ${d === today ? 'is-today' : ''} ${d === selected ? 'is-sel' : ''}`}
                onClick={() => d && setSelected(d)} onDoubleClick={() => d && setModal({ date: d })}>
                {d && <span className="cal-num">{Number(d.slice(8))}</span>}
                <span className="cal-events">
                  {(byDay[d] || []).slice(0, 3).map((e) => <span key={e.id} className={`cal-ev type-bg-${e.type}`}>{e.title}</span>)}
                  {(byDay[d] || []).length > 3 && <span className="cal-more">+{byDay[d].length - 3}</span>}
                </span>
                <span className="cal-dots">{(byDay[d] || []).slice(0, 4).map((e) => <i key={e.id} className={`dot type-bg-${e.type}`} />)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="cal-side">
          <h2 className="sec-title">{fmtDate(selected + 'T12:00:00', lang)}</h2>
          {dayList.length === 0 ? <Empty>{t('cal.noEvents')}</Empty> : (
            <ul className="event-list card">
              {dayList.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`}>
                    <div className="ev-date"><strong>{fmtTime(e.starts_at, lang)}</strong></div>
                    <div className="ev-main"><span>{e.title}</span><span className="meta">{e.location || nameOf(e.created_by)}</span></div>
                    <TypeBadge type={e.type} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h2 className="sec-title">{t('cal.monthList')}</h2>
          {monthList.length === 0 ? <Empty>{t('cal.noEvents')}</Empty> : (
            <ul className="event-list card">
              {monthList.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`}>
                    <div className="ev-date"><strong>{fmtDate(e.starts_at, lang)}</strong><span>{fmtTime(e.starts_at, lang)}</span></div>
                    <div className="ev-main"><span>{e.title}</span></div>
                    <TypeBadge type={e.type} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {sub && <Modal title={t('calsub.title')} onClose={() => setSub(false)}><CalendarSubscribe /></Modal>}
      {modal && <EventForm defaultDate={modal.date} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}
