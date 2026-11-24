import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { useTypes } from '../lib/types'
import { ErrorText, Icon } from './ui'

/** 관리자용: 일정 종류 추가·이름/색 수정·출석 체크 여부·삭제 */
export default function TypeManager({ onDeleted }) {
  const { t } = useT()
  const { types, label, reload } = useTypes()
  const [n, setN] = useState({ name: '', color: '#1c7ed6', attendance: false })
  const [error, setError] = useState(null)

  async function patch(ty, p) {
    setError(null)
    const { error } = await supabase.from('event_types').update(p).eq('key', ty.key)
    if (error) return setError(error)
    reload()
  }
  async function add() {
    const name = n.name.trim()
    if (!name) return
    setError(null)
    const key = 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    const { error } = await supabase.from('event_types').insert({ key, name, color: n.color, attendance: n.attendance, position: types.length + 1 })
    if (error) return setError(error)
    setN({ name: '', color: '#1c7ed6', attendance: false })
    reload()
  }
  async function remove(ty) {
    setError(null)
    const { error } = await supabase.from('event_types').delete().eq('key', ty.key)
    if (error) return setError(/foreign key/i.test(error.message) ? t('types.inUse') : error)
    onDeleted?.(ty.key)
    reload()
  }

  return (
    <div className="loc-manage">
      <div className="type-row head"><span /><span>{t('types.name')}</span><span>{t('types.attendance')}</span><span /></div>
      {types.map((ty) => (
        <div className="type-row" key={ty.key}>
          <input type="color" defaultValue={ty.color} aria-label="color" onBlur={(e) => e.target.value !== ty.color && patch(ty, { color: e.target.value })} />
          <input defaultValue={label(ty.key)} maxLength={30} aria-label={t('types.name')}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== label(ty.key)) patch(ty, { name: v }) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
          <input type="checkbox" checked={ty.attendance} disabled={ty.system} aria-label={t('types.attendance')}
            onChange={(e) => patch(ty, { attendance: e.target.checked })} />
          {ty.system
            ? <span className="muted small">{t('types.system')}</span>
            : <button type="button" className="icon-btn danger" onClick={() => remove(ty)} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>}
        </div>
      ))}
      <div className="type-row">
        <input type="color" value={n.color} aria-label="color" onChange={(e) => setN({ ...n, color: e.target.value })} />
        <input value={n.name} maxLength={30} placeholder={t('types.newPh')} onChange={(e) => setN({ ...n, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <input type="checkbox" checked={n.attendance} aria-label={t('types.attendance')} onChange={(e) => setN({ ...n, attendance: e.target.checked })} />
        <button type="button" className="btn primary small" onClick={add}>{t('common.add')}</button>
      </div>
      <span className="field-hint">{t('types.hint')}</span>
      <ErrorText error={error} />
    </div>
  )
}
