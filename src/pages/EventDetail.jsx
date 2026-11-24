import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { slotLabel } from '../lib/week'
import { downloadIcs, fmtDate, fmtTime, googleCalendarUrl, seoulDate } from '../lib/format'
import EventForm from '../components/EventForm'
import CheckIn from '../components/CheckIn'
import { useTypes } from '../lib/types'
import { POLL_SELECT, PollCard, PollForm } from '../components/Polls'
import { LOG_SELECT, LogCard, LogForm } from '../components/TrainingLog'
import { DriveButtons, FileTable } from '../components/FileList'
import { Empty, ErrorText, Icon, Modal, RoleBadge, useRoleLabel, StatusPill, TypeBadge, confirmDelete } from '../components/ui'

export default function EventDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { t, lang } = useT()
  const { user, members, canEdit, nameOf, can } = useAuth()
  const roleLabel = useRoleLabel()
  const canAtt = can('attendance')
  const { hasAttendance, color } = useTypes()
  const [ev, setEv] = useState(undefined)
  const [att, setAtt] = useState([])
  const [polls, setPolls] = useState([])
  const [logs, setLogs] = useState([])
  const [cats, setCats] = useState([])
  const [files, setFiles] = useState([])
  const [modal, setModal] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const { data: e } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
    setEv(e)
    if (!e) return
    const [a, p, l, c, f] = await Promise.all([
      supabase.from('attendance').select('*').eq('event_id', id),
      supabase.from('polls').select(POLL_SELECT).eq('event_id', id).order('created_at'),
      supabase.from('training_logs').select(LOG_SELECT).eq('event_id', id).order('created_at'),
      supabase.from('training_categories').select('*').order('name'),
      supabase.from('shared_files').select('*').eq('event_id', id).order('created_at', { ascending: false }),
    ])
    setAtt(a.data || []); setPolls(p.data || []); setLogs(l.data || []); setCats(c.data || []); setFiles(f.data || [])
  }, [id])
  useEffect(() => { load() }, [load])

  if (ev === undefined) return <div className="page"><div className="spinner" /></div>
  if (ev === null) return <div className="page"><Empty>{t('event.notFound')}</Empty></div>

  const attMap = Object.fromEntries(att.map((a) => [a.user_id, a]))
  const past = seoulDate(ev.starts_at) < seoulDate()
  const roster = members.filter((m) => m.status === 'approved' && m.track_attendance)
  const statusOf = (uid) => attMap[uid]?.status || (past ? 'absent' : 'none')
  const counts = roster.reduce((c, m) => ({ ...c, [statusOf(m.id)]: (c[statusOf(m.id)] || 0) + 1 }), {})

  async function setStatus(uid, status) {
    setError(null)
    const r = status === 'absent' || status === 'none'
      ? await supabase.from('attendance').delete().match({ event_id: ev.id, user_id: uid })
      : await supabase.from('attendance').upsert({ event_id: ev.id, user_id: uid, status, marked_by: user.id })
    if (r.error) setError(r.error)
    load()
  }

  async function remove(following = false) {
    if (ev.series_id && modal !== 'delete') return setModal('delete')
    if (!ev.series_id && !confirmDelete(t)) return
    const q = supabase.from('events').delete()
    const { error } = following
      ? await q.eq('series_id', ev.series_id).gte('starts_at', ev.starts_at)
      : await q.eq('id', ev.id)
    if (error) { setModal(null); return setError(error) }
    nav('/schedule')
  }

  async function confirmEvent() {
    const { error } = await supabase.from('events').update({ status: 'confirmed' }).eq('id', ev.id)
    if (error) setError(error)
    load()
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* 무시 */ }
  }

  const sameDay = ev.ends_at && seoulDate(ev.ends_at) === seoulDate(ev.starts_at)

  return (
    <div className="page">
      <Link to="/schedule" className="back"><Icon name="chevL" size={16} /> {t('nav.schedule')}</Link>
      <div className="card event-hero" style={{ borderLeftColor: color(ev.type) }}>
        <div className="hero-top">
          <span className="row-actions"><TypeBadge type={ev.type} kind={ev.match_kind} tentative={ev.status === 'tentative'} />{ev.series_id && <span className="badge type-general-soft">{t('event.repeating')}</span>}</span>
          <div className="row-actions">
            <button className="btn ghost small" onClick={copyLink}><Icon name="share" size={14} /> {copied ? t('event.copied') : t('event.copyLink')}</button>
            <a className="btn ghost small" href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer"><Icon name="calendar" size={14} /> {t('event.addGcal')}</a>
            <button className="btn ghost small" onClick={() => downloadIcs(ev)}><Icon name="download" size={14} /> .ics</button>
            {canEdit(ev.created_by) && <>
              <button className="icon-btn" onClick={() => setModal('edit')} aria-label={t('common.edit')}><Icon name="edit" size={16} /></button>
              <button className="icon-btn danger" onClick={() => remove()} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
            </>}
          </div>
        </div>
        <h1>{ev.title}</h1>
        <div className="hero-meta">
          <span><Icon name="calendar" size={15} /> {fmtDate(ev.starts_at, lang, { year: 'numeric' })} {fmtTime(ev.starts_at, lang)}
            {ev.ends_at && <> – {sameDay ? fmtTime(ev.ends_at, lang) : `${fmtDate(ev.ends_at, lang)} ${fmtTime(ev.ends_at, lang)}`}</>}</span>
          {ev.location && <span><Icon name="pin" size={15} /> {ev.location}</span>}
          <span><Icon name="user" size={15} /> {nameOf(ev.created_by)}</span>
          {ev.visible_roles?.length > 0 && <span className="vis-note"><Icon name="lock" size={15} /> {t('event.visibleTo', { roles: ev.visible_roles.map(roleLabel).join(', ') })}</span>}
        </div>
        {ev.description && <p className="hero-desc">{ev.description}</p>}
        {ev.slots?.length > 0 && (
          <div className="chips static">{ev.slots.map((s) => <span key={s.id}>{slotLabel(s)}</span>)}</div>
        )}
        {ev.status === 'tentative' && (
          <div className="notice warn">
            {t('wk.tentativeNote')}
            {canEdit(ev.created_by) && (
              <span className="row-actions">
                <button className="btn primary small" onClick={confirmEvent}>{t('wk.confirm')}</button>
              </span>
            )}
          </div>
        )}
        <CheckIn event={ev} record={attMap[user.id]} onDone={load} />
        <ErrorText error={error} />
      </div>

      {hasAttendance(ev.type) && ev.status !== 'tentative' && (
        <section>
          <div className="sec-head">
            <h2 className="sec-title">{t('att.title')}</h2>
            <div className="att-summary">
              <StatusPill status="present" /> {counts.present || 0}
              <StatusPill status="late" /> {counts.late || 0}
              <StatusPill status={past ? 'absent' : 'none'} /> {(counts.absent || 0) + (counts.none || 0)}
            </div>
          </div>
          {canAtt && <p className="muted small">{t('att.trainerHint')}</p>}
          <div className="card roster">
            {roster.map((m) => {
              const s = statusOf(m.id)
              return (
                <div key={m.id} className="roster-row">
                  <div className="avatar sm">{m.display_name?.slice(0, 1)}</div>
                  <span className="roster-name">{m.display_name}</span>
                  <RoleBadge role={m.role} />
                  <span className="roster-time muted small">{attMap[m.id] && fmtTime(attMap[m.id].checked_at, lang)}</span>
                  {canAtt ? (
                    <select className={`att-select att-${s}`} value={s === 'none' ? 'absent' : s} onChange={(e) => setStatus(m.id, e.target.value)}>
                      <option value="present">{t('att.present')}</option>
                      <option value="late">{t('att.late')}</option>
                      <option value="absent">{past ? t('att.absent') : t('att.none')}</option>
                    </select>
                  ) : <StatusPill status={s} />}
                </div>
              )
            })}
            {roster.length === 0 && <Empty>{t('members.empty')}</Empty>}
          </div>
        </section>
      )}

      <section>
        <div className="sec-head">
          <h2 className="sec-title">{t('nav.polls')}</h2>
          {can('post') && <button className="btn ghost small" onClick={() => setModal('poll')}><Icon name="plus" size={14} /> {t('poll.new')}</button>}
        </div>
        {polls.length === 0 ? <Empty>{t('poll.empty')}</Empty> : (
          <div className="stack">{polls.map((p) => <PollCard key={p.id} poll={p} showEvent={false} onChange={load} onEdit={(x) => setModal({ poll: x })} />)}</div>
        )}
      </section>

      {(ev.type === 'training' || logs.length > 0) && (
        <section>
          <div className="sec-head">
            <h2 className="sec-title">{t('training.logs')}</h2>
            {can('training_log') && <button className="btn ghost small" onClick={() => setModal('log')}><Icon name="plus" size={14} /> {t('training.newLog')}</button>}
          </div>
          {logs.length === 0 ? <Empty>{t('training.emptyEvent')}</Empty> : (
            <div className="stack">{logs.map((l) => <LogCard key={l.id} log={{ ...l, events: null }} categories={cats} onChange={load} onEdit={(x) => setModal({ log: x })} />)}</div>
          )}
        </section>
      )}

      <section>
        <div className="sec-head"><h2 className="sec-title">{t('nav.files')}</h2></div>
        <DriveButtons eventId={ev.id} onAdded={load} />
        <FileTable files={files} showEvent={false} onChange={load} />
      </section>

      {modal === 'delete' && (
        <Modal title={t('event.deleteSeries')} onClose={() => setModal(null)}>
          <p className="muted">{t('event.deleteSeriesBody')}</p>
          <div className="stack">
            <button className="btn ghost" onClick={() => remove(false)}>{t('event.deleteOne')}</button>
            <button className="btn danger" onClick={() => remove(true)}>{t('event.deleteFollowing')}</button>
            <button className="btn ghost" onClick={() => setModal(null)}>{t('common.cancel')}</button>
          </div>
        </Modal>
      )}
      {modal === 'edit' && <EventForm event={ev} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'poll' && <PollForm eventId={ev.id} events={[ev]} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal?.poll && <PollForm poll={modal.poll} events={[ev]} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal === 'log' && <LogForm eventId={ev.id} events={[ev]} categories={cats} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal?.log && <LogForm log={modal.log} events={[ev]} categories={cats} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}
