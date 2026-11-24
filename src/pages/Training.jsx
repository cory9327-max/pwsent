import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtTime, seoulDate } from '../lib/format'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { LOG_SELECT, LogCard, LogForm } from '../components/TrainingLog'
import EventForm from '../components/EventForm'
import { OpenWeeksModal } from '../components/WeeklyTraining'
import { useWeeklyTraining } from '../lib/weekly'
import { Empty, ErrorText, Icon, confirmDelete } from '../components/ui'

const COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1c7ed6', '#7048e8', '#c2255c', '#0c8599', '#5c5f66']

export default function Training() {
  const { t, lang } = useT()
  const { user, can, canEdit, nameOf } = useAuth()
  const isTrainer = can('training_log')
  const [logs, setLogs] = useState([])
  const [cats, setCats] = useState([])
  const [events, setEvents] = useState([])
  const [attCount, setAttCount] = useState({})
  const [showDone, setShowDone] = useState(false)
  const [filter, setFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [newCat, setNewCat] = useState({ name: '', color: COLORS[0] })
  const [editCat, setEditCat] = useState(null)
  const [error, setError] = useState(null)
  const weekly = useWeeklyTraining()

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    const [l, c, e] = await Promise.all([
      supabase.from('training_logs').select(LOG_SELECT).order('log_date', { ascending: false }).limit(100),
      supabase.from('training_categories').select('*').order('name'),
      supabase.from('events').select('*').eq('type', 'training').gte('starts_at', since).order('starts_at', { ascending: false }),
    ])
    const evs = (e.data || []).filter((x) => x.status !== 'tentative') // 확정된 훈련만
    setLogs(l.data || []); setCats(c.data || []); setEvents(evs)
    const ids = evs.map((x) => x.id)
    const { data: att } = ids.length ? await supabase.from('attendance').select('event_id').in('event_id', ids) : { data: [] }
    const n = {}
    for (const a of att || []) n[a.event_id] = (n[a.event_id] || 0) + 1
    setAttCount(n)
  }, [])
  useEffect(() => { load() }, [load])

  async function addCat(e) {
    e.preventDefault()
    if (!newCat.name.trim()) return
    setError(null)
    const { error } = await supabase.from('training_categories').insert({ name: newCat.name.trim(), color: newCat.color, created_by: user.id })
    if (error) return setError(error)
    setNewCat({ name: '', color: COLORS[(cats.length + 1) % COLORS.length] })
    load()
  }
  async function saveCat() {
    const { error } = await supabase.from('training_categories').update({ name: editCat.name.trim(), color: editCat.color }).eq('id', editCat.id)
    if (error) return setError(error)
    setEditCat(null); load()
  }
  async function delCat(c) {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('training_categories').delete().eq('id', c.id)
    if (error) return setError(error)
    load()
  }

  const logged = new Set(logs.map((l) => l.event_id).filter(Boolean))
  const today = seoulDate()
  const weekAhead = seoulDate(new Date(Date.now() + 7 * 864e5))
  const dateOf = (e) => seoulDate(e.starts_at)
  const todo = events.filter((e) => dateOf(e) <= today && !e.completed_at).reverse()            // 진행·마감이 필요한 훈련 (오래된 것부터)
  const upcoming = events.filter((e) => dateOf(e) > today && dateOf(e) <= weekAhead).reverse()  // 이번 주 예정
  const finished = events.filter((e) => e.completed_at).slice(0, showDone ? 30 : 3)
  const sessionRow = (e, kind) => (
    <li key={e.id}>
      <Link to={`/events/${e.id}`} className="session-row">
        <div className="ev-date"><strong>{fmtDate(e.starts_at, lang)}</strong><span>{fmtTime(e.starts_at, lang)}</span></div>
        <div className="ev-main">
          <span>{e.title}{e.location ? ` · ${e.location}` : ''}</span>
          {kind !== 'upcoming' && (
            <span className="meta">
              <span className={`pill ${attCount[e.id] ? 'att-present' : 'att-none'}`}>{t('done.attN', { n: attCount[e.id] || 0 })}</span>
              <span className={`pill ${logged.has(e.id) ? 'att-present' : 'att-none'}`}>{logged.has(e.id) ? t('done.logYes') : t('done.logNo')}</span>
            </span>
          )}
        </div>
        {kind === 'todo' && <span className="pill att-late">{dateOf(e) === today ? t('done.today') : t('done.needed')}</span>}
        {kind === 'done' && <span className="pill att-present">{t('done.done')}</span>}
        {kind === 'upcoming' && <span className="pill att-none">{t('done.upcoming')}</span>}
        <Icon name="chevR" size={16} />
      </Link>
    </li>
  )
  const shown = filter ? logs.filter((l) => l.training_log_items?.some((i) => i.category_id === filter)) : logs
  const done = () => { setModal(null); load() }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('nav.training')}</h1>
        {isTrainer && (
          <div className="head-actions">
            {weekly.available && can('sessions') && <button className="btn ghost" onClick={() => setModal('weeks')}><Icon name="calendar" size={16} /> {t('wk.open')}</button>}
            {can('sessions') && <button className="btn ghost" onClick={() => setModal('event')}><Icon name="plus" size={16} /> {t('training.newSession')}</button>}
            <button className="btn primary" onClick={() => setModal('log')}><Icon name="plus" size={16} /> {t('training.newLog')}</button>
          </div>
        )}
      </div>

      <div className="training-layout">
        <section>
          <div className="card sessions">
            <h3>{t('done.title')}</h3>
            <p className="muted small">{isTrainer ? t('done.hintTrainer') : t('done.hint')}</p>
            {todo.length + upcoming.length + finished.length === 0 && <Empty>{t('done.none')}</Empty>}
            {todo.length > 0 && <><div className="session-group">{t('done.groupTodo')}</div><ul className="event-list">{todo.map((e) => sessionRow(e, 'todo'))}</ul></>}
            {upcoming.length > 0 && <><div className="session-group">{t('done.groupUpcoming')}</div><ul className="event-list">{upcoming.map((e) => sessionRow(e, 'upcoming'))}</ul></>}
            {finished.length > 0 && <>
              <div className="session-group">{t('done.groupDone')}</div>
              <ul className="event-list">{finished.map((e) => sessionRow(e, 'done'))}</ul>
              {events.filter((e) => e.completed_at).length > 3 && <button className="link-btn small left" onClick={() => setShowDone(!showDone)}>{showDone ? t('wk.lessWeeks') : t('done.more')}</button>}
            </>}
          </div>
          <h2 className="sec-title">{t('training.logs')}</h2>
          <div className="chip-filter">
            <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}>{t('common.all')}</button>
            {cats.map((c) => (
              <button key={c.id} className={filter === c.id ? 'on' : ''} style={{ '--c': c.color }} onClick={() => setFilter(c.id)}>
                <i className="dot" style={{ background: c.color }} /> {c.name}
              </button>
            ))}
          </div>
          {shown.length === 0 ? <Empty>{t('training.empty')}</Empty> : (
            <div className="stack">{shown.map((l) => <LogCard key={l.id} log={l} categories={cats} onChange={load} onEdit={(x) => setModal({ log: x })} />)}</div>
          )}
        </section>

        <aside className="card cat-panel">
          <h3>{t('training.categories')}</h3>
          <p className="muted small">{t('training.categoriesHint')}</p>
          <ul className="cat-list">
            {cats.map((c) => (
              <li key={c.id}>
                {editCat?.id === c.id ? (
                  <div className="cat-edit">
                    <input value={editCat.name} maxLength={40} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} />
                    <ColorPick value={editCat.color} onChange={(color) => setEditCat({ ...editCat, color })} />
                    <button className="btn primary small" onClick={saveCat}>{t('common.save')}</button>
                    <button className="btn ghost small" onClick={() => setEditCat(null)}>{t('common.cancel')}</button>
                  </div>
                ) : (
                  <>
                    <span className="cat-chip" style={{ '--c': c.color }}>{c.name}</span>
                    <span className="muted small">{nameOf(c.created_by)}</span>
                    {canEdit(c.created_by) && isTrainer && (
                      <span className="row-actions">
                        <button className="icon-btn" onClick={() => setEditCat(c)} aria-label={t('common.edit')}><Icon name="edit" size={14} /></button>
                        <button className="icon-btn danger" onClick={() => delCat(c)} aria-label={t('common.delete')}><Icon name="trash" size={14} /></button>
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
            {cats.length === 0 && <li className="muted small">{t('training.noCats')}</li>}
          </ul>
          {isTrainer && (
            <form className="cat-add" onSubmit={addCat}>
              <input placeholder={t('training.catPh')} maxLength={40} value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
              <ColorPick value={newCat.color} onChange={(color) => setNewCat({ ...newCat, color })} />
              <button className="btn primary small"><Icon name="plus" size={14} /> {t('common.add')}</button>
            </form>
          )}
          <ErrorText error={error} />
        </aside>
      </div>

      {modal?.forEvent && <LogForm eventId={modal.forEvent} categories={cats} events={events} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'log' && <LogForm categories={cats} events={events} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.log && <LogForm log={modal.log} categories={cats} events={events} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'weeks' && <OpenWeeksModal minPeople={weekly.minPeople} onClose={() => setModal(null)} onSaved={(keep) => { weekly.reload(); load(); if (!keep) setModal(null) }} />}
      {modal === 'event' && <EventForm defaultType="training" onClose={() => setModal(null)} onSaved={done} />}
    </div>
  )
}

function ColorPick({ value, onChange }) {
  return (
    <span className="color-pick">
      {COLORS.map((c) => (
        <button type="button" key={c} className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
    </span>
  )
}
