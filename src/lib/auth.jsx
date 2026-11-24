import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)

export const ALL_PERMS = ['post', 'sessions', 'attendance', 'training_log', 'edit_all', 'members', 'settings', 'foreign', 'admin_drive']
export const BUILTIN_ROLE_KEYS = ['admin', 'trainer', 'player', 'staff']
// 07_roles.sql 을 아직 실행하지 않았을 때 쓰는 내장 직급
const BUILTIN_ROLES = [
  { key: 'admin', color: '#17171a', perms: ALL_PERMS, system: true },
  { key: 'trainer', color: '#e8590c', perms: ['post', 'sessions', 'attendance', 'training_log'] },
  { key: 'player', color: '#5c5f66', perms: ['post'], system: true },
  { key: 'staff', color: '#3b5bdb', perms: ['post'] },
]

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [profile, setProfile] = useState(null)
  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState(BUILTIN_ROLES)
  const [rolesManaged, setRolesManaged] = useState(false) // DB 직급 목록을 쓰는 중인지
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  const reloadRoles = useCallback(async () => {
    const { data, error } = await supabase.from('roles').select('*').order('position').order('created_at')
    if (error || !data?.length) { setRoles(BUILTIN_ROLES); setRolesManaged(false) } else { setRoles(data); setRolesManaged(true) }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) { setProfile(null); setMembers([]); setProfileReady(true); return }
    const { data: me } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(me ?? null)
    if (me?.status === 'approved') {
      const [{ data }] = await Promise.all([supabase.from('profiles').select('*').order('display_name'), reloadRoles()])
      setMembers(data ?? [])
    } else {
      setMembers([])
    }
    setProfileReady(true)
  }, [userId, reloadRoles])

  useEffect(() => { setProfileReady(false); refresh() }, [refresh])

  const value = useMemo(() => {
    const approved = profile?.status === 'approved'
    const byId = Object.fromEntries(members.map((m) => [m.id, m]))
    const roleBy = Object.fromEntries(roles.map((r) => [r.key, r]))
    const permsOf = (key) => (key === 'admin' ? ALL_PERMS : roleBy[key]?.perms || [])
    const mine = approved ? permsOf(profile.role) : []
    const can = (perm) => mine.includes(perm)
    return {
      session,
      user: session?.user ?? null,
      profile,
      members,
      loading: session === undefined || (Boolean(session) && !profileReady),
      approved,
      roles,
      rolesManaged,
      reloadRoles,
      roleInfo: (key) => roleBy[key],
      permsOf,
      can,
      refresh,
      nameOf: (id) => byId[id]?.display_name || '—',
      canEdit: (ownerId) => can('edit_all') || (approved && ownerId === userId),
      signOut: () => supabase.auth.signOut(),
    }
  }, [session, profile, members, roles, rolesManaged, reloadRoles, profileReady, refresh, userId])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
