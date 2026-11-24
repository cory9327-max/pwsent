import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDateTime, fromLocalInput, toLocalInput } from '../lib/format'
import { DateTimeInput } from './inputs'
import { ErrorText, Field, Icon, Modal, confirmDelete } from './ui'

export const POLL_SELECT = '*, poll_options(*), poll_votes(*)'

export function isOpen(p) {
  return !p.closes_at || new Date(p.closes_at) > new Date()
}

export function PollCard({ poll, onChange, onEdit, showEvent = true }) {
  const { t, lang } = useT()
  const { user, canEdit, nameOf } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showVoters, setShowVoters] = useState(false)

  const options = [...(poll.poll_options || [])].sort((a, b) => a.position - b.position)
  const votes = poll.poll_votes || []
  const voters = new Set(votes.map((v) => v.user_id))
  const mine = new Set(votes.filter((v) => v.user_id === user.id).map((v) => v.option_id))
  const open = isOpen(poll)

  async function toggle(opt) {
    if (!open || busy) return
    setBusy(true); setError(null)
    const { error } = mine.has(opt.id)
      ? await supabase.from('poll_votes').delete().match({ option_id: opt.id, user_id: user.id })
      : await supabase.from('poll_votes').insert({ poll_id: poll.id, option_id: opt.id, user_id: user.id })
    setBusy(false)
    if (error) setError(error)
    else onChange?.()
  }

  async function remove() {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('polls').delete().eq('id', poll.id)
    if (error) setError(error)
    else onChange?.()
  }

  async function closeNow() {
    const { error } = await supabase.from('polls').update({ closes_at: new Date().toISOString() }).eq('id', poll.id)
    if (error) setError(error)
    else onChange?.()
  }

  return (
    <div className="card poll">
      <div className="poll-head">
        <div>
          <h4>{poll.title}</h4>
          <div className="meta">
            {nameOf(poll.created_by)}
            {' · '}
            {open
              ? (poll.closes_at ? t('poll.closesAt', { d: fmtDateTime(poll.closes_at, lang) }) : t('poll.noDeadline'))
              : <span className="tag-closed">{t('poll.closed')}</span>}
            {poll.multiple && <> · {t('poll.multiple')}</>}
          </div>
          {showEvent && poll.event_id && poll.events && (
            <Link className="meta link" to={`/events/${poll.event_id}`}><Icon name="link" size={13} /> {poll.events.title}</Link>
          )}
        </div>
        {canEdit(poll.created_by) && (
          <div className="row-actions">
            {open && <button className="btn ghost small" onClick={closeNow}>{t('poll.closeNow')}</button>}
            <button className="icon-btn" onClick={() => onEdit?.(poll)} aria-label={t('common.edit')}><Icon name="edit" size={16} /></button>
            <button className="icon-btn danger" onClick={remove} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
          </div>
        )}
      </div>
      {poll.description && <p className="poll-desc">{poll.description}</p>}
      <div className="options">
        {options.map((o) => {
          const n = votes.filter((v) => v.option_id === o.id).length
          const pct = voters.size ? Math.round((n / voters.size) * 100) : 0
          return (
            <button key={o.id} className={`option ${mine.has(o.id) ? 'mine' : ''}`} disabled={!open || busy} onClick={() => toggle(o)}>
              <span className="bar" style={{ width: `${pct}%` }} />
              <span className="opt-label">{mine.has(o.id) && '✓ '}{o.label}</span>
              <span className="opt-count">{n}</span>
            </button>
          )
        })}
      </div>
      <div className="poll-foot">
        <button className="link-btn" onClick={() => setShowVoters(!showVoters)}>
          {t('poll.voters', { n: voters.size })}
        </button>
      </div>
      {showVoters && (
        <div className="voters">
          {options.map((o) => (
            <div key={o.id}>
              <strong>{o.label}</strong>: {votes.filter((v) => v.option_id === o.id).map((v) => nameOf(v.user_id)).join(', ') || '—'}
            </div>
          ))}
        </div>
      )}
      <ErrorText error={error} />
    </div>
  )
}

export function PollForm({ poll, eventId, events = [], onClose, onSaved }) {
  const { t } = useT()
  const { user } = useAuth()
  const editing = Boolean(poll)
  const [f, setF] = useState({
    title: poll?.title ?? '',
    description: poll?.description ?? '',
    multiple: poll?.multiple ?? false,
    closes_at: poll?.closes_at ? toLocalInput(poll.closes_at) : '',
    event_id: poll?.event_id ?? eventId ?? '',
  })
  const [opts, setOpts] = useState(
    poll ? [...poll.poll_options].sort((a, b) => a.position - b.position).map((o) => ({ id: o.id, label: o.label })) : [{ label: '' }, { label: '' }],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const clean = opts.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label)
    if (clean.length < 2) return setError(t('poll.needTwo'))
    setBusy(true); setError(null)
    const row = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      multiple: f.multiple,
      closes_at: fromLocalInput(f.closes_at),
      event_id: f.event_id || null,
    }
    let pollId = poll?.id
    if (editing) {
      const { error } = await supabase.from('polls').update(row).eq('id', pollId)
      if (error) { setBusy(false); return setError(error) }
      const keep = new Set(clean.filter((o) => o.id).map((o) => o.id))
      const removed = poll.poll_options.filter((o) => !keep.has(o.id)).map((o) => o.id)
      if (removed.length) await supabase.from('poll_options').delete().in('id', removed)
    } else {
      const { data, error } = await supabase.from('polls').insert({ ...row, created_by: user.id }).select().single()
      if (error) { setBusy(false); return setError(error) }
      pollId = data.id
    }
    for (const [i, o] of clean.entries()) {
      const r = o.id
        ? await supabase.from('poll_options').update({ label: o.label, position: i }).eq('id', o.id)
        : await supabase.from('poll_options').insert({ poll_id: pollId, label: o.label, position: i })
      if (r.error) { setBusy(false); return setError(r.error) }
    }
    setBusy(false)
    onSaved?.()
  }

  return (
    <Modal title={editing ? t('poll.edit') : t('poll.new')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label={t('poll.question')}>
          <input required maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
        </Field>
        <Field label={t('event.description')}>
          <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label={t('poll.options')}>
          <div className="opt-edit">
            {opts.map((o, i) => (
              <div className="opt-row" key={o.id || `n${i}`}>
                <input value={o.label} maxLength={120} placeholder={t('poll.optionN', { n: i + 1 })}
                  onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                {opts.length > 2 && (
                  <button type="button" className="icon-btn" onClick={() => setOpts(opts.filter((_, j) => j !== i))} aria-label={t('common.delete')}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn ghost small" onClick={() => setOpts([...opts, { label: '' }])}>
              <Icon name="plus" size={14} /> {t('poll.addOption')}
            </button>
          </div>
        </Field>
        <div className="form">
          <Field label={t('poll.deadline')} hint={t('poll.deadlineHint')}>
            <DateTimeInput value={f.closes_at} onChange={(v) => setF({ ...f, closes_at: v })} />
          </Field>
          <Field label={t('poll.linkEvent')}>
            <select value={f.event_id} onChange={(e) => setF({ ...f, event_id: e.target.value })}>
              <option value="">—</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              {f.event_id && !events.some((ev) => ev.id === f.event_id) && <option value={f.event_id}>{t('poll.linked')}</option>}
            </select>
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.multiple} onChange={(e) => setF({ ...f, multiple: e.target.checked })} />
          {t('poll.allowMultiple')}
        </label>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
