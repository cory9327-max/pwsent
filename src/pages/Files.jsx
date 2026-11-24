import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { DriveButtons, FileTable } from '../components/FileList'

export default function Files() {
  const { t } = useT()
  const [files, setFiles] = useState([])
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('shared_files').select('*, events(id,title)').order('created_at', { ascending: false }).limit(300)
    setFiles(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const shown = q ? files.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())) : files

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.files')}</h1>
          <p className="muted">{t('files.hint')}</p>
        </div>
      </div>
      <div className="card">
        <DriveButtons onAdded={load} />
      </div>
      <div className="toolbar">
        <input className="search" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card"><FileTable files={shown} onChange={load} /></div>
    </div>
  )
}
