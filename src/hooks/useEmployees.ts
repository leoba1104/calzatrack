import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Empleado } from '@/types'

export function useEmployees() {
  const { activeTienda, isAdmin } = useAuth()

  return useQuery({
    queryKey: ['empleados', activeTienda?.id],
    queryFn: async () => {
      const query = supabase
        .from('empleados')
        .select('*, tienda:tiendas(id, nombre, prefijo)')
        .order('nombre')

      if (!isAdmin && activeTienda) {
        query.eq('tienda_id', activeTienda.id)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Empleado[]
    },
  })
}

export function useToggleEmpleadoActivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('empleados').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      toast.success('Empleado actualizado')
    },
    onError: () => toast.error('Error al actualizar el empleado'),
  })
}
