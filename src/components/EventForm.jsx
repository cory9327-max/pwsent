import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { LOCATIONS, MATCH_KINDS } from '../lib/presets'
import { useTypes } from '../lib/types'
import { DateTimeInput } from './inputs'
import ManagedChoice from './ManagedChoice'
import TypeManager from './TypeManager'
import { ErrorText, Field, Icon, Modal, useRoleLabel } from './ui'

const pad = (n) => String(n).padStart(2, '0')
const MAX_REPEAT = 60

// 기본 종료 시각: 시작과 같은 날, n시간 뒤 (23시를 넘기지 않음)
const AUTO_END_HOURS = { match: 3 } // 경기만 자동으로 채움. 훈련 등은 종료를 비워 둠
function defaultEnd(start, hours = 2) {
  if (!start) return ''
  const h = Math.min(23, Number(start.slice(11, 13)) + hours)
  return `${start.slice(0, 10)}T${pad(h)}:${start.slice(14, 16)}`
}

function addDays(local, days) {
  if (!local) return ''
  const d = new Date(local)
  d.setDate(d.getDate() + days)
  return toLocalInput(d.toISOString())
}

/** 일정 등록/수정. 훈련·경기는 트레이너 이상만. 새 일정은 매주/격주 반복 등록 가능 */
export default function EventForm({ event, defaultDate, defaultType, onClose, onSaved }) {
  const { t } = useT()
  const { user, can, roles, rolesManaged } = useAuth()
  const roleLabel = useRoleLabel()
  const isTrainer = can('sessions')
  const isAdmin = can('settings')
  const { types, label, color, hasAttendance, managed } = useTypes()
  const [manageTypes, setManageTypes] = useState(false)
  const editing = Boolean(event)
  const tomorrow = toLocalInput(new Date(Date.now() + 864e5).toISOString()).slice(0, 10)
  const allowed = types.filter((x) => isTrainer || !x.attendance).map((x) => x.key)
  const firstType = allowed.includes(defaultType) ? defaultType : (allowed[0] || 'general')

  const firstStart = `${defaultDate || tomorrow}T19:00`
  const [f, setF] = useState({
    title: event?.title ?? '',
    type: event?.type ?? firstType,
    match_kind: event?.match_kind ?? MATCH_KINDS[0],
    starts_at: event ? toLocalInput(event.starts_at) : firstStart,
    // 경기는 종료를 시작과 같은 날 3시간 뒤로 미리 채움
    ends_at: event ? (event.ends_at ? toLocalInput(event.ends_at) : '') : (AUTO_END_HOURS[firstType] ? defaultEnd(firstStart, AUTO_END_HOURS[firstType]) : ''),
    location: event?.location ?? '',
    description: event?.description ?? '',
  })
  const [autoEnd, setAutoEnd] = useState(!event && Boolean(AUTO_END_HOURS[firstType])) // 종료를 자동으로 채운 상태인지
  const [withPoll, setWithPoll] = useState(false)
  const [vis, setVis] = useState(event?.visible_roles || []) // 볼 수 있는 직급. 비어 있으면 전체 공개
  const [repeat, setRepeat] = useState(0) // 0 = 없음, 7 = 매주, 14 = 격주
  const [until, setUntil] = useState('')
  const [used, setUsed] = useState({ locations: [], kinds: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  // 시작을 바꾸면, 종료가 같은 날이었던 경우 날짜를 따라 옮기고 시작보다 빨라지지 않게 맞춤
  function setStart(v) {
    let end = f.ends_at
    if (end && v && end.slice(0, 10) === f.starts_at.slice(0, 10)) {
      end = `${v.slice(0, 10)}T${end.slice(11)}`
      if (end < v || autoEnd) end = defaultEnd(v, AUTO_END_HOURS[f.type] || 2)
    }
    setF({ ...f, starts_at: v, ends_at: end })
  }
  function setType(ty) {
    let end = f.ends_at
    if (!editing && (autoEnd || !end)) {
      end = AUTO_END_HOURS[ty] ? defaultEnd(f.starts_at, AUTO_END_HOURS[ty]) : ''
      setAutoEnd(Boolean(end))
    }
    setF({ ...f, type: ty, ends_at: end })
    if (!editing) setWithPoll(ty === 'match')
  }

  // 이전에 직접 입력했던 장소·경기 구분도 선택지로 보여주기
  useEffect(() => {
    supabase.from('events').select('location, match_kind').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        const uniq = (k, base) => [...new Set((data || []).map((r) => r[k]).filter((v) => v && !base.includes(v)))].slice(0, 6)
        setUsed({ locations: uniq('location', []), kinds: uniq('match_kind', []) })
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
      ...(rolesManaged ? { visible_roles: vis.length ? vis : null } : {}),
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
            {types.map(({ key: ty }) => (
              <button type="button" key={ty} disabled={hasAttendance(ty) && !isTrainer}
                className={f.type === ty ? 'on' : ''} style={f.type === ty ? { background: color(ty) } : null}
                onClick={() => setType(ty)}>
                {label(ty)}
              </button>
            ))}
          </div>
          {isAdmin && managed && (
            <button type="button" className="link-btn small left muted-link" onClick={() => setManageTypes(!manageTypes)}>
              {manageTypes ? t('list.closeManage') : t('types.manage')}
            </button>
          )}
          {manageTypes && <TypeManager onDeleted={(k) => k === f.type && setType(allowed.find((x) => x !== k) || 'general')} />}
          {!isTrainer && <span className="field-hint">{t('event.typeHint')}</span>}
        </Field>
        {f.type === 'match' && (
          <Field label={t('event.matchKind')}>
            <ManagedChoice table="match_kinds" fallback={MATCH_KINDS} recent={used.kinds} value={f.match_kind} allowEmpty={false}
              placeholder={t('event.matchKindPh')} onChange={(v) => setF({ ...f, match_kind: v })} />
          </Field>
        )}
        <Field label={t('event.title')}>
          <input required maxLength={120} value={f.title} onChange={set('title')} />
        </Field>
        <Field label={t('event.start')}>
          <DateTimeInput required value={f.starts_at} onChange={setStart} />
        </Field>
        <Field label={t('event.end')}>
          <DateTimeInput value={f.ends_at} fallbackTime={endFallback}
            onChange={(v) => { setAutoEnd(false); setF({ ...f, ends_at: v }) }} />
          {!f.ends_at && f.starts_at && (
            <button type="button" className="link-btn small left" onClick={() => { setAutoEnd(false); setF({ ...f, ends_at: defaultEnd(f.starts_at) }) }}>
              {t('event.sameDay')}
            </button>
          )}
        </Field>
        <Field label={t('event.location')}>
          <ManagedChoice table="locations" fallback={LOCATIONS} recent={used.locations} value={f.location}
            placeholder={t('event.locationPh')} onChange={(v) => setF({ ...f, location: v })} />
        </Field>
        <Field label={t('event.description')}>
          <textarea rows={2} value={f.description} onChange={set('description')} />
        </Field>

        {rolesManaged && (
          <Field label={t('event.visibility')} hint={vis.length ? t('event.visHint') : null}>
            <div className="chips">
              <button type="button" className={vis.length === 0 ? 'on' : ''} onClick={() => setVis([])}>{t('event.visAll')}</button>
              {roles.map((r) => (
                <button type="button" key={r.key} className={vis.includes(r.key) ? 'on' : ''}
                  onClick={() => setVis(vis.includes(r.key) ? vis.filter((x) => x !== r.key) : [...vis, r.key])}>
                  {vis.includes(r.key) && <Icon name="lock" size={12} />}{roleLabel(r.key)}
                </button>
              ))}
            </div>
          </Field>
        )}

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
