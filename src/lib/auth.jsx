import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [profile, setProfile] = useState(null)
  const [members, setMembers] = useState([])
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  const refresh = useCallback(async () => {
    if (!userId) { setProfile(null); setMembers([]); setProfileReady(true); return }
    const { data: me } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(me ?? null)
    if (me?.status === 'approved') {
      const { data } = await supabase.from('profiles').select('*').order('display_name')
      setMembers(data ?? [])
    } else {
      setMembers([])
    }
    setProfileReady(true)
  }, [userId])

  useEffect(() => { setProfileReady(false); refresh() }, [refresh])

  const value = useMemo(() => {
    const approved = profile?.status === 'approved'
    const isAdmin = approved && profile.role === 'admin'
    const isTrainer = approved && (profile.role === 'admin' || profile.role === 'trainer')
    const byId = Object.fromEntries(members.map((m) => [m.id, m]))
    return {
      session,
      user: session?.user ?? null,
      profile,
      members,
      loading: session === undefined || (Boolean(session) && !profileReady),
      approved,
      isAdmin,
      isTrainer,
      refresh,
      nameOf: (id) => byId[id]?.display_name || '—',
      canEdit: (ownerId) => isAdmin || (approved && ownerId === userId),
      signOut: () => supabase.auth.signOut(),
    }
  }, [session, profile, members, profileReady, refresh, userId])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
