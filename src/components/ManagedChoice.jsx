import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { ChoiceInput } from './inputs'
import { ErrorText, Icon } from './ui'

/**
 * 기본 목록에서 고르거나 직접 입력하는 칸. 기본 목록은 관리자가 이 자리에서 추가·이름 수정·삭제.
 * table: 'locations'(장소) 또는 'match_kinds'(경기 구분)
 */
export default function ManagedChoice({ table, fallback = [], value, onChange, recent = [], placeholder, allowEmpty = true }) {
  const { t } = useT()
  const { isAdmin } = useAuth()
  const [list, setList] = useState(null) // null = 불러오는 중
  const [managedByDb, setManagedByDb] = useState(false)
  const [manage, setManage] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order('position').order('created_at')
    // 목록 테이블이 아직 없으면 내장 목록 사용
    if (error) { setList(fallback.map((n) => ({ id: n, name: n }))); setManagedByDb(false) } else { setList(data); setManagedByDb(true) }
  }
  useEffect(() => { load() }, [table])

  const dup = (e) => e && /duplicate|unique/i.test(e.message)
  async function add(n) {
    const clean = n.trim()
    if (!clean) return
    setError(null)
    const { error } = await supabase.from(table).insert({ name: clean, position: (list?.length || 0) + 1 })
    if (error && !dup(error)) return setError(error)
    setName('')
    await load()
  }
  async function rename(item, n) {
    const clean = n.trim()
    if (!clean || clean === item.name) return
    setError(null)
    const { error } = await supabase.from(table).update({ name: clean }).eq('id', item.id)
    if (error) return setError(dup(error) ? t('list.dup') : error)
    if (value === item.name) onChange(clean)
    load()
  }
  async function remove(item) {
    setError(null)
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) return setError(error)
    if (value === item.name) onChange('')
    load()
  }

  if (!list) return <div className="muted small">…</div>
  const names = list.map((l) => l.name)
  const canAdmin = isAdmin && managedByDb
  const canSave = canAdmin && value.trim() && !names.includes(value.trim())

  return (
    <div className="choice">
      <ChoiceInput options={names} extra={recent} value={value} onChange={onChange} placeholder={placeholder} allowEmpty={allowEmpty} />
      {canSave && (
        <button type="button" className="link-btn small left" onClick={() => add(value)}>
          + {t('list.saveThis', { name: value.trim() })}
        </button>
      )}
      {canAdmin && (
        <button type="button" className="link-btn small left muted-link" onClick={() => setManage(!manage)}>
          {manage ? t('list.closeManage') : t('list.manage')}
        </button>
      )}
      {manage && (
        <div className="loc-manage">
          {list.map((l) => (
            <div className="opt-row" key={l.id}>
              <input defaultValue={l.name} maxLength={80} aria-label={t('common.edit')}
                onBlur={(e) => rename(l, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
              <button type="button" className="icon-btn danger" onClick={() => remove(l)} aria-label={t('common.delete')}><Icon name="trash" size={15} /></button>
            </div>
          ))}
          <div className="opt-row">
            <input value={name} maxLength={80} placeholder={t('list.newPh')} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(name) } }} />
            <button type="button" className="btn primary small" onClick={() => add(name)}>{t('common.add')}</button>
          </div>
          <span className="field-hint">{t('list.hint')}</span>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  )
}
