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
import { Icon } from '../components/ui'

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
            : <SlotEditor slots={slots} minPeople={min} onChange={loadSlots} />}
        </div>
      )}
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
