import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { DriveButtons, FileTable } from '../components/FileList'
import { Icon } from '../components/ui'

export default function Files() {
  const { t } = useT()
  const { can, rolesManaged } = useAuth()
  const hasAdminDrive = rolesManaged && can('admin_drive')
  const [tab, setTab] = useState('shared')
  const [files, setFiles] = useState([])
  const [q, setQ] = useState('')
  const admin = tab === 'admin'

  const load = useCallback(async () => {
    const { data } = await supabase.from('shared_files').select('*, events(id,title)').order('created_at', { ascending: false }).limit(500)
    setFiles(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const inTab = files.filter((f) => Boolean(f.admin_only) === admin)
  const shown = q ? inTab.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())) : inTab

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.files')}</h1>
          <p className="muted">{admin ? t('files.adminHint') : t('files.hint')}</p>
        </div>
      </div>
      {hasAdminDrive && (
        <div className="tabs">
          <button className={!admin ? 'on' : ''} onClick={() => setTab('shared')}>{t('files.tabShared')}</button>
          <button className={admin ? 'on' : ''} onClick={() => setTab('admin')}><Icon name="lock" size={14} /> {t('files.tabAdmin')}</button>
        </div>
      )}
      <div className="card">
        <DriveButtons key={tab} admin={admin} onAdded={load} />
      </div>
      <div className="toolbar">
        <input className="search" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card"><FileTable files={shown} onChange={load} /></div>
    </div>
  )
}
