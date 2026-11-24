import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, seoulDate } from '../lib/format'
import { ErrorText, Field, Icon, Modal, confirmDelete } from './ui'

export const LOG_SELECT = '*, training_log_items(*), events(id, title, starts_at)'

export function LogCard({ log, categories, onEdit, onChange }) {
  const { t, lang } = useT()
  const { canEdit, nameOf } = useAuth()
  const [error, setError] = useState(null)
  const cat = Object.fromEntries(categories.map((c) => [c.id, c]))
  const items = [...(log.training_log_items || [])].sort((a, b) => a.position - b.position)
  const total = items.reduce((s, i) => s + (i.minutes || 0), 0)

  async function remove() {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('training_logs').delete().eq('id', log.id)
    if (error) setError(error)
    else onChange?.()
  }

  return (
    <div className="card log">
      <div className="poll-head">
        <div>
          <h4>{fmtDate(log.log_date + 'T12:00:00', lang, { year: 'numeric' })}</h4>
          <div className="meta">
            {t('training.by', { name: nameOf(log.created_by) })}
            {total > 0 && <> · {t('training.totalMin', { n: total })}</>}
          </div>
          {log.events && <Link className="meta link" to={`/events/${log.events.id}`}><Icon name="link" size={13} /> {log.events.title}</Link>}
        </div>
        {canEdit(log.created_by) && (
          <div className="row-actions">
            <button className="icon-btn" onClick={() => onEdit?.(log)} aria-label={t('common.edit')}><Icon name="edit" size={16} /></button>
            <button className="icon-btn danger" onClick={remove} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
          </div>
        )}
      </div>
      <ul className="log-items">
        {items.map((i) => {
          const c = cat[i.category_id]
          return (
            <li key={i.id}>
              <span className="cat-chip" style={{ '--c': c?.color || '#888' }}>{c?.name || t('training.noCategory')}</span>
              <span className="log-content">{i.content}</span>
              {i.minutes ? <span className="muted small">{t('training.min', { n: i.minutes })}</span> : null}
            </li>
          )
        })}
      </ul>
      {log.notes && <p className="poll-desc">{log.notes}</p>}
      <ErrorText error={error} />
    </div>
  )
}

export function LogForm({ log, eventId, categories, events = [], onClose, onSaved }) {
  const { t } = useT()
  const { user } = useAuth()
  const editing = Boolean(log)
  const linked = events.find((e) => e.id === (log?.event_id ?? eventId))
  const [f, setF] = useState({
    log_date: log?.log_date ?? (linked ? seoulDate(linked.starts_at) : seoulDate()),
    event_id: log?.event_id ?? eventId ?? '',
    notes: log?.notes ?? '',
  })
  const [items, setItems] = useState(
    log
      ? [...log.training_log_items].sort((a, b) => a.position - b.position).map((i) => ({ ...i, minutes: i.minutes ?? '' }))
      : [{ category_id: categories[0]?.id ?? '', content: '', minutes: '' }],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const setItem = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    const row = { log_date: f.log_date, event_id: f.event_id || null, notes: f.notes.trim() || null }
    let id = log?.id
    if (editing) {
      const { error } = await supabase.from('training_logs').update(row).eq('id', id)
      if (error) { setBusy(false); return setError(error) }
      await supabase.from('training_log_items').delete().eq('log_id', id)
    } else {
      const { data, error } = await supabase.from('training_logs').insert({ ...row, created_by: user.id }).select().single()
      if (error) { setBusy(false); return setError(error) }
      id = data.id
    }
    const rows = items
      .filter((i) => i.category_id || i.content.trim())
      .map((i, n) => ({
        log_id: id,
        category_id: i.category_id || null,
        content: i.content.trim(),
        minutes: i.minutes === '' ? null : Number(i.minutes),
        position: n,
      }))
    if (rows.length) {
      const { error } = await supabase.from('training_log_items').insert(rows)
      if (error) { setBusy(false); return setError(error) }
    }
    setBusy(false)
    onSaved?.()
  }

  return (
    <Modal title={editing ? t('training.editLog') : t('training.newLog')} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="row2">
          <Field label={t('training.date')}>
            <input type="date" required value={f.log_date} onChange={(e) => setF({ ...f, log_date: e.target.value })} />
          </Field>
          <Field label={t('training.linkEvent')}>
            <select value={f.event_id} onChange={(e) => {
              const ev = events.find((x) => x.id === e.target.value)
              setF({ ...f, event_id: e.target.value, log_date: ev ? seoulDate(ev.starts_at) : f.log_date })
            }}>
              <option value="">—</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{seoulDate(ev.starts_at)} {ev.title}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('training.items')}>
          {categories.length === 0 && <span className="field-hint">{t('training.needCategory')}</span>}
          <div className="item-edit">
            {items.map((it, i) => (
              <div className="item-row" key={i}>
                <select value={it.category_id || ''} onChange={(e) => setItem(i, 'category_id', e.target.value)}>
                  <option value="">{t('training.noCategory')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input placeholder={t('training.contentPh')} value={it.content} onChange={(e) => setItem(i, 'content', e.target.value)} />
                <input type="number" min="0" max="1440" placeholder={t('training.minPh')} value={it.minutes}
                  onChange={(e) => setItem(i, 'minutes', e.target.value)} className="min-input" />
                <button type="button" className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={t('common.delete')}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            <button type="button" className="btn ghost small"
              onClick={() => setItems([...items, { category_id: categories[0]?.id ?? '', content: '', minutes: '' }])}>
              <Icon name="plus" size={14} /> {t('training.addItem')}
            </button>
          </div>
        </Field>
        <Field label={t('training.notes')}>
          <textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
