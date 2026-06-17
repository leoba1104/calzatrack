import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { Cliente } from '@/types'

export function ClientsPage() {
  const [search, setSearch] = useState('')

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes', search],
    queryFn: async () => {
      let query = supabase
        .from('clientes')
        .select('*')
        .order('nombre')
        .limit(200)

      if (search) {
        query = query.or(`nombre.ilike.%${search}%,apellido.ilike.%${search}%,telefono.ilike.%${search}%`)
      }

      const { data } = await query
      return (data ?? []) as Cliente[]
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Directorio de clientes de ambas tiendas</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, apellido o teléfono..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Correo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Notas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-400">Cargando...</td>
                </tr>
              ) : clientes?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400">No se encontraron clientes</p>
                  </td>
                </tr>
              ) : (
                clientes?.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.nombre} {c.apellido ?? ''}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.telefono ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{c.notas ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
