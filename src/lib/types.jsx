import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useT } from './i18n'

// 05_types.sql 을 아직 실행하지 않았을 때 쓰는 내장 목록
const BUILTIN = [
  { key: 'training', color: '#e8590c', attendance: true, system: true },
  { key: 'match', color: '#d92b2b', attendance: true, system: true },
  { key: 'promo', color: '#6741d9' },
  { key: 'shoot', color: '#0b7285' },
  { key: 'education', color: '#2b8a3e' },
  { key: 'volunteer', color: '#c2255c' },
  { key: 'general', color: '#6b7280' },
  { key: 'visit', color: '#0c8599' },
]
const BUILTIN_KEYS = BUILTIN.map((b) => b.key)

const TypesCtx = createContext(null)

/** 일정 종류 목록 (관리자가 추가·수정). 이름을 따로 정하지 않은 기본 종류는 언어별 번역 이름으로 표시 */
export function TypesProvider({ children }) {
  const { t } = useT()
  const [types, setTypes] = useState(null)
  const [managed, setManaged] = useState(false) // DB 목록을 쓰는 중인지

  const reload = useCallback(async () => {
    // 빠진 주말 훈련을 일정에 채워 넣음 (09 SQL 실행 전이면 조용히 건너뜀)
    try { await supabase.rpc('ensure_weekly_trainings') } catch { /* 무시 */ }
    // 훈련 당일: 온다고 투표한 사람을 출석 '참여'로 미리 넣어 둠 (12 SQL 실행 전이면 건너뜀)
    try { await supabase.rpc('apply_vote_attendance') } catch { /* 무시 */ }
    const { data, error } = await supabase.from('event_types').select('*').order('position').order('created_at')
    if (error || !data?.length) { setTypes(BUILTIN); setManaged(false) } else { setTypes(data); setManaged(true) }
  }, [])
  useEffect(() => { reload() }, [reload])

  const value = useMemo(() => {
    const list = types || BUILTIN
    const by = Object.fromEntries(list.map((x) => [x.key, x]))
    return {
      types: list,
      managed,
      reload,
      label: (key) => by[key]?.name || (BUILTIN_KEYS.includes(key) ? t(`etype.${key}`) : key),
      color: (key) => by[key]?.color || '#6b7280',
      hasAttendance: (key) => Boolean(by[key]?.attendance),
      attendanceKeys: list.filter((x) => x.attendance).map((x) => x.key),
    }
  }, [types, managed, reload, t])

  if (!types) return <div className="center-screen"><div className="spinner" /></div>
  return <TypesCtx.Provider value={value}>{children}</TypesCtx.Provider>
}

export const useTypes = () => useContext(TypesCtx)
