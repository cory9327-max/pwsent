import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { LOG_SELECT, LogCard, LogForm } from '../components/TrainingLog'
import EventForm from '../components/EventForm'
import { Empty, ErrorText, Icon, confirmDelete } from '../components/ui'

const COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1c7ed6', '#7048e8', '#c2255c', '#0c8599', '#5c5f66']

export default function Training() {
  const { t } = useT()
  const { user, isTrainer, canEdit, nameOf } = useAuth()
  const [logs, setLogs] = useState([])
  const [cats, setCats] = useState([])
  const [events, setEvents] = useState([])
  const [filter, setFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [newCat, setNewCat] = useState({ name: '', color: COLORS[0] })
  const [editCat, setEditCat] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    const [l, c, e] = await Promise.all([
      supabase.from('training_logs').select(LOG_SELECT).order('log_date', { ascending: false }).limit(100),
      supabase.from('training_categories').select('*').order('name'),
      supabase.from('events').select('id,title,starts_at,type').eq('type', 'training').gte('starts_at', since).order('starts_at', { ascending: false }),
    ])
    setLogs(l.data || []); setCats(c.data || []); setEvents(e.data || [])
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

  const shown = filter ? logs.filter((l) => l.training_log_items?.some((i) => i.category_id === filter)) : logs
  const done = () => { setModal(null); load() }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('nav.training')}</h1>
        {isTrainer && (
          <div className="head-actions">
            <button className="btn ghost" onClick={() => setModal('event')}><Icon name="calendar" size={16} /> {t('training.newSession')}</button>
            <button className="btn primary" onClick={() => setModal('log')}><Icon name="plus" size={16} /> {t('training.newLog')}</button>
          </div>
        )}
      </div>

      <div className="training-layout">
        <section>
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

      {modal === 'log' && <LogForm categories={cats} events={events} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.log && <LogForm log={modal.log} categories={cats} events={events} onClose={() => setModal(null)} onSaved={done} />}
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
