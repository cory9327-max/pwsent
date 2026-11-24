import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, fmtMoney, seoulDate } from '../lib/format'
import { Empty, ErrorText, Field, Icon, Modal, confirmDelete } from '../components/ui'

const CURRENCIES = ['KRW', 'JPY', 'USD', 'EUR', 'GBP', 'MXN', 'TWD', 'AUD']
const STATUSES = ['planned', 'confirmed', 'done', 'cancelled']

export const visitTotal = (v) =>
  Number(v.stay_cost || 0) + (v.flight_provided ? Number(v.flight_cost || 0) : 0) + Number(v.guarantee || 0) + Number(v.other_cost || 0)

const nights = (v) => (v.arrival_date && v.departure_date
  ? Math.round((new Date(v.departure_date) - new Date(v.arrival_date)) / 864e5) : null)

export default function Foreign() {
  const { t, lang } = useT()
  const { nameOf } = useAuth()
  const [rows, setRows] = useState([])
  const [view, setView] = useState('upcoming')
  const [year, setYear] = useState(new Date().getFullYear())
  const [modal, setModal] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('foreign_visits').select('*').order('arrival_date', { ascending: true, nullsFirst: false })
    if (error) setError(error)
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const today = seoulDate()
  const inYear = rows.filter((r) => (r.arrival_date || '').startsWith(String(year)))
  const shown = view === 'upcoming'
    ? rows.filter((r) => r.status !== 'cancelled' && (!r.departure_date || r.departure_date >= today))
    : view === 'year' ? inYear : rows

  const byCur = {}
  for (const r of inYear.filter((x) => x.status !== 'cancelled')) byCur[r.currency] = (byCur[r.currency] || 0) + visitTotal(r)
  const guaranteeByCur = {}
  for (const r of inYear.filter((x) => x.status !== 'cancelled')) guaranteeByCur[r.currency] = (guaranteeByCur[r.currency] || 0) + Number(r.guarantee || 0)

  async function remove(v) {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('foreign_visits').delete().eq('id', v.id)
    if (error) return setError(error)
    load()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.foreign')}</h1>
          <p className="muted"><Icon name="globe" size={14} /> {t('fv.adminOnly')}</p>
        </div>
        <button className="btn primary" onClick={() => setModal({})}><Icon name="plus" size={16} /> {t('fv.new')}</button>
      </div>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-label">{t('fv.upcomingCount')}</span>
          <strong className="stat-value">{rows.filter((r) => r.status !== 'cancelled' && (!r.departure_date || r.departure_date >= today)).length}</strong>
        </div>
        <div className="card stat">
          <span className="stat-label">
            <select className="inline-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[...new Set([new Date().getFullYear() + 1, new Date().getFullYear(), ...rows.map((r) => Number((r.arrival_date || '').slice(0, 4))).filter(Boolean)])]
                .sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y}</option>)}
            </select> {t('fv.yearTotal')}
          </span>
          <strong className="stat-value small">
            {Object.keys(byCur).length ? Object.entries(byCur).map(([c, v]) => <div key={c}>{fmtMoney(v, c, lang)}</div>) : '—'}
          </strong>
        </div>
        <div className="card stat">
          <span className="stat-label">{year} {t('fv.guaranteeTotal')}</span>
          <strong className="stat-value small">
            {Object.keys(guaranteeByCur).length ? Object.entries(guaranteeByCur).map(([c, v]) => <div key={c}>{fmtMoney(v, c, lang)}</div>) : '—'}
          </strong>
        </div>
      </div>

      <div className="tabs">
        <button className={view === 'upcoming' ? 'on' : ''} onClick={() => setView('upcoming')}>{t('fv.tabUpcoming')}</button>
        <button className={view === 'year' ? 'on' : ''} onClick={() => setView('year')}>{year}</button>
        <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>{t('common.all')}</button>
      </div>
      <ErrorText error={error} />

      {shown.length === 0 ? <Empty>{t('fv.empty')}</Empty> : (
        <div className="grid-cards">
          {shown.map((v) => (
            <div key={v.id} className={`card visit st-${v.status}`}>
              <div className="poll-head">
                <div>
                  <h4>{v.ring_name || v.player_name}{v.ring_name && <span className="muted small"> ({v.player_name})</span>}</h4>
                  <div className="meta">{v.country || '—'} · <span className={`pill fv-${v.status}`}>{t(`fv.st.${v.status}`)}</span></div>
                </div>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => setModal(v)} aria-label={t('common.edit')}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => remove(v)} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
                </div>
              </div>
              <div className="visit-dates">
                <Icon name="calendar" size={14} />
                {v.arrival_date ? fmtDate(v.arrival_date + 'T12:00:00', lang) : '?'} → {v.departure_date ? fmtDate(v.departure_date + 'T12:00:00', lang) : '?'}
                {nights(v) !== null && <span className="muted small"> · {t('fv.nights', { n: nights(v) })}</span>}
              </div>
              {v.schedule && <p className="visit-sched">{v.schedule}</p>}
              <dl className="cost">
                <dt>{t('fv.stay')}</dt><dd>{t(`fv.stay.${v.stay}`)} · {fmtMoney(v.stay_cost, v.currency, lang)}</dd>
                <dt>{t('fv.flight')}</dt><dd>{v.flight_provided ? `${t('fv.provided')} · ${fmtMoney(v.flight_cost, v.currency, lang)}` : t('fv.notProvided')}</dd>
                <dt>{t('fv.guarantee')}</dt><dd>{fmtMoney(v.guarantee, v.currency, lang)}</dd>
                {Number(v.other_cost) > 0 && <><dt>{t('fv.other')}</dt><dd>{fmtMoney(v.other_cost, v.currency, lang)}</dd></>}
                <dt className="total">{t('fv.total')}</dt><dd className="total">{fmtMoney(visitTotal(v), v.currency, lang)}</dd>
              </dl>
              {v.contact && <div className="meta">{t('fv.contact')}: {v.contact}</div>}
              {v.notes && <p className="poll-desc">{v.notes}</p>}
              <div className="meta muted small">{t('fv.by', { name: nameOf(v.created_by) })}</div>
            </div>
          ))}
        </div>
      )}

      {modal && <VisitForm visit={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}

function VisitForm({ visit, onClose, onSaved }) {
  const { t, lang } = useT()
  const { user } = useAuth()
  const [f, setF] = useState({
    player_name: '', ring_name: '', country: '', contact: '', arrival_date: '', departure_date: '', schedule: '',
    stay: 'dorm', stay_cost: 0, flight_provided: false, flight_cost: 0, guarantee: 0, other_cost: 0,
    currency: 'KRW', status: 'planned', notes: '',
    ...Object.fromEntries(Object.entries(visit || {}).map(([k, v]) => [k, v ?? ''])),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    const num = (v) => (v === '' ? 0 : Number(v))
    const row = {
      player_name: f.player_name.trim(), ring_name: f.ring_name.trim() || null, country: f.country.trim() || null,
      contact: f.contact.trim() || null, arrival_date: f.arrival_date || null, departure_date: f.departure_date || null,
      schedule: f.schedule.trim() || null, stay: f.stay, stay_cost: num(f.stay_cost), flight_provided: f.flight_provided,
      flight_cost: f.flight_provided ? num(f.flight_cost) : 0, guarantee: num(f.guarantee), other_cost: num(f.other_cost),
      currency: f.currency, status: f.status, notes: f.notes.trim() || null,
    }
    const { error } = visit
      ? await supabase.from('foreign_visits').update(row).eq('id', visit.id)
      : await supabase.from('foreign_visits').insert({ ...row, created_by: user.id })
    setBusy(false)
    if (error) return setError(error)
    onSaved()
  }

  return (
    <Modal title={visit ? t('fv.edit') : t('fv.new')} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="row2">
          <Field label={t('fv.playerName')}><input required value={f.player_name} onChange={set('player_name')} autoFocus /></Field>
          <Field label={t('name.ring')}><input value={f.ring_name} onChange={set('ring_name')} /></Field>
        </div>
        <div className="row2">
          <Field label={t('fv.country')}><input value={f.country} onChange={set('country')} /></Field>
          <Field label={t('fv.contact')}><input value={f.contact} onChange={set('contact')} /></Field>
        </div>
        <div className="row3">
          <Field label={t('fv.arrival')}><input type="date" value={f.arrival_date} onChange={set('arrival_date')} /></Field>
          <Field label={t('fv.departure')}><input type="date" value={f.departure_date} min={f.arrival_date || undefined} onChange={set('departure_date')} /></Field>
          <Field label={t('fv.status')}>
            <select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{t(`fv.st.${s}`)}</option>)}</select>
          </Field>
        </div>
        <Field label={t('fv.schedule')} hint={t('fv.scheduleHint')}>
          <textarea rows={2} value={f.schedule} onChange={set('schedule')} />
        </Field>

        <fieldset className="cost-box">
          <legend>{t('fv.costs')}</legend>
          <div className="row3">
            <Field label={t('fv.currency')}>
              <select value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label={t('fv.stay')}>
              <select value={f.stay} onChange={set('stay')}>{['dorm', 'hotel', 'none'].map((s) => <option key={s} value={s}>{t(`fv.stay.${s}`)}</option>)}</select>
            </Field>
            <Field label={t('fv.stayCost')}><input type="number" min="0" step="any" value={f.stay_cost} onChange={set('stay_cost')} /></Field>
          </div>
          <div className="row3">
            <Field label={t('fv.flight')}>
              <label className="check"><input type="checkbox" checked={f.flight_provided} onChange={set('flight_provided')} /> {t('fv.provideFlight')}</label>
            </Field>
            <Field label={t('fv.flightCost')}><input type="number" min="0" step="any" disabled={!f.flight_provided} value={f.flight_cost} onChange={set('flight_cost')} /></Field>
            <Field label={t('fv.guarantee')}><input type="number" min="0" step="any" value={f.guarantee} onChange={set('guarantee')} /></Field>
          </div>
          <div className="row3">
            <Field label={t('fv.other')}><input type="number" min="0" step="any" value={f.other_cost} onChange={set('other_cost')} /></Field>
            <div className="field total-preview">
              <span className="field-label">{t('fv.total')}</span>
              <strong>{fmtMoney(visitTotal({ ...f, flight_cost: f.flight_provided ? f.flight_cost : 0 }), f.currency, lang)}</strong>
            </div>
          </div>
        </fieldset>

        <Field label={t('fv.notes')}><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
