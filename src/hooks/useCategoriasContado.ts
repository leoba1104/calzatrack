import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CategoriaVentaContado } from '@/types'

export const BADGE_COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-700',
  pink:   'bg-pink-100 text-pink-700',
  green:  'bg-green-100 text-green-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
  red:    'bg-red-100 text-red-700',
  gray:   'bg-gray-100 text-gray-600',
  yellow: 'bg-yellow-100 text-yellow-700',
  teal:   'bg-teal-100 text-teal-700',
}

export const CIERRE_COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-800',
  pink:   'bg-pink-50 text-pink-800',
  green:  'bg-green-50 text-green-800',
  orange: 'bg-orange-50 text-orange-800',
  purple: 'bg-purple-50 text-purple-800',
  red:    'bg-red-50 text-red-800',
  gray:   'bg-gray-50 text-gray-700',
  yellow: 'bg-yellow-50 text-yellow-800',
  teal:   'bg-teal-50 text-teal-800',
}

export function useCategoriasContado() {
  return useQuery({
    queryKey: ['categorias-contado'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_venta_contado')
        .select('id, slug, nombre, color, orden')
        .eq('activo', true)
        .order('orden')
      if (error) throw error
      return (data ?? []) as CategoriaVentaContado[]
    },
    staleTime: 1000 * 60 * 60,
  })
}
