import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, ShoppingCart, XCircle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { VentaModal } from '@/components/ventas/VentaModal'
import type { Venta, VentaEstado } from '@/types'

type Preset = 'hoy' | 'semana' | 'mes' | 'año' | 'custom'

function isoDate(d: Date) { return format(d, 'yyyy-MM-dd') }

function presetRange(p: Preset): { from: string; to: string } | null {
  const now = new Date()
  if (p === 'hoy')   return { from: isoDate(startOfDay(now)),   to: isoDate(endOfDay(now)) }
  if (p === 'semana') return { from: isoDate(startOfWeek(now, { weekStartsOn: 1 })), to: isoDate(endOfWeek(now, { weekStartsOn: 1 })) }
  if (p === 'mes')   return { from: isoDate(startOfMonth(now)), to: isoDate(endOfMonth(now)) }
  if (p === 'año')   return { from: isoDate(startOfYear(now)),  to: isoDate(endOfYear(now)) }
  return null
}

const estadoConfig: Record<VentaEstado, { label: string; className: string }> = {
  borrador:  { label: 'Borrador',  className: 'bg-gray-100 text-gray-600' },
  apartado:  { label: 'Apartado',  className: 'bg-blue-100 text-blue-700' },
  credito:   { label: 'Crédito',   className: 'bg-orange-100 text-orange-700' },
  pagada:    { label: 'Pagada',    className: 'bg-green-100 text-green-700' },
  anulada:   { label: 'Anulada',   className: 'bg-red-100 text-red-600' },
}

const PAGE_SIZE = 20

export function VentasPage() {
  const { activeTienda, canManage, isAdmin } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [anulando, setAnulando]     = useState<Venta | null>(null)
  const [preset, setPreset]         = useState<Preset>('mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [page, setPage]             = useState(0)

  const dateRange = preset === 'custom'
    ? (customFrom || customTo ? { from: customFrom, to: customTo } : null)
    : presetRange(preset)

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0) }, [search, dateRange])

  const { data: ventas, isLoading } = useQuery({
    queryKey: ['ventas', activeTienda?.id, search, dateRange],
    queryFn: async () => {
      let query = supabase
        .from('ventas')
        .select(`
          id, numero_venta, fecha, estado, subtotal, impuesto, descuento, total, notas, created_at, updated_at,
          cliente:clientes(nombre, apellido),
          empleado:empleados(nombre, apellido)
        `)
        .order('fecha', { ascending: false })
        .limit(500)

      query = query.eq('tienda_id', activeTienda!.id)

      if (search) query = query.ilike('numero_venta', `%${search}%`)
      if (dateRange?.from) query = query.gte('fecha', dateRange.from)
      if (dateRange?.to)   query = query.lte('fecha', dateRange.to + 'T23:59:59')

      const { data } = await query
      return (data ?? []) as unknown as Venta[]
    },
    enabled: !!activeTienda,
  })

  const anularMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ventas')
        .update({ estado: 'anulada' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Venta anulada — stock restaurado')
      setAnulando(null)
    },
    onError: () => toast.error('Error al anular la venta'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ventas</h1>
          <p className="text-sm text-gray-500 mt-1">{activeTienda?.nombre}</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva venta
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-52 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N.° de venta..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Preset buttons */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 overflow-hidden text-sm shrink-0">
            {(['hoy', 'semana', 'mes', 'año'] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={cn(
                  'px-3 py-1.5 capitalize transition-colors',
                  preset === p ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {p === 'semana' ? 'Semana' : p === 'año' ? 'Año' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setPreset('custom')}
              className={cn(
                'px-3 py-1.5 flex items-center gap-1.5 transition-colors',
                preset === 'custom' ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Rango
            </button>
          </div>

          {/* Custom date inputs */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <span className="text-gray-400 text-xs">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          )}
        </div>

        {(() => {
          const all = ventas ?? []
          const active = all.filter(v => v.estado !== 'anulada')
          const totalGeneral = active.reduce((sum, v) => sum + v.total, 0)
          const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
          const paged = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
          const colSpan = canManage ? 7 : 6

          return (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-medium text-gray-600"># Venta</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Empleado</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                      {canManage && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {isLoading ? (
                      <tr><td colSpan={colSpan} className="text-center py-10 text-gray-400">Cargando...</td></tr>
                    ) : all.length === 0 ? (
                      <tr>
                        <td colSpan={colSpan} className="text-center py-12">
                          <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-gray-400">No se encontraron ventas</p>
                        </td>
                      </tr>
                    ) : (
                      paged.map((v) => {
                        const estado = v.estado as VentaEstado
                        const config = estadoConfig[estado]
                        const cliente = v.cliente as { nombre: string; apellido: string | null } | null
                        const empleado = v.empleado as { nombre: string; apellido: string | null } | null
                        return (
                          <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">{v.numero_venta}</td>
                            <td className="px-4 py-3 text-gray-700">
                              {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'Cliente general'}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {empleado ? `${empleado.nombre} ${empleado.apellido ?? ''}`.trim() : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{formatDate(v.fecha)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(v.total)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
                                {config.label}
                              </span>
                            </td>
                            {canManage && (
                              <td className="px-4 py-3">
                                {estado !== 'anulada' && isAdmin && (
                                  <button
                                    onClick={() => setAnulando(v)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Anular venta"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer: pagination + total */}
              {!isLoading && all.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between gap-4">
                  {/* Pagination */}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-1 text-sm text-gray-600">
                      Pág. <strong>{page + 1}</strong> de <strong>{totalPages}</strong>
                      <span className="text-gray-400 ml-2">({all.length} ventas)</span>
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Total */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{active.length} venta{active.length !== 1 ? 's' : ''} (excl. anuladas)</span>
                    <div className="h-4 w-px bg-gray-200" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</span>
                    <span className="text-base font-bold text-brand-700">{formatCRC(totalGeneral)}</span>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </div>

      <VentaModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

      {/* Confirm anular dialog */}
      {anulando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Anular venta</h3>
            <p className="text-sm text-gray-600 mb-2">
              ¿Desea anular la venta <strong>{anulando.numero_venta}</strong>?
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-6">
              El stock de los productos será restaurado automáticamente.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setAnulando(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => anularMutation.mutate(anulando.id)}
                disabled={anularMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {anularMutation.isPending ? 'Anulando...' : 'Anular venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
