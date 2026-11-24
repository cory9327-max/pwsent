import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtMoney, seoulDate } from '../lib/format'
import { Empty, ErrorText, Field, Icon, Modal, confirmDelete } from '../components/ui'

const CURRENCIES = ['KRW', 'JPY', 'USD', 'EUR', 'GBP', 'MXN', 'TWD', 'AUD']
const one = (x) => (Array.isArray(x) ? x[0] : x) || null

function ageOf(birth) {
  if (!birth) return null
  const [y, m, d] = birth.split('-').map(Number)
  const [ty, tm, td] = seoulDate().split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}

/** 해외선수 명단: 선수 한 명에 한 줄. 비용 조건(숙소·항공·개런티)은 비용 권한이 있는 직급에게만 보임 */
export default function Foreign() {
  const { t, lang } = useT()
  const { can } = useAuth()
  const canCost = can('foreign_cost')
  const [rows, setRows] = useState(null)
  const [missing, setMissing] = useState(false) // 09 SQL 미실행
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('name')
  const [modal, setModal] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('foreign_talents').select('*, foreign_talent_terms(*)').order('name')
    if (error) { setMissing(true); setRows([]); return }
    setRows((data || []).map((r) => ({ ...r, terms: one(r.foreign_talent_terms) })))
  }, [])
  useEffect(() => { load() }, [load])

  async function remove(r) {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('foreign_talents').delete().eq('id', r.id)
    if (error) return setError(error)
    load()
  }

  if (rows === null) return <div className="page"><div className="spinner" /></div>
  const shown = rows
    .filter((r) => !q || `${r.name} ${r.ring_name || ''} ${r.nationality || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'nationality' ? (a.nationality || '~').localeCompare(b.nationality || '~')
      : sort === 'recent' ? b.created_at.localeCompare(a.created_at)
        : (a.ring_name || a.name).localeCompare(b.ring_name || b.name))
  const yn = (v, yes, no) => <span className={`pill ${v ? 'att-present' : 'att-none'}`}>{v ? yes : no}</span>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.foreign')}</h1>
          <p className="muted"><Icon name="lock" size={14} /> {canCost ? t('ft.hint') : t('ft.hintNoCost')}</p>
        </div>
        {!missing && <button className="btn primary" onClick={() => setModal({})}><Icon name="plus" size={16} /> {t('ft.new')}</button>}
      </div>

      {missing ? <Empty>{t('admin.needSql', { f: '09_roster_auto_training.sql' })}</Empty> : <>
        <div className="toolbar">
          <input className="search" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{t('att.sortName')}</option>
            <option value="nationality">{t('ft.sortNat')}</option>
            <option value="recent">{t('ft.sortRecent')}</option>
          </select>
          <span className="muted small">{t('ft.count', { n: shown.length })}</span>
        </div>
        <ErrorText error={error} />

        {shown.length === 0 ? <Empty>{t('ft.empty')}</Empty> : (
          <div className="card table-wrap">
            <table className="table roster-table">
              <thead>
                <tr>
                  <th>{t('members.name')}</th><th>{t('ft.nationality')}</th><th>{t('ft.birth')}</th>
                  {canCost && <><th>{t('ft.stay')}</th><th>{t('ft.flight')}</th><th className="num">{t('fv.guarantee')}</th></>}
                  <th>{t('fv.notes')}</th><th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const x = r.terms
                  const age = ageOf(r.birth_date)
                  return (
                    <tr key={r.id}>
                      <td>
                        <button className="link-btn strong" onClick={() => setModal(r)}>{r.ring_name || r.name}</button>
                        {r.ring_name && <div className="muted small">{r.name}</div>}
                        {r.contact && <div className="muted small">{r.contact}</div>}
                      </td>
                      <td>{r.nationality || '—'}</td>
                      <td className="nowrap">{r.birth_date || '—'}{age !== null && <span className="muted small"> ({t('ft.age', { n: age })})</span>}</td>
                      {canCost && <>
                        <td className="nowrap">
                          {!x ? '—' : <>{yn(x.stay_included, t('ft.included'), t('ft.notIncluded'))}{x.stay_included && <span className="muted small"> {x.dorm_ok ? t('ft.dormOk') : t('ft.dormNo')}</span>}</>}
                        </td>
                        <td>{!x ? '—' : yn(x.flight_included, t('ft.included'), t('ft.notIncluded'))}</td>
                        <td className="num nowrap">{x?.guarantee != null ? fmtMoney(x.guarantee, x.currency, lang) : '—'}</td>
                      </>}
                      <td className="small roster-note">{[canCost && x?.memo, r.notes].filter(Boolean).join(' · ') || ''}</td>
                      <td>
                        <span className="row-actions">
                          <button className="icon-btn" onClick={() => setModal(r)} aria-label={t('common.edit')}><Icon name="edit" size={16} /></button>
                          <button className="icon-btn danger" onClick={() => remove(r)} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {modal && <TalentForm talent={modal.id ? modal : null} canCost={canCost} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}

function TalentForm({ talent, canCost, onClose, onSaved }) {
  const { t } = useT()
  const { user } = useAuth()
  const x = talent?.terms || {}
  const [f, setF] = useState({
    name: talent?.name ?? '', ring_name: talent?.ring_name ?? '', nationality: talent?.nationality ?? '', birth_date: talent?.birth_date ?? '',
    contact: talent?.contact ?? '', notes: talent?.notes ?? '',
    stay_included: x.stay_included ?? false, dorm_ok: x.dorm_ok ?? false, flight_included: x.flight_included ?? false,
    guarantee: x.guarantee ?? '', currency: x.currency ?? 'KRW', memo: x.memo ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    const row = {
      name: f.name.trim(), ring_name: f.ring_name.trim() || null, nationality: f.nationality.trim() || null,
      birth_date: f.birth_date || null, contact: f.contact.trim() || null, notes: f.notes.trim() || null,
    }
    const res = talent
      ? await supabase.from('foreign_talents').update(row).eq('id', talent.id).select().single()
      : await supabase.from('foreign_talents').insert({ ...row, created_by: user.id }).select().single()
    if (res.error) { setBusy(false); return setError(res.error) }
    if (canCost) {
      const { error } = await supabase.from('foreign_talent_terms').upsert({
        talent_id: res.data.id, stay_included: f.stay_included, dorm_ok: f.stay_included && f.dorm_ok, flight_included: f.flight_included,
        guarantee: f.guarantee === '' ? null : Number(f.guarantee), currency: f.currency, memo: f.memo.trim() || null,
        updated_at: new Date().toISOString(),
      })
      if (error) { setBusy(false); return setError(error) }
    }
    setBusy(false)
    onSaved()
  }

  return (
    <Modal title={talent ? t('ft.edit') : t('ft.new')} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="row2">
          <Field label={t('ft.name')}><input required maxLength={80} value={f.name} onChange={set('name')} autoFocus /></Field>
          <Field label={t('name.ring')}><input value={f.ring_name} onChange={set('ring_name')} /></Field>
        </div>
        <div className="row2">
          <Field label={t('ft.nationality')}><input value={f.nationality} onChange={set('nationality')} /></Field>
          <Field label={t('ft.birth')}><input type="date" value={f.birth_date} max={seoulDate()} onChange={set('birth_date')} /></Field>
        </div>
        <Field label={t('fv.contact')}><input value={f.contact} onChange={set('contact')} /></Field>

        {canCost ? (
          <fieldset className="cost-box">
            <legend>{t('ft.terms')}</legend>
            <label className="check"><input type="checkbox" checked={f.stay_included} onChange={set('stay_included')} /> {t('ft.stayIncluded')}</label>
            {f.stay_included && (
              <label className="check indent"><input type="checkbox" checked={f.dorm_ok} onChange={set('dorm_ok')} /> {t('ft.dormOkLabel')}</label>
            )}
            <label className="check"><input type="checkbox" checked={f.flight_included} onChange={set('flight_included')} /> {t('ft.flightIncluded')}</label>
            <div className="row2">
              <Field label={t('fv.guarantee')}><input type="number" min="0" step="any" value={f.guarantee} onChange={set('guarantee')} /></Field>
              <Field label={t('fv.currency')}>
                <select value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
            </div>
            <Field label={t('ft.termsMemo')}><input value={f.memo} onChange={set('memo')} placeholder={t('ft.termsMemoPh')} /></Field>
          </fieldset>
        ) : <span className="field-hint">{t('fv.costHidden')}</span>}

        <Field label={t('fv.notes')}><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
