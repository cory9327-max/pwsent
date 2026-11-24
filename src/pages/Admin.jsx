import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { useTypes } from '../lib/types'
import { adminFolderUrl, folderUrl } from '../lib/drive'
import { LOCATIONS, MATCH_KINDS } from '../lib/presets'
import Members from './Members'
import RoleManager from '../components/RoleManager'
import ManagedChoice from '../components/ManagedChoice'
import TypeManager from '../components/TypeManager'
import { SlotEditor } from '../components/WeeklyTraining'
import { ErrorText, Icon } from '../components/ui'

/** 관리자 설정: 직급·권한 / 회원 / 기본 목록 / 드라이브 */
export default function Admin() {
  const { t } = useT()
  const { can } = useAuth()
  const tabs = [
    can('settings') && 'roles',
    can('members') && 'members',
    (can('settings') || can('sessions')) && 'lists',
    (can('settings') || can('admin_drive')) && 'drive',
  ].filter(Boolean)
  const [tab, setTab] = useState(tabs[0])
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!can('members')) return
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setPending(count || 0))
  }, [tab])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.admin')}</h1>
          <p className="muted">{t('admin.hint')}</p>
        </div>
      </div>
      <div className="tabs scroll">
        {tabs.map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(`admin.tab.${k}`)} {k === 'members' && pending > 0 && <span className="nav-count">{pending}</span>}
          </button>
        ))}
      </div>
      {tab === 'roles' && <RoleManager />}
      {tab === 'members' && <Members embedded />}
      {tab === 'lists' && <Lists />}
      {tab === 'drive' && <DriveInfo />}
    </div>
  )
}

function Lists() {
  const { t } = useT()
  const { can } = useAuth()
  const { managed } = useTypes()
  const [slots, setSlots] = useState(null)
  const [min, setMin] = useState(3)
  const loadSlots = async () => {
    const [s, m] = await Promise.all([
      supabase.from('training_slots').select('*').order('position').order('created_at'),
      supabase.from('training_settings').select('*').maybeSingle(),
    ])
    setSlots(s.error ? false : s.data || [])
    setMin(m.data?.min_people ?? 3)
  }
  useEffect(() => { loadSlots() }, [])

  return (
    <div className="grid-cards wide">
      {can('settings') && <>
        <div className="card stack">
          <h3>{t('admin.locations')}</h3>
          <ManagedChoice manageOnly table="locations" fallback={LOCATIONS} value="" onChange={() => {}} />
        </div>
        <div className="card stack">
          <h3>{t('admin.types')}</h3>
          {managed ? <TypeManager /> : <div className="empty">{t('admin.needSql', { f: '05_types.sql' })}</div>}
        </div>
        <div className="card stack">
          <h3>{t('event.matchKind')}</h3>
          <ManagedChoice manageOnly table="match_kinds" fallback={MATCH_KINDS} value="" onChange={() => {}} />
        </div>
      </>}
      {can('sessions') && (
        <div className="card stack">
          <h3>{t('admin.slots')}</h3>
          {slots === null ? <div className="spinner" /> : slots === false
            ? <div className="empty">{t('admin.needSql', { f: '06_weekly_training.sql' })}</div>
            : <><SlotEditor slots={slots} minPeople={min} onChange={loadSlots} /><AutoTraining /></>}
        </div>
      )}
    </div>
  )
}

/** 주말 훈련 자동 등록 설정 */
function AutoTraining() {
  const { t } = useT()
  const [s, setS] = useState(null)
  const [places, setPlaces] = useState(LOCATIONS)
  const [error, setError] = useState(null)
  const load = async () => {
    const { data } = await supabase.from('training_settings').select('*').maybeSingle()
    setS(data && 'auto_weeks' in data ? data : false)
  }
  useEffect(() => {
    load()
    supabase.from('locations').select('name').order('position').then(({ data }) => { if (data?.length) setPlaces(data.map((l) => l.name)) })
  }, [])
  if (s === null) return null
  if (s === false) return <div className="empty">{t('admin.needSql', { f: '09_roster_auto_training.sql' })}</div>

  async function patch(p) {
    setError(null)
    setS({ ...s, ...p })
    const { error } = await supabase.from('training_settings').update(p).eq('id', true)
    if (error) return setError(error)
    await supabase.rpc('ensure_weekly_trainings')
  }
  const Loc = ({ k, on }) => (
    <select value={s[k] || ''} disabled={!s[on]} onChange={(e) => patch({ [k]: e.target.value || null })}>
      <option value="">{t('wk.locNone')}</option>
      {places.map((p) => <option key={p}>{p}</option>)}
    </select>
  )
  return (
    <div className="loc-manage">
      <strong>{t('auto.title')}</strong>
      <label className="repeat-until">
        <span>{t('auto.weeks')}</span>
        <select value={s.auto_weeks} onChange={(e) => patch({ auto_weeks: Number(e.target.value) })}>
          <option value={0}>{t('auto.off')}</option>
          {[4, 8, 12].map((n) => <option key={n} value={n}>{t('wk.nWeeks', { n })}</option>)}
        </select>
      </label>
      <div className="wk-dayset">
        <label className="check"><input type="checkbox" checked={s.sat_on} onChange={(e) => patch({ sat_on: e.target.checked })} /> {t('auto.sat')}</label>
        <Loc k="sat_location" on="sat_on" />
        <label className="check"><input type="checkbox" checked={s.sun_on} onChange={(e) => patch({ sun_on: e.target.checked })} /> {t('auto.sun')}</label>
        <Loc k="sun_location" on="sun_on" />
      </div>
      <span className="field-hint">{t('auto.hint')}</span>
      <ErrorText error={error} />
    </div>
  )
}

function DriveInfo() {
  const { t } = useT()
  const row = (title, url, desc) => (
    <div className="card stack">
      <h3>{title}</h3>
      <p className="muted small no-margin">{desc}</p>
      {url
        ? <a className="btn ghost left" href={url} target="_blank" rel="noreferrer"><Icon name="folder" size={16} /> {t('files.openFolder')}</a>
        : <div className="error">{t('files.notConfigured')}</div>}
    </div>
  )
  return (
    <div className="grid-cards wide">
      {row(t('files.tabShared'), folderUrl, t('admin.driveShared'))}
      {row(t('files.tabAdmin'), adminFolderUrl, t('admin.driveAdmin'))}
    </div>
  )
}
