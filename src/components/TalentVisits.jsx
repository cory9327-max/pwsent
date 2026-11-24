import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate, fmtTime, fromLocalInput, toLocalInput } from '../lib/format'
import { DateTimeInput } from './inputs'
import { Empty, ErrorText, Field, Icon, Modal, confirmDelete, useRoleLabel } from './ui'

const AIRPORTS = ['인천국제공항', '김포국제공항', '김해국제공항', '제주국제공항']
const one = (x) => (Array.isArray(x) ? x[0] : x) || null
const gmap = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
const nmap = (q) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`

/** 주소·장소를 구글 지도 / 네이버 지도로 여는 링크 */
function MapLinks({ query }) {
  const { t } = useT()
  if (!query) return null
  return (
    <span className="map-links">
      <a href={gmap(query)} target="_blank" rel="noreferrer"><Icon name="pin" size={13} /> {t('tv.google')}</a>
      <a href={nmap(query)} target="_blank" rel="noreferrer"><Icon name="pin" size={13} /> {t('tv.naver')}</a>
    </span>
  )
}

/** 해외선수 방문 일정: 항공편·공항·터미널·숙소. 저장하면 일정 탭에 [입국]/[출국]이 자동으로 올라감 */
export default function TalentVisits() {
  const { t, lang } = useT()
  const roleLabel = useRoleLabel()
  const [rows, setRows] = useState(null)
  const [talents, setTalents] = useState([])
  const [missing, setMissing] = useState(false)
  const [past, setPast] = useState(false)
  const [modal, setModal] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [v, tl] = await Promise.all([
      supabase.from('talent_visits').select('*, foreign_talents(id, name, ring_name, nationality)').order('arrive_at', { ascending: true, nullsFirst: false }),
      supabase.from('foreign_talents').select('id, name, ring_name').order('name'),
    ])
    if (v.error) { setMissing(true); setRows([]); return }
    setRows((v.data || []).map((r) => ({ ...r, talent: one(r.foreign_talents) })))
    setTalents(tl.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function remove(r) {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('talent_visits').delete().eq('id', r.id)
    if (error) return setError(error)
    load()
  }

  if (rows === null) return <div className="spinner" />
  if (missing) return <Empty>{t('admin.needSql', { f: '10_talent_visits.sql' })}</Empty>

  const now = new Date().toISOString()
  const isPast = (r) => (r.depart_at || r.arrive_at || '9') < now
  const shown = rows.filter((r) => isPast(r) === past)
  const when = (d) => (d ? `${fmtDate(d, lang)} ${fmtTime(d, lang)}` : null)
  const leg = (label, at, flight, airport, terminal, eventId) => (at || flight || airport) && (
    <div className="leg">
      <span className="leg-label">{label}</span>
      <div className="leg-body">
        <strong>{when(at) || t('tv.timeTbd')}</strong>
        <span>{[flight, airport, terminal].filter(Boolean).join(' · ') || '—'}</span>
        <span className="leg-links">
          {airport && <MapLinks query={[airport, terminal].filter(Boolean).join(' ')} />}
          {eventId && <Link to={`/events/${eventId}`} className="map-links-a"><Icon name="calendar" size={13} /> {t('tv.inSchedule')}</Link>}
        </span>
      </div>
    </div>
  )

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="seg small">
          <button className={!past ? 'on' : ''} onClick={() => setPast(false)}>{t('tv.upcoming')}</button>
          <button className={past ? 'on' : ''} onClick={() => setPast(true)}>{t('tv.past')}</button>
        </div>
        <span className="muted small grow">{t('tv.hint')}</span>
        <button className="btn primary" disabled={!talents.length} onClick={() => setModal({})}><Icon name="plus" size={16} /> {t('tv.new')}</button>
      </div>
      {!talents.length && <div className="notice warn">{t('tv.needTalent')}</div>}
      <ErrorText error={error} />

      {shown.length === 0 ? <Empty>{t('tv.empty')}</Empty> : (
        <div className="grid-cards wide">
          {shown.map((r) => (
            <div key={r.id} className="card visit-card">
              <div className="poll-head">
                <div>
                  <h4>{r.talent?.ring_name || r.talent?.name || '—'}</h4>
                  <div className="meta">
                    {[r.talent?.ring_name && r.talent?.name, r.talent?.nationality].filter(Boolean).join(' · ')}
                    {r.visible_roles?.length > 0 && <span className="vis-note small"> <Icon name="lock" size={12} /> {r.visible_roles.map(roleLabel).join(', ')}</span>}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => setModal(r)} aria-label={t('common.edit')}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => remove(r)} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
                </div>
              </div>
              {leg(t('tv.arrive'), r.arrive_at, r.arrive_flight, r.arrive_airport, r.arrive_terminal, r.arrive_event_id)}
              {leg(t('tv.depart'), r.depart_at, r.depart_flight, r.depart_airport, r.depart_terminal, r.depart_event_id)}
              {(r.stay_name || r.stay_address) && (
                <div className="leg">
                  <span className="leg-label">{t('tv.stay')}</span>
                  <div className="leg-body">
                    {r.stay_name && <strong>{r.stay_name}</strong>}
                    {r.stay_address && <span>{r.stay_address}</span>}
                    <span className="leg-links"><MapLinks query={r.stay_address || r.stay_name} /></span>
                  </div>
                </div>
              )}
              {r.notes && <p className="poll-desc">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}
      {modal && <VisitForm visit={modal.id ? modal : null} talents={talents} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}

function VisitForm({ visit, talents, onClose, onSaved }) {
  const { t } = useT()
  const { user, roles, rolesManaged, permsOf } = useAuth()
  const roleLabel = useRoleLabel()
  // 기본 공개 범위: 해외선수 권한이 있는 직급
  const defaultVis = roles.filter((r) => permsOf(r.key).includes('foreign')).map((r) => r.key)
  const [f, setF] = useState({
    talent_id: visit?.talent_id ?? talents[0]?.id ?? '',
    arrive_at: visit?.arrive_at ? toLocalInput(visit.arrive_at) : '', arrive_flight: visit?.arrive_flight ?? '',
    arrive_airport: visit?.arrive_airport ?? '', arrive_terminal: visit?.arrive_terminal ?? '',
    depart_at: visit?.depart_at ? toLocalInput(visit.depart_at) : '', depart_flight: visit?.depart_flight ?? '',
    depart_airport: visit?.depart_airport ?? '', depart_terminal: visit?.depart_terminal ?? '',
    stay_name: visit?.stay_name ?? '', stay_address: visit?.stay_address ?? '', notes: visit?.notes ?? '',
  })
  const [vis, setVis] = useState(visit ? (visit.visible_roles || []) : defaultVis)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const txt = (v) => v.trim() || null

  async function submit(e) {
    e.preventDefault()
    if (f.arrive_at && f.depart_at && f.depart_at < f.arrive_at) return setError(t('tv.departBeforeArrive'))
    setBusy(true); setError(null)
    const row = {
      talent_id: f.talent_id,
      arrive_at: fromLocalInput(f.arrive_at), arrive_flight: txt(f.arrive_flight), arrive_airport: txt(f.arrive_airport), arrive_terminal: txt(f.arrive_terminal),
      depart_at: fromLocalInput(f.depart_at), depart_flight: txt(f.depart_flight), depart_airport: txt(f.depart_airport), depart_terminal: txt(f.depart_terminal),
      stay_name: txt(f.stay_name), stay_address: txt(f.stay_address), notes: txt(f.notes),
      visible_roles: rolesManaged && vis.length ? vis : null,
    }
    const { error } = visit
      ? await supabase.from('talent_visits').update(row).eq('id', visit.id)
      : await supabase.from('talent_visits').insert({ ...row, created_by: user.id })
    setBusy(false)
    if (error) return setError(error)
    onSaved()
  }

  const flightBlock = (title, k) => (
    <fieldset className="cost-box">
      <legend>{title}</legend>
      <Field label={t('tv.datetime')}>
        <DateTimeInput value={f[`${k}_at`]} fallbackTime="12:00" onChange={(v) => setF({ ...f, [`${k}_at`]: v })} />
      </Field>
      <div className="row3">
        <Field label={t('tv.flightNo')}><input value={f[`${k}_flight`]} placeholder="KE082" onChange={set(`${k}_flight`)} /></Field>
        <Field label={t('tv.airport')}><input list="airport-list" value={f[`${k}_airport`]} onChange={set(`${k}_airport`)} /></Field>
        <Field label={t('tv.terminal')}><input value={f[`${k}_terminal`]} placeholder="T2" onChange={set(`${k}_terminal`)} /></Field>
      </div>
    </fieldset>
  )

  return (
    <Modal title={visit ? t('tv.edit') : t('tv.new')} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <datalist id="airport-list">{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
        <Field label={t('tv.talent')}>
          <select required value={f.talent_id} onChange={set('talent_id')}>
            {talents.map((x) => <option key={x.id} value={x.id}>{x.ring_name ? `${x.ring_name} (${x.name})` : x.name}</option>)}
          </select>
        </Field>
        {flightBlock(t('tv.arrive'), 'arrive')}
        {flightBlock(t('tv.depart'), 'depart')}
        <fieldset className="cost-box">
          <legend>{t('tv.stay')}</legend>
          <div className="row2">
            <Field label={t('tv.stayName')}><input value={f.stay_name} placeholder={t('tv.stayNamePh')} onChange={set('stay_name')} /></Field>
            <Field label={t('tv.stayAddress')} hint={t('tv.addressHint')}><input value={f.stay_address} onChange={set('stay_address')} /></Field>
          </div>
        </fieldset>
        {rolesManaged && (
          <Field label={t('tv.visibility')} hint={t('tv.visibilityHint')}>
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
        <Field label={t('fv.notes')}><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy || !f.talent_id}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
