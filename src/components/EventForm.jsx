import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { ErrorText, Field, Modal } from './ui'

/** 일정 등록/수정. 트레이너 이상만 훈련·경기 선택 가능. 새 훈련 등록 시 참가 투표 동시 생성 옵션 */
export default function EventForm({ event, defaultDate, defaultType, onClose, onSaved }) {
  const { t } = useT()
  const { user, isTrainer } = useAuth()
  const editing = Boolean(event)
  const base = defaultDate ? `${defaultDate}T19:00` : toLocalInput(new Date(Date.now() + 864e5).toISOString()).slice(0, 11) + '19:00'

  const [f, setF] = useState({
    title: event?.title ?? '',
    type: event?.type ?? (isTrainer && defaultType ? defaultType : 'general'),
    starts_at: event ? toLocalInput(event.starts_at) : base,
    ends_at: event?.ends_at ? toLocalInput(event.ends_at) : '',
    location: event?.location ?? '',
    description: event?.description ?? '',
  })
  const [withPoll, setWithPoll] = useState(!editing && f.type === 'training')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    const row = {
      title: f.title.trim(),
      type: f.type,
      starts_at: fromLocalInput(f.starts_at),
      ends_at: fromLocalInput(f.ends_at),
      location: f.location.trim() || null,
      description: f.description.trim() || null,
    }
    const q = editing
      ? supabase.from('events').update(row).eq('id', event.id).select().single()
      : supabase.from('events').insert({ ...row, created_by: user.id }).select().single()
    const { data, error } = await q
    if (error) { setBusy(false); return setError(error) }

    if (!editing && withPoll && (f.type === 'training' || f.type === 'match')) {
      const { data: poll, error: pe } = await supabase.from('polls').insert({
        title: t('poll.joinTitle', { title: row.title }),
        event_id: data.id,
        closes_at: row.starts_at,
        created_by: user.id,
      }).select().single()
      if (!pe) {
        await supabase.from('poll_options').insert([
          { poll_id: poll.id, label: t('poll.optJoin'), position: 0 },
          { poll_id: poll.id, label: t('poll.optLate'), position: 1 },
          { poll_id: poll.id, label: t('poll.optSkip'), position: 2 },
        ])
      }
    }
    setBusy(false)
    onSaved?.(data)
  }

  return (
    <Modal title={editing ? t('event.edit') : t('event.new')} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label={t('event.title')}>
          <input required maxLength={120} value={f.title} onChange={set('title')} autoFocus />
        </Field>
        <Field label={t('event.type')}>
          <div className="seg">
            {['general', 'training', 'match'].map((ty) => (
              <button type="button" key={ty} disabled={ty !== 'general' && !isTrainer}
                className={f.type === ty ? 'on' : ''}
                onClick={() => { setF({ ...f, type: ty }); if (!editing) setWithPoll(ty === 'training') }}>
                {t(`etype.${ty}`)}
              </button>
            ))}
          </div>
          {!isTrainer && <span className="field-hint">{t('event.typeHint')}</span>}
        </Field>
        <div className="row2">
          <Field label={t('event.start')}>
            <input type="datetime-local" required value={f.starts_at} onChange={set('starts_at')} />
          </Field>
          <Field label={t('event.end')}>
            <input type="datetime-local" value={f.ends_at} min={f.starts_at} onChange={set('ends_at')} />
          </Field>
        </div>
        <Field label={t('event.location')}>
          <input value={f.location} onChange={set('location')} />
        </Field>
        <Field label={t('event.description')}>
          <textarea rows={3} value={f.description} onChange={set('description')} />
        </Field>
        {!editing && (f.type === 'training' || f.type === 'match') && (
          <label className="check">
            <input type="checkbox" checked={withPoll} onChange={(e) => setWithPoll(e.target.checked)} />
            {t('event.withPoll')}
          </label>
        )}
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
