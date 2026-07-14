import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Profile, Tienda } from '@/types'

// getSession() y onAuthStateChange se registran UNA sola vez a nivel de
// módulo: useAuth() se monta en guards, layout y páginas a la vez, y cada
// instancia duplicaba la suscripción y el fetch del perfil. La suscripción
// vive toda la sesión de la pestaña, por eso no se des-suscribe.
let _initialized = false

async function fetchProfile(userId: string) {
  const store = useAuthStore.getState()
  const { data } = await supabase
    .from('profiles')
    .select('*, tienda:tiendas(*)')
    .eq('id', userId)
    .maybeSingle()

  if (data) {
    store.setProfile(data as Profile)
    const activeTienda = useAuthStore.getState().activeTienda
    if (data.tienda && !activeTienda) {
      store.setActiveTienda(data.tienda as Tienda)
    } else if (data.rol === 'admin' && !activeTienda) {
      const { data: tienda } = await supabase.from('tiendas').select('*').limit(1).maybeSingle()
      if (tienda && !useAuthStore.getState().activeTienda) {
        store.setActiveTienda(tienda as Tienda)
      }
    }
  }
  store.setLoading(false)
}

function initAuth() {
  if (_initialized) return
  _initialized = true
  const store = useAuthStore.getState()

  supabase.auth.getSession().then(({ data: { session } }) => {
    store.setSession(session)
    store.setUser(session?.user ?? null)
    if (session?.user) {
      void fetchProfile(session.user.id)
    } else {
      store.setLoading(false)
    }
  }).catch(() => store.setLoading(false))

  supabase.auth.onAuthStateChange((_event, session) => {
    const s = useAuthStore.getState()
    s.setSession(session)
    s.setUser(session?.user ?? null)
    if (session?.user) {
      void fetchProfile(session.user.id)
    } else {
      s.reset()
      s.setLoading(false)
    }
  })
}

export function useAuth() {
  const { user, session, profile, activeTienda, isLoading, setActiveTienda, reset } = useAuthStore()

  useEffect(() => {
    initAuth()
  }, [])

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
