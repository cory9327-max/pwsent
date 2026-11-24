import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, fromLocalInput, seoulDate } from '../lib/format'
import { addDaysStr, mondayOf, slotLabel } from '../lib/week'
import { LOCATIONS } from '../lib/presets'
import ManagedChoice from './ManagedChoice'
import { ErrorText, Field, Icon, Modal } from './ui'

const pad = (n) => String(n).padStart(2, '0')
const dayLabel = (d, lang) => fmtDate(`${d}T12:00:00`, lang)

/* ------------------------------------------------------------------ */
/*  주간 투표 카드                                                      */
/* ------------------------------------------------------------------ */
export function WeekVoteCard({ week, minPeople, onChange }) {
  const { t, lang } = useT()
  const { user, members, canEdit, nameOf } = useAuth()
  const [editDay, setEditDay] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(false)
  const [open, setOpen] = useState(false)
  const today = seoulDate()
  const thisMonday = mondayOf(today)

  const { weekStart, events, votes, skips } = week
  const isOpen = (ev) => seoulDate(ev.starts_at) > today
  const mine = (ev, s) => votes.some((v) => v.event_id === ev.id && v.slot_key === s.id && v.user_id === user.id)
  const count = (ev, s) => votes.filter((v) => v.event_id === ev.id && v.slot_key === s.id).length
  const hopefuls = (ev) => new Set(votes.filter((v) => v.event_id === ev.id).map((v) => v.user_id)).size
  const iSkip = skips.some((s) => s.user_id === user.id)
  const anyOpen = events.some(isOpen)
  const iAnswered = iSkip || votes.some((v) => v.user_id === user.id)

  const responded = new Set([...votes.map((v) => v.user_id), ...skips.map((s) => s.user_id)])
  const pending = members.filter((m) => m.status === 'approved' && m.track_attendance && !responded.has(m.id))

  async function run(fn) {
    if (busy) return
    setBusy(true); setError(null)
    const { error } = (await fn()) || {}
    setBusy(false)
    if (error) setError(error)
    onChange?.()
  }

  const toggle = (ev, s) => run(async () => {
    if (mine(ev, s)) return supabase.from('training_votes').delete().match({ event_id: ev.id, slot_key: s.id, user_id: user.id })
    if (iSkip) await supabase.from('training_week_skips').delete().match({ week_start: weekStart, user_id: user.id })
    return supabase.from('training_votes').insert({ event_id: ev.id, slot_key: s.id, user_id: user.id })
  })

  const toggleSkip = () => run(async () => {
    if (iSkip) return supabase.from('training_week_skips').delete().match({ week_start: weekStart, user_id: user.id })
    const openIds = events.filter(isOpen).map((e) => e.id)
    if (openIds.length) await supabase.from('training_votes').delete().eq('user_id', user.id).in('event_id', openIds)
    return supabase.from('training_week_skips').insert({ week_start: weekStart, user_id: user.id })
  })

  const confirmDay = (ev) => run(() => supabase.from('events').update({ status: 'confirmed' }).eq('id', ev.id))
  const deleteDay = (ev) => {
    if (!window.confirm(t('wk.deleteDayConfirm', { d: dayLabel(seoulDate(ev.starts_at), lang) }))) return
    run(() => supabase.from('events').delete().eq('id', ev.id))
  }
  const mineToManage = events.filter((e) => canEdit(e.created_by))
  const deleteWeek = () => {
    if (!window.confirm(t('wk.deleteWeekConfirm', { n: mineToManage.length }))) return
    run(() => supabase.from('events').delete().in('id', mineToManage.map((e) => e.id)))
  }
  const cancelDay = (ev) => {
    if (!window.confirm(t('wk.cancelConfirm'))) return
    run(() => supabase.from('events').delete().eq('id', ev.id))
  }

  const title = weekStart === thisMonday ? t('wk.thisWeek') : weekStart === addDaysStr(thisMonday, 7) ? t('wk.nextWeek') : t('wk.weekOf', { d: dayLabel(weekStart, lang) })

  return (
    <div className={`card weekcard ${open ? '' : 'folded'}`}>
      <button type="button" className="fold-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div>
          <h4>{title} · {t('wk.vote')}</h4>
          <div className="meta">{dayLabel(weekStart, lang)} – {dayLabel(addDaysStr(weekStart, 6), lang)} · {t('wk.deadline')}</div>
        </div>
        <span className="fold-side">
          <span className={`pill ${iAnswered ? 'att-present' : 'att-late'}`}>{iAnswered ? t('poll.voted') : t('poll.notVoted')}</span>
          <Icon name={open ? 'chevU' : 'chevD'} />
        </span>
      </button>
      {open && <>
      {mineToManage.length > 0 && (
        <button className="btn ghost small danger-text left" disabled={busy} onClick={deleteWeek}><Icon name="trash" size={14} /> {t('wk.deleteWeek')}</button>
      )}

      {events.map((ev) => {
        const votable = isOpen(ev)
        const tentative = ev.status === 'tentative'
        const n = hopefuls(ev)
        return (
          <div key={ev.id} className={`wk-day ${tentative ? 'tentative' : ''}`}>
            <div className="wk-day-head">
              <Link to={`/events/${ev.id}`} className="wk-date">{dayLabel(seoulDate(ev.starts_at), lang)}</Link>
              {ev.location && <span className="meta"><Icon name="pin" size={13} /> {ev.location}</span>}
              {tentative && <span className={`pill ${n >= minPeople ? 'att-present' : 'att-late'}`}>{t('wk.recruiting')} {n}/{minPeople}</span>}
              {!votable && <span className="pill att-none">{t('poll.closed')}</span>}
              {canEdit(ev.created_by) && (
                <span className="row-actions push">
                  <button className="icon-btn" onClick={() => setEditDay(ev)} aria-label={t('common.edit')}><Icon name="edit" size={15} /></button>
                  <button className="icon-btn danger" onClick={() => deleteDay(ev)} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>
                </span>
              )}
            </div>
            <div className="wk-slots">
              {(ev.slots || []).map((s) => (
                <button key={s.id} className={`wk-slot ${mine(ev, s) ? 'mine' : ''}`} disabled={!votable || busy} onClick={() => toggle(ev, s)}>
                  <span>{mine(ev, s) && '✓ '}{slotLabel(s)}</span>
                  <b>{count(ev, s)}</b>
                </button>
              ))}
            </div>
            {tentative && canEdit(ev.created_by) && (
              <div className="wk-trainer">
                <span className="muted small">{n >= minPeople ? t('wk.enough', { n }) : t('wk.notEnough', { n, min: minPeople })}</span>
                <button className="btn primary small" disabled={busy} onClick={() => confirmDay(ev)}>{t('wk.confirm')}</button>
                <button className="btn ghost small" disabled={busy} onClick={() => cancelDay(ev)}>{t('wk.cancel')}</button>
              </div>
            )}
          </div>
        )
      })}

      <div className="poll-foot">
        <label className="check">
          <input type="checkbox" checked={iSkip} disabled={!anyOpen || busy} onChange={toggleSkip} /> {t('wk.skip')}
        </label>
        <button className="link-btn" onClick={() => setDetail(!detail)}>
          {t('wk.detail', { n: pending.length })}
        </button>
      </div>
      {detail && (
        <div className="voters">
          {events.map((ev) => (ev.slots || []).map((s) => (
            <div key={ev.id + s.id}>
              <strong>{dayLabel(seoulDate(ev.starts_at), lang)} {s.name}</strong>: {votes.filter((v) => v.event_id === ev.id && v.slot_key === s.id).map((v) => nameOf(v.user_id)).join(', ') || '—'}
            </div>
          )))}
          <div><strong>{t('wk.skipList')}</strong>: {skips.map((s) => nameOf(s.user_id)).join(', ') || '—'}</div>
          <div><strong>{t('wk.pending')}</strong>: {pending.map((m) => m.display_name).join(', ') || '—'}</div>
        </div>
      )}
      </>}
      <ErrorText error={error} />
      {editDay && <DayEditModal event={editDay} onClose={() => setEditDay(null)} onSaved={() => { setEditDay(null); onChange?.() }} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  열린 훈련 하루 수정: 장소 · 그날의 타임                                */
/* ------------------------------------------------------------------ */
function DayEditModal({ event, onClose, onSaved }) {
  const { t, lang } = useT()
  const date = seoulDate(event.starts_at)
  const [loc, setLoc] = useState(event.location || '')
  const [slots, setSlots] = useState((event.slots || []).map((s) => ({ ...s, end: s.end || '' })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const setSlot = (i, p) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...p } : s)))

  async function submit(e) {
    e.preventDefault()
    const clean = slots.filter((s) => s.name.trim() && s.start).map((s) => ({ id: s.id, name: s.name.trim(), start: s.start, end: s.end || null }))
    if (!clean.length) return setError(t('wk.noSlots'))
    setBusy(true); setError(null)
    const first = clean.map((s) => s.start).sort()[0]
    const ends = clean.map((s) => s.end).filter(Boolean).sort()
    const { error } = await supabase.from('events').update({
      location: loc.trim() || null,
      slots: clean,
      starts_at: fromLocalInput(`${date}T${first}`),
      ends_at: ends.length === clean.length ? fromLocalInput(`${date}T${ends[ends.length - 1]}`) : null,
    }).eq('id', event.id)
    setBusy(false)
    if (error) return setError(error)
    onSaved()
  }

  return (
    <Modal title={`${dayLabel(date, lang)} · ${t('wk.editTitle')}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label={t('event.location')}>
          <ManagedChoice table="locations" fallback={LOCATIONS} value={loc} onChange={setLoc} placeholder={t('event.locationPh')} />
        </Field>
        <Field label={t('wk.slots')} hint={t('wk.slotsDayHint')}>
          <div className="stack tight">
            {slots.map((s, i) => (
              <div className="slot-row" key={s.id}>
                <input value={s.name} maxLength={30} onChange={(e) => setSlot(i, { name: e.target.value })} />
                <TimeSelect value={s.start} onChange={(v) => v && setSlot(i, { start: v })} />
                <TimeSelect optional value={s.end} onChange={(v) => setSlot(i, { end: v })} />
                <button type="button" className="icon-btn danger" disabled={slots.length < 2} onClick={() => setSlots(slots.filter((_, j) => j !== i))} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>
              </div>
            ))}
            <button type="button" className="btn ghost small left" onClick={() => setSlots([...slots, { id: crypto.randomUUID(), name: '', start: '17:00', end: '' }])}>
              <Icon name="plus" size={14} /> {t('wk.addSlot')}
            </button>
          </div>
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

/* ------------------------------------------------------------------ */
/*  시:분 선택 (24시간제, 15분 단위)                                     */
/* ------------------------------------------------------------------ */
function TimeSelect({ value, onChange, optional }) {
  const { t } = useT()
  const [h, m] = value ? value.split(':') : ['', '00']
  return (
    <span className="time-select">
      <select value={h === '' ? '' : Number(h)} onChange={(e) => onChange(e.target.value === '' ? '' : `${pad(e.target.value)}:${m}`)}>
        {optional && <option value="">—</option>}
        {[...Array(24)].map((_, x) => <option key={x} value={x}>{t('time.hour', { n: x })}</option>)}
      </select>
      <select value={m} disabled={h === ''} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {['00', '15', '30', '45'].map((x) => <option key={x} value={x}>{t('time.minute', { n: x })}</option>)}
      </select>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  시간표 수정 (트레이너 이상)                                          */
/* ------------------------------------------------------------------ */
export function SlotEditor({ slots, minPeople, onChange }) {
  const { t } = useT()
  const [n, setN] = useState({ name: '', start_time: '17:00', end_time: '' })
  const [error, setError] = useState(null)
  const done = ({ error }) => { if (error) setError(error); else { setError(null); onChange() } }

  const patch = (s, p) => supabase.from('training_slots').update(p).eq('id', s.id).then(done)
  const remove = (s) => supabase.from('training_slots').delete().eq('id', s.id).then(done)
  const add = () => {
    if (!n.name.trim()) return
    supabase.from('training_slots').insert({ name: n.name.trim(), start_time: n.start_time, end_time: n.end_time || null, position: slots.length + 1 })
      .then((r) => { if (!r.error) setN({ name: '', start_time: '17:00', end_time: '' }); done(r) })
  }

  return (
    <div className="loc-manage">
      {slots.map((s) => (
        <div className="slot-row" key={s.id}>
          <input defaultValue={s.name} maxLength={30} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) patch(s, { name: v }) }} />
          <TimeSelect value={s.start_time} onChange={(v) => v && patch(s, { start_time: v })} />
          <TimeSelect optional value={s.end_time || ''} onChange={(v) => patch(s, { end_time: v || null })} />
          <button type="button" className="icon-btn danger" onClick={() => remove(s)} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>
        </div>
      ))}
      <div className="slot-row">
        <input value={n.name} maxLength={30} placeholder={t('wk.slotNewPh')} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <TimeSelect value={n.start_time} onChange={(v) => v && setN({ ...n, start_time: v })} />
        <TimeSelect optional value={n.end_time} onChange={(v) => setN({ ...n, end_time: v })} />
        <button type="button" className="btn primary small" onClick={add}>{t('common.add')}</button>
      </div>
      <label className="repeat-until">
        <span>{t('wk.minPeople')}</span>
        <input type="number" min="1" max="99" defaultValue={minPeople} style={{ maxWidth: 90 }}
          onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v !== minPeople) supabase.from('training_settings').update({ min_people: v }).eq('id', true).then(done) }} />
      </label>
      <span className="field-hint">{t('wk.slotHint')}</span>
      <ErrorText error={error} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  주간 훈련 열기 (여러 주 한 번에) + 평일 훈련 모집                      */
/* ------------------------------------------------------------------ */
const WEEKDAYS = [1, 2, 3, 4, 5] // 월~금 (월요일 기준 0~4 오프셋 = 값-1)

export function OpenWeeksModal({ minPeople, onClose, onSaved }) {
  const { t, lang } = useT()
  const { user } = useAuth()
  const today = seoulDate()
  const [slots, setSlots] = useState(null)
  const [places, setPlaces] = useState(LOCATIONS)
  const [base, setBase] = useState(0) // 0 = 이번 주부터, 1 = 다음 주부터
  const [count, setCount] = useState(1)
  const [sat, setSat] = useState({ on: true, loc: '' })
  const [sun, setSun] = useState({ on: true, loc: '' })
  const [wk, setWk] = useState({ on: false, day: 5, time: '18:00', loc: '' })
  const [taken, setTaken] = useState({ match: new Set(), training: new Set() })
  const [off, setOff] = useState(new Set()) // 직접 체크 해제한 날짜
  const [editSlots, setEditSlots] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadSlots = () => supabase.from('training_slots').select('*').order('position').order('created_at').then(({ data }) => setSlots(data || []))
  useEffect(() => {
    loadSlots()
    supabase.from('locations').select('name').order('position').then(({ data }) => { if (data?.length) setPlaces(data.map((l) => l.name)) })
    try {
      const saved = JSON.parse(localStorage.getItem('pws.trainingLoc') || '{}')
      setSat((s) => ({ ...s, loc: saved.sat || '' })); setSun((s) => ({ ...s, loc: saved.sun || '' })); setWk((s) => ({ ...s, loc: saved.wk || '' }))
    } catch { /* 무시 */ }
  }, [])

  const firstMonday = addDaysStr(mondayOf(today), base * 7)
  const lastDay = addDaysStr(firstMonday, count * 7 - 1)

  useEffect(() => {
    supabase.from('events').select('type, starts_at, slots')
      .gte('starts_at', new Date(`${firstMonday}T00:00:00`).toISOString()).lte('starts_at', new Date(`${lastDay}T23:59:59`).toISOString())
      .then(({ data }) => setTaken({
        match: new Set((data || []).filter((e) => e.type === 'match').map((e) => seoulDate(e.starts_at))),
        training: new Set((data || []).filter((e) => e.slots).map((e) => seoulDate(e.starts_at))),
      }))
  }, [firstMonday, lastDay])

  const rows = useMemo(() => {
    const out = []
    for (let w = 0; w < count; w++) {
      const mon = addDaysStr(firstMonday, w * 7)
      if (wk.on) out.push({ date: addDaysStr(mon, wk.day - 1), kind: 'wk', loc: wk.loc })
      if (sat.on) out.push({ date: addDaysStr(mon, 5), kind: 'sat', loc: sat.loc })
      if (sun.on) out.push({ date: addDaysStr(mon, 6), kind: 'sun', loc: sun.loc })
    }
    return out.filter((r) => r.date >= today).map((r) => ({
      ...r,
      exists: taken.training.has(r.date),
      match: taken.match.has(r.date),
    }))
  }, [count, firstMonday, sat, sun, wk, taken, today])

  // 경기 있는 날은 기본으로 빼 둠 (직접 다시 켤 수 있음)
  const isOn = (r) => !r.exists && (off.has(r.date) ? false : !r.match || off.has(`+${r.date}`))
  const flip = (r) => {
    const next = new Set(off)
    if (r.match) { next.has(`+${r.date}`) ? next.delete(`+${r.date}`) : next.add(`+${r.date}`) }
    else { next.has(r.date) ? next.delete(r.date) : next.add(r.date) }
    setOff(next)
  }
  const chosen = rows.filter(isOn)

  async function submit(e) {
    e.preventDefault()
    if (!chosen.length) return
    if (chosen.some((r) => r.kind !== 'wk') && !slots?.length) return setError(t('wk.noSlots'))
    setBusy(true); setError(null)
    const snap = slots.map((s) => ({ id: s.id, name: s.name, start: s.start_time, end: s.end_time }))
    const first = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time))[0]
    const ends = slots.map((s) => s.end_time).filter(Boolean).sort()
    const lastEnd = ends.length === slots.length ? ends[ends.length - 1] : null
    const payload = chosen.map((r) => r.kind === 'wk'
      ? {
        title: t('wk.titleWeekday'), type: 'training', status: 'tentative', location: r.loc || null, created_by: user.id,
        starts_at: fromLocalInput(`${r.date}T${wk.time}`), ends_at: null,
        slots: [{ id: 'wk', name: t('wk.join'), start: wk.time, end: null }],
      }
      : {
        title: t('wk.titleWeekend'), type: 'training', status: 'confirmed', location: r.loc || null, created_by: user.id,
        starts_at: fromLocalInput(`${r.date}T${first.start_time}`), ends_at: lastEnd ? fromLocalInput(`${r.date}T${lastEnd}`) : null,
        slots: snap,
      })
    const { error } = await supabase.from('events').insert(payload)
    setBusy(false)
    if (error) return setError(error)
    try { localStorage.setItem('pws.trainingLoc', JSON.stringify({ sat: sat.loc, sun: sun.loc, wk: wk.loc })) } catch { /* 무시 */ }
    onSaved?.()
  }

  const LocSelect = ({ v, set }) => (
    <select value={v.loc} onChange={(e) => set({ ...v, loc: e.target.value })} disabled={!v.on}>
      <option value="">{t('wk.locNone')}</option>
      {places.map((p) => <option key={p}>{p}</option>)}
    </select>
  )
  const wdName = (d) => new Intl.DateTimeFormat({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' }[lang], { weekday: 'short' }).format(new Date(2024, 0, d)) // 2024-01-01 = 월

  return (
    <Modal title={t('wk.open')} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="row2">
          <Field label={t('wk.from')}>
            <div className="seg">
              <button type="button" className={base === 0 ? 'on' : ''} onClick={() => setBase(0)}>{t('wk.thisWeek')}</button>
              <button type="button" className={base === 1 ? 'on' : ''} onClick={() => setBase(1)}>{t('wk.nextWeek')}</button>
            </div>
          </Field>
          <Field label={t('wk.howMany')}>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((x) => <option key={x} value={x}>{t('wk.nWeeks', { n: x })}</option>)}
            </select>
          </Field>
        </div>

        <Field label={t('wk.days')}>
          <div className="wk-dayset">
            <label className="check"><input type="checkbox" checked={sat.on} onChange={(e) => setSat({ ...sat, on: e.target.checked })} /> {wdName(6)}</label>
            <LocSelect v={sat} set={setSat} />
            <label className="check"><input type="checkbox" checked={sun.on} onChange={(e) => setSun({ ...sun, on: e.target.checked })} /> {wdName(7)}</label>
            <LocSelect v={sun} set={setSun} />
          </div>
          <span className="field-hint">
            {slots ? slots.map((s) => slotLabel({ name: s.name, start: s.start_time, end: s.end_time })).join(' · ') : '…'}{' '}
            <button type="button" className="link-btn small" onClick={() => setEditSlots(!editSlots)}>{editSlots ? t('list.closeManage') : t('wk.editSlots')}</button>
          </span>
          {editSlots && slots && <SlotEditor slots={slots} minPeople={minPeople} onChange={() => { loadSlots(); onSaved?.(true) }} />}
        </Field>

        <Field label={t('wk.weekday')} hint={t('wk.weekdayHint', { n: minPeople })}>
          <div className="wk-dayset wide">
            <label className="check"><input type="checkbox" checked={wk.on} onChange={(e) => setWk({ ...wk, on: e.target.checked })} /> {t('wk.recruit')}</label>
            <select value={wk.day} disabled={!wk.on} onChange={(e) => setWk({ ...wk, day: Number(e.target.value) })}>
              {WEEKDAYS.map((d) => <option key={d} value={d}>{wdName(d)}</option>)}
            </select>
            <TimeSelect value={wk.time} onChange={(v) => v && setWk({ ...wk, time: v })} />
            <LocSelect v={wk} set={setWk} />
          </div>
        </Field>

        <Field label={t('wk.preview', { n: chosen.length })}>
          <ul className="wk-preview">
            {rows.map((r) => (
              <li key={r.date + r.kind}>
                <label className="check">
                  <input type="checkbox" checked={isOn(r)} disabled={r.exists} onChange={() => flip(r)} />
                  <span className="wk-date">{dayLabel(r.date, lang)}</span>
                </label>
                <span className="meta">{r.kind === 'wk' ? `${wk.time} · ${t('wk.recruiting')}` : t('wk.titleWeekend')}{r.loc ? ` · ${r.loc}` : ''}</span>
                {r.exists && <span className="pill att-none">{t('wk.exists')}</span>}
                {r.match && !r.exists && <span className="pill att-absent">{t('wk.hasMatch')}</span>}
              </li>
            ))}
            {rows.length === 0 && <li className="muted small">{t('wk.noDays')}</li>}
          </ul>
        </Field>

        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || !chosen.length}>{busy ? t('common.saving') : t('wk.create', { n: chosen.length })}</button>
        </div>
      </form>
    </Modal>
  )
}
