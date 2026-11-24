import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ALL_PERMS, BUILTIN_ROLE_KEYS, useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { ErrorText, Icon } from './ui'

/** 직급 만들기 · 이름/색 수정 · 직급별 권한 체크 */
export default function RoleManager() {
  const { t } = useT()
  const { roles, rolesManaged, reloadRoles, members } = useAuth()
  const [n, setN] = useState({ name: '', color: '#0c8599' })
  const [error, setError] = useState(null)
  const label = (r) => r.name || (BUILTIN_ROLE_KEYS.includes(r.key) ? t(`role.${r.key}`) : r.key)
  const countOf = (key) => members.filter((m) => m.role === key && m.status === 'approved').length

  if (!rolesManaged) return <div className="empty">{t('admin.needSql', { f: '07_roles.sql' })}</div>

  async function patch(r, p) {
    setError(null)
    const { error } = await supabase.from('roles').update(p).eq('key', r.key)
    if (error) return setError(error)
    reloadRoles()
  }
  const toggle = (r, perm) => patch(r, { perms: r.perms.includes(perm) ? r.perms.filter((x) => x !== perm) : [...r.perms, perm] })
  async function add(e) {
    e.preventDefault()
    const name = n.name.trim()
    if (!name) return
    setError(null)
    const key = 'r' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    const { error } = await supabase.from('roles').insert({ key, name, color: n.color, perms: ['post'], position: roles.length + 1 })
    if (error) return setError(error)
    setN({ name: '', color: '#0c8599' })
    reloadRoles()
  }
  async function remove(r) {
    setError(null)
    const { error } = await supabase.from('roles').delete().eq('key', r.key)
    if (error) return setError(/foreign key/i.test(error.message) ? t('roles.inUse') : error)
    reloadRoles()
  }
  const giveAll = (r) => patch(r, { perms: ALL_PERMS })

  return (
    <div className="stack">
      <p className="muted small">{t('roles.hint')}</p>
      <ErrorText error={error} />
      <div className="grid-cards">
        {roles.map((r) => {
          const isAdminRole = r.key === 'admin'
          return (
            <div key={r.key} className="card role-card" style={{ borderTopColor: r.color }}>
              <div className="role-head">
                <input type="color" defaultValue={r.color} disabled={isAdminRole} aria-label="color"
                  onBlur={(e) => e.target.value !== r.color && patch(r, { color: e.target.value })} />
                <input defaultValue={label(r)} maxLength={30} disabled={isAdminRole} aria-label={t('types.name')}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== label(r)) patch(r, { name: v }) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
                {r.system
                  ? <span className="muted small">{t('types.system')}</span>
                  : <button className="icon-btn danger" onClick={() => remove(r)} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>}
              </div>
              <div className="meta">{t('roles.count', { n: countOf(r.key) })}{isAdminRole && ` · ${t('roles.adminNote')}`}</div>
              {'attendance' in r && (
                <label className="check role-att">
                  <input type="checkbox" checked={r.attendance} disabled={isAdminRole} onChange={(e) => patch(r, { attendance: e.target.checked })} />
                  <span><strong>{t('roles.attendance')}</strong><span className="muted small"> {t('roles.attendanceHint')}</span></span>
                </label>
              )}
              <div className="perm-list">
                {ALL_PERMS.map((p) => (
                  <label key={p} className="check">
                    <input type="checkbox" checked={isAdminRole || r.perms.includes(p)} disabled={isAdminRole} onChange={() => toggle(r, p)} />
                    {t(`perm.${p}`)}
                  </label>
                ))}
              </div>
              {!isAdminRole && r.perms.length < ALL_PERMS.length && (
                <button className="link-btn small left" onClick={() => giveAll(r)}>{t('roles.giveAll')}</button>
              )}
            </div>
          )
        })}
        <form className="card role-card new" onSubmit={add}>
          <h4>{t('roles.new')}</h4>
          <div className="role-head">
            <input type="color" value={n.color} aria-label="color" onChange={(e) => setN({ ...n, color: e.target.value })} />
            <input value={n.name} maxLength={30} placeholder={t('roles.newPh')} onChange={(e) => setN({ ...n, name: e.target.value })} />
          </div>
          <button className="btn primary"><Icon name="plus" size={16} /> {t('roles.create')}</button>
          <span className="field-hint">{t('roles.newHint')}</span>
        </form>
      </div>
    </div>
  )
}
