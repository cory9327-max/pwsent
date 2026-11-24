import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { driveConfigured, folderUrl, openDrivePicker } from '../lib/drive'
import { fmtBytes, fmtDate } from '../lib/format'
import { Empty, ErrorText, Icon, confirmDelete } from './ui'

export function DriveButtons({ eventId, onAdded }) {
  const { t, lang } = useT()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(0)

  async function pick() {
    setBusy(true); setError(null); setDone(0)
    try {
      const docs = await openDrivePicker(lang)
      if (docs.length) {
        const { error } = await supabase.from('shared_files').insert(docs.map((d) => ({
          name: d.name, drive_file_id: d.id, url: d.url, mime_type: d.mimeType, size_bytes: d.sizeBytes,
          event_id: eventId || null, uploaded_by: user.id,
        })))
        if (error) throw error
        setDone(docs.length)
        onAdded?.()
      }
    } catch (e) {
      setError(e)
    }
    setBusy(false)
  }

  return (
    <div className="drive-buttons">
      <button className="btn primary" disabled={busy || !driveConfigured} onClick={pick}>
        <Icon name="upload" size={16} /> {busy ? t('files.opening') : t('files.upload')}
      </button>
      {folderUrl && (
        <a className="btn ghost" href={folderUrl} target="_blank" rel="noreferrer"><Icon name="folder" size={16} /> {t('files.openFolder')}</a>
      )}
      {!driveConfigured && <span className="field-hint">{t('files.notConfigured')}</span>}
      {done > 0 && <span className="ok small">{t('files.added', { n: done })}</span>}
      <ErrorText error={error} />
    </div>
  )
}

export function FileTable({ files, onChange, showEvent = true }) {
  const { t, lang } = useT()
  const { canEdit, nameOf } = useAuth()
  const [error, setError] = useState(null)

  async function remove(f) {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('shared_files').delete().eq('id', f.id)
    if (error) setError(error)
    else onChange?.()
  }

  if (!files.length) return <Empty>{t('files.empty')}</Empty>
  return (
    <>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.id}>
            <a href={f.url} target="_blank" rel="noreferrer" className="file-name">
              <Icon name="folder" size={16} /> {f.name}
            </a>
            <span className="meta">
              {nameOf(f.uploaded_by)} · {fmtDate(f.created_at, lang)}
              {f.size_bytes ? ` · ${fmtBytes(f.size_bytes)}` : ''}
              {showEvent && f.events && <> · <Link to={`/events/${f.events.id}`}>{f.events.title}</Link></>}
            </span>
            {canEdit(f.uploaded_by) && (
              <button className="icon-btn danger" title={t('files.removeHint')} onClick={() => remove(f)} aria-label={t('common.delete')}>
                <Icon name="trash" size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
    </>
  )
}
