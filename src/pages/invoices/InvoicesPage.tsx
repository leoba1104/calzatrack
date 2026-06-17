import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Factura, FacturaEstado } from '@/types'

const estadoBadge: Record<FacturaEstado, { label: string; classes: string }> = {
  pendiente: { label: 'Pendiente', classes: 'bg-amber-100 text-amber-700' },
  pagada:    { label: 'Pagada',    classes: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', classes: 'bg-gray-100 text-gray-500' },
  anulada:   { label: 'Anulada',   classes: 'bg-red-100 text-red-600' },
}

export function InvoicesPage() {
  const { activeTienda } = useAuth()
  const [search, setSearch] = useState('')

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturas', activeTienda?.id, search],
    queryFn: async () => {
      let query = supabase
        .from('facturas')
        .select('*, cliente:clientes(id, nombre, apellido)')
        .eq('tienda_id', activeTienda!.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (search) {
        query = query.or(`numero_factura.ilike.%${search}%`)
      }

      const { data } = await query
      return (data ?? []) as Factura[]
    },
    enabled: !!activeTienda,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-sm text-gray-500 mt-1">{activeTienda?.nombre}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
          <Plus className="w-4 h-4" />
          Nueva factura
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número de factura..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">N° Factura</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Método de pago</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400">Cargando...</td>
                </tr>
              ) : facturas?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400">No hay facturas registradas</p>
                  </td>
                </tr>
              ) : (
                facturas?.map((f) => {
                  const badge = estadoBadge[f.estado]
                  const clienteNombre = f.cliente
                    ? `${f.cliente.nombre} ${f.cliente.apellido ?? ''}`.trim()
                    : 'Cliente general'
                  return (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">{f.numero_factura}</td>
                      <td className="px-4 py-3 text-gray-800">{clienteNombre}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(f.fecha)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(f.total)}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{f.metodo_pago ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', badge.classes)}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
