import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ALL_PERMS, useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { fmtDate } from '../lib/format'
import { Empty, ErrorText, Icon, confirmDelete, useRoleLabel } from '../components/ui'


export default function Members({ embedded }) {
  const { t, lang } = useT()
  const { user, profile, refresh, roles, permsOf } = useAuth()
  const roleLabel = useRoleLabel()
  const mine = permsOf(profile.role)
  // 자신보다 권한이 많은 직급은 줄 수 없음 (서버에서도 막힘)
  const ROLES = roles.filter((r) => r.perms.every((p) => mine.includes(p)) || r.key === 'admin' && mine.length >= ALL_PERMS.length).map((r) => r.key)
  const [rows, setRows] = useState([])
  const [tab, setTab] = useState('pending')
  const [roleFor, setRoleFor] = useState({})
  const [editName, setEditName] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function update(id, patch) {
    setError(null)
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) setError(error)
    await load()
    refresh()
  }

  async function remove(m) {
    if (!confirmDelete(t)) return
    const { error } = await supabase.from('profiles').delete().eq('id', m.id)
    if (error) setError(error)
    load(); refresh()
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const list = tab === 'pending' ? pending
    : tab === 'rejected' ? rows.filter((r) => r.status === 'rejected')
      : rows.filter((r) => r.status === 'approved')
  const shown = q ? list.filter((r) => `${r.display_name} ${r.email}`.toLowerCase().includes(q.toLowerCase())) : list

  return (
    <div className={embedded ? 'stack' : 'page'}>
      <p className="muted small no-margin">{t('members.hint')}</p>
      <div className="tabs">
        <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>{t('members.pending')} {pending.length > 0 && <span className="nav-count">{pending.length}</span>}</button>
        <button className={tab === 'approved' ? 'on' : ''} onClick={() => setTab('approved')}>{t('members.approved')}</button>
        <button className={tab === 'rejected' ? 'on' : ''} onClick={() => setTab('rejected')}>{t('members.rejected')}</button>
      </div>
      <div className="toolbar"><input className="search" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <ErrorText error={error} />

      {shown.length === 0 ? <Empty>{tab === 'pending' ? t('members.noPending') : t('members.empty')}</Empty> : tab !== 'approved' ? (
        <div className="grid-cards">
          {shown.map((m) => (
            <div key={m.id} className="card member-card">
              <div className="member-top">
                <div className="avatar">{(m.display_name || '?').slice(0, 1)}</div>
                <div>
                  <strong>{m.display_name || <span className="muted">{t('members.noName')}</span>}</strong>
                  <div className="meta">{m.name_type ? t(`name.${m.name_type}`) : '—'} · {m.email}</div>
                  <div className="meta">{t('members.applied', { d: fmtDate(m.created_at, lang) })}</div>
                </div>
              </div>
              <div className="approve-row">
                <select value={roleFor[m.id] || 'player'} onChange={(e) => setRoleFor({ ...roleFor, [m.id]: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                <button className="btn primary" disabled={!m.display_name} onClick={() => update(m.id, { status: 'approved', role: roleFor[m.id] || 'player' })}>
                  {t('members.approve')}
                </button>
                {m.status === 'pending' && <button className="btn ghost" onClick={() => update(m.id, { status: 'rejected' })}>{t('members.reject')}</button>}
                {m.status === 'rejected' && <button className="icon-btn danger" onClick={() => remove(m)} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>}
              </div>
              <p className="muted small">{t('members.checkName')}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('members.name')}</th><th>{t('auth.email')}</th><th>{t('members.role')}</th><th>{t('members.track')}</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td>
                    {editName?.id === m.id ? (
                      <div className="inline-edit">
                        <input value={editName.display_name} maxLength={40} onChange={(e) => setEditName({ ...editName, display_name: e.target.value })} />
                        <select value={editName.name_type || 'real'} onChange={(e) => setEditName({ ...editName, name_type: e.target.value })}>
                          <option value="real">{t('name.real')}</option><option value="ring">{t('name.ring')}</option>
                        </select>
                        <button className="btn primary small" onClick={() => { update(m.id, { display_name: editName.display_name.trim(), name_type: editName.name_type }); setEditName(null) }}>{t('common.save')}</button>
                        <button className="btn ghost small" onClick={() => setEditName(null)}>{t('common.cancel')}</button>
                      </div>
                    ) : (
                      <button className="link-btn strong" onClick={() => setEditName(m)}>
                        {m.display_name} <span className="muted small">({m.name_type ? t(`name.${m.name_type}`) : '—'})</span>
                      </button>
                    )}
                  </td>
                  <td className="muted small">{m.email}</td>
                  <td>
                    <select value={m.role} disabled={!ROLES.includes(m.role)} onChange={(e) => update(m.id, { role: e.target.value })}>
                      {!ROLES.includes(m.role) && <option value={m.role}>{roleLabel(m.role)}</option>}
                      {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={m.track_attendance} onChange={(e) => update(m.id, { track_attendance: e.target.checked })} aria-label={t('members.track')} />
                  </td>
                  <td className="row-actions">
                    {m.id !== user.id && <>
                      <button className="btn ghost small" onClick={() => update(m.id, { status: 'rejected' })}>{t('members.suspend')}</button>
                      <button className="icon-btn danger" onClick={() => remove(m)} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
