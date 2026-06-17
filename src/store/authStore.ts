import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile, Tienda } from '@/types'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  activeTienda: Tienda | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setActiveTienda: (tienda: Tienda | null) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      profile: null,
      activeTienda: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setActiveTienda: (activeTienda) => set({ activeTienda }),
      setLoading: (isLoading) => set({ isLoading }),
      reset: () => set({ user: null, session: null, profile: null, activeTienda: null }),
    }),
    {
      name: 'calzatrack-auth',
      partialize: (state) => ({ activeTienda: state.activeTienda }),
    }
  )
)
