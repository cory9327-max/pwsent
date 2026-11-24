import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { EVENT_TYPES, LOCATIONS, MATCH_KINDS, TRAINER_ONLY_TYPES } from '../lib/presets'
import { ChoiceInput, DateTimeInput } from './inputs'
import { ErrorText, Field, Modal } from './ui'

const pad = (n) => String(n).padStart(2, '0')
const MAX_REPEAT = 60
const hasAttendance = (type) => TRAINER_ONLY_TYPES.includes(type)

function addDays(local, days) {
  if (!local) return ''
  const d = new Date(local)
  d.setDate(d.getDate() + days)
  return toLocalInput(d.toISOString())
}

/** 일정 등록/수정. 훈련·경기는 트레이너 이상만. 새 일정은 매주/격주 반복 등록 가능 */
export default function EventForm({ event, defaultDate, defaultType, onClose, onSaved }) {
  const { t } = useT()
  const { user, isTrainer } = useAuth()
  const editing = Boolean(event)
  const tomorrow = toLocalInput(new Date(Date.now() + 864e5).toISOString()).slice(0, 10)
  const firstType = isTrainer ? (defaultType || 'training') : 'general'

  const [f, setF] = useState({
    title: event?.title ?? '',
    type: event?.type ?? firstType,
    match_kind: event?.match_kind ?? MATCH_KINDS[0],
    starts_at: event ? toLocalInput(event.starts_at) : `${defaultDate || tomorrow}T19:00`,
    ends_at: event?.ends_at ? toLocalInput(event.ends_at) : '',
    location: event?.location ?? '',
    description: event?.description ?? '',
  })
  const [withPoll, setWithPoll] = useState(!editing && f.type === 'training')
  const [repeat, setRepeat] = useState(0) // 0 = 없음, 7 = 매주, 14 = 격주
  const [until, setUntil] = useState('')
  const [used, setUsed] = useState({ locations: [], kinds: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  // 이전에 직접 입력했던 장소·경기 구분도 선택지로 보여주기
  useEffect(() => {
    supabase.from('events').select('location, match_kind').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        const uniq = (k, base) => [...new Set((data || []).map((r) => r[k]).filter((v) => v && !base.includes(v)))].slice(0, 6)
        setUsed({ locations: uniq('location', LOCATIONS), kinds: uniq('match_kind', MATCH_KINDS) })
      })
  }, [])

  const startDate = f.starts_at.slice(0, 10)
  const untilDate = until || addDays(f.starts_at, 56).slice(0, 10) // 기본 8주
  const offsets = useMemo(() => {
    if (editing || !repeat || !f.starts_at) return [0]
    const out = []
    for (let d = 0; out.length < MAX_REPEAT && addDays(f.starts_at, d).slice(0, 10) <= untilDate; d += repeat) out.push(d)
    return out.length ? out : [0]
  }, [editing, repeat, f.starts_at, untilDate])

  const endFallback = `${pad(Math.min(23, Number(f.starts_at.slice(11, 13) || 19) + 2))}:${f.starts_at.slice(14, 16) || '00'}`

  async function submit(e) {
    e.preventDefault()
    if (f.ends_at && f.ends_at < f.starts_at) return setError(t('event.endBeforeStart'))
    setBusy(true); setError(null)
    const base = {
      title: f.title.trim(),
      type: f.type,
      match_kind: f.type === 'match' ? (f.match_kind.trim() || null) : null,
      location: f.location.trim() || null,
      description: f.description.trim() || null,
    }

    if (editing) {
      const { data, error } = await supabase.from('events')
        .update({ ...base, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at) })
        .eq('id', event.id).select().single()
      setBusy(false)
      if (error) return setError(error)
      return onSaved?.(data)
    }

    const series_id = offsets.length > 1 ? crypto.randomUUID() : null
    const rows = offsets.map((d) => ({
      ...base, series_id, created_by: user.id,
      starts_at: fromLocalInput(addDays(f.starts_at, d)),
      ends_at: f.ends_at ? fromLocalInput(addDays(f.ends_at, d)) : null,
    }))
    const { data, error } = await supabase.from('events').insert(rows).select()
    if (error) { setBusy(false); return setError(error) }

    if (withPoll && hasAttendance(f.type)) {
      const { data: polls, error: pe } = await supabase.from('polls').insert(data.map((ev) => ({
        title: t('poll.joinTitle', { title: ev.title }), event_id: ev.id, closes_at: ev.starts_at, created_by: user.id,
      }))).select()
      if (!pe && polls?.length) {
        await supabase.from('poll_options').insert(polls.flatMap((p) => [
          { poll_id: p.id, label: t('poll.optJoin'), position: 0 },
          { poll_id: p.id, label: t('poll.optLate'), position: 1 },
          { poll_id: p.id, label: t('poll.optSkip'), position: 2 },
        ]))
      }
    }
    setBusy(false)
    onSaved?.(data[0])
  }

  return (
    <Modal title={editing ? t('event.edit') : t('event.new')} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label={t('event.type')}>
          <div className="chips">
            {EVENT_TYPES.map((ty) => (
              <button type="button" key={ty} disabled={hasAttendance(ty) && !isTrainer}
                className={f.type === ty ? `on type-bg-${ty}` : ''}
                onClick={() => { setF({ ...f, type: ty }); if (!editing) setWithPoll(ty === 'training') }}>
                {t(`etype.${ty}`)}
              </button>
            ))}
          </div>
          {!isTrainer && <span className="field-hint">{t('event.typeHint')}</span>}
        </Field>
        {f.type === 'match' && (
          <Field label={t('event.matchKind')}>
            <ChoiceInput options={MATCH_KINDS} extra={used.kinds} value={f.match_kind} allowEmpty={false}
              placeholder={t('event.matchKindPh')} onChange={(v) => setF({ ...f, match_kind: v })} />
          </Field>
        )}
        <Field label={t('event.title')}>
          <input required maxLength={120} value={f.title} onChange={set('title')} />
        </Field>
        <Field label={t('event.start')}>
          <DateTimeInput required value={f.starts_at} onChange={(v) => setF({ ...f, starts_at: v })} />
        </Field>
        <Field label={t('event.end')}>
          <DateTimeInput value={f.ends_at} fallbackTime={endFallback}
            onChange={(v) => setF({ ...f, ends_at: v })} />
        </Field>
        <Field label={t('event.location')}>
          <ChoiceInput options={LOCATIONS} extra={used.locations} value={f.location}
            placeholder={t('event.locationPh')} onChange={(v) => setF({ ...f, location: v })} />
        </Field>
        <Field label={t('event.description')}>
          <textarea rows={2} value={f.description} onChange={set('description')} />
        </Field>

        {!editing && (
          <Field label={t('event.repeat')}>
            <div className="seg">
              {[[0, 'repeat.none'], [7, 'repeat.weekly'], [14, 'repeat.biweekly']].map(([v, k]) => (
                <button type="button" key={v} className={repeat === v ? 'on' : ''} onClick={() => setRepeat(v)}>{t(k)}</button>
              ))}
            </div>
            {repeat > 0 && (
              <div className="repeat-box">
                <label className="repeat-until">
                  <span>{t('event.repeatUntil')}</span>
                  <input type="date" min={startDate} value={untilDate} onChange={(e) => setUntil(e.target.value)} />
                </label>
                <span className="field-hint">
                  {t('event.repeatCount', { n: offsets.length })}
                  {offsets.length >= MAX_REPEAT && ` ${t('event.repeatMax', { n: MAX_REPEAT })}`}
                </span>
              </div>
            )}
          </Field>
        )}
        {!editing && hasAttendance(f.type) && (
          <label className="check">
            <input type="checkbox" checked={withPoll} onChange={(e) => setWithPoll(e.target.checked)} />
            {t('event.withPoll')}
          </label>
        )}
        {editing && event.series_id && <span className="field-hint">{t('event.editOneHint')}</span>}
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || !f.starts_at}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
