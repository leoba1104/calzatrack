import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import type { Profile } from '@/types'

export function useEmployees() {
  const { activeTienda, isAdmin } = useAuth()

  return useQuery({
    queryKey: ['empleados', activeTienda?.id, isAdmin],
    queryFn: async () => {
      const query = supabase
        .from('profiles')
        .select('*, tienda:tiendas(id, nombre)')
        .order('nombre')

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Profile[]
    },
    enabled: !!activeTienda || isAdmin,
  })
}
