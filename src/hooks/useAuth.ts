import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Profile } from '@/types'

export function useAuth() {
  const { user, session, profile, activeTienda, isLoading, setUser, setSession, setProfile, setActiveTienda, setLoading, reset } =
    useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }).catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        reset()
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*, tienda:tiendas(*)')
      .eq('id', userId)
      .maybeSingle()

    if (data) {
      setProfile(data as Profile)
      if (data.tienda && !activeTienda) {
        setActiveTienda(data.tienda as never)
      } else if (data.rol === 'admin') {
        const { data: tienda } = await supabase.from('tiendas').select('*').limit(1).maybeSingle()
        if (tienda && !activeTienda) setActiveTienda(tienda as never)
      }
    }
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    reset()
  }

  const rol = profile?.rol

  return {
    user,
    session,
    profile,
    activeTienda,
    isLoading,
    isAdmin:    rol === 'admin',
    isOwner:    rol === 'owner',
    isEmployee: rol === 'employee',
    canManage:  rol === 'admin' || rol === 'owner',
    signIn,
    signOut,
    setActiveTienda,
  }
}
