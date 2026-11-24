import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { LOCATIONS } from '../lib/presets'
import { ChoiceInput } from './inputs'
import { ErrorText, Icon } from './ui'

/** 장소 선택: 기본 장소 목록(관리자가 관리) + 최근에 직접 입력한 장소 + 직접 입력 */
export default function LocationPicker({ value, onChange, recent = [] }) {
  const { t } = useT()
  const { isAdmin } = useAuth()
  const [list, setList] = useState(null) // null = 불러오는 중
  const [manage, setManage] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('locations').select('*').order('position').order('created_at')
    // 목록 테이블이 아직 없으면(04_locations.sql 미실행) 내장 목록 사용
    setList(error ? LOCATIONS.map((n) => ({ id: n, name: n, builtin: true })) : data)
  }
  useEffect(() => { load() }, [])

  async function add(n) {
    const clean = n.trim()
    if (!clean) return
    setError(null)
    const { error } = await supabase.from('locations').insert({ name: clean, position: (list?.length || 0) + 1 })
    if (error && !/duplicate|unique/i.test(error.message)) return setError(error)
    setName('')
    await load()
  }
  async function remove(loc) {
    setError(null)
    const { error } = await supabase.from('locations').delete().eq('id', loc.id)
    if (error) return setError(error)
    if (value === loc.name) onChange('')
    load()
  }

  if (!list) return <div className="muted small">…</div>
  const names = list.map((l) => l.name)
  const canSave = isAdmin && value.trim() && !names.includes(value.trim()) && !list.some((l) => l.builtin)

  return (
    <div className="choice">
      <ChoiceInput options={names} extra={recent} value={value} onChange={onChange} placeholder={t('event.locationPh')} />
      {canSave && (
        <button type="button" className="link-btn small left" onClick={() => add(value)}>
          + {t('loc.saveThis', { name: value.trim() })}
        </button>
      )}
      {isAdmin && !list.some((l) => l.builtin) && (
        <button type="button" className="link-btn small left muted-link" onClick={() => setManage(!manage)}>
          {manage ? t('loc.closeManage') : t('loc.manage')}
        </button>
      )}
      {manage && (
        <div className="loc-manage">
          <ul>
            {list.map((l) => (
              <li key={l.id}>
                <span>{l.name}</span>
                <button type="button" className="icon-btn danger" onClick={() => remove(l)} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
          <div className="opt-row">
            <input value={name} maxLength={80} placeholder={t('loc.newPh')} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(name) } }} />
            <button type="button" className="btn primary small" onClick={() => add(name)}>{t('common.add')}</button>
          </div>
          <span className="field-hint">{t('loc.hint')}</span>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  )
}
