import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, CalendarDays, Banknote, CreditCard } from 'lucide-react'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { VentaModal } from '@/components/ventas/VentaModal'
import type { VentaEstado } from '@/types'

type Preset = 'hoy' | 'semana' | 'mes' | 'año' | 'custom'

function isoDate(d: Date) { return format(d, 'yyyy-MM-dd') }

function presetRange(p: Preset): { from: string; to: string } | null {
  const now = new Date()
  if (p === 'hoy')    return { from: isoDate(startOfDay(now)),  to: isoDate(endOfDay(now)) }
  if (p === 'semana') return { from: isoDate(startOfWeek(now, { weekStartsOn: 1 })), to: isoDate(endOfWeek(now, { weekStartsOn: 1 })) }
  if (p === 'mes')    return { from: isoDate(startOfMonth(now)), to: isoDate(endOfMonth(now)) }
  if (p === 'año')    return { from: isoDate(startOfYear(now)),  to: isoDate(endOfYear(now)) }
  return null
}

const estadoConfig: Record<VentaEstado, { label: string; className: string }> = {
  borrador:  { label: 'Borrador',  className: 'bg-gray-100 text-gray-600' },
  apartado:  { label: 'Apartado',  className: 'bg-blue-100 text-blue-700' },
  credito:   { label: 'Crédito',   className: 'bg-orange-100 text-orange-700' },
  pagada:    { label: 'Pagada',    className: 'bg-green-100 text-green-700' },
  anulada:   { label: 'Anulada',   className: 'bg-red-100 text-red-600' },
}

const metodoPagoLabel: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  sinpe:         'SINPE',
  transferencia: 'Transferencia',
  otro:          'Otro',
}

interface PagoRow {
  id: string
  monto: number
  tipo_pago: string
  fecha: string
  notas: string | null
  created_at: string
  venta: {
    id: string
    numero_venta: string
    estado: VentaEstado
    tienda_id: string
    cliente: { nombre: string; apellido: string | null } | null
  } | null
  empleado: { nombre: string; apellido: string | null } | null
}

interface EmpleadoOption { id: string; nombre: string; apellido: string | null }

export function VentasPage() {
  const { activeTienda } = useAuth()
  useQueryClient()

  const [search, setSearch]         = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [preset, setPreset]         = useState<Preset>('mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [empleadoId, setEmpleadoId] = useState('')

  const dateRange = preset === 'custom'
    ? (customFrom || customTo ? { from: customFrom, to: customTo } : null)
    : presetRange(preset)

  const { data: empleados } = useQuery({
    queryKey: ['empleados-list', activeTienda?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('empleados')
        .select('id, nombre, apellido')
        .eq('tienda_id', activeTienda!.id)
        .eq('activo', true)
        .order('nombre')
      return (data ?? []) as EmpleadoOption[]
    },
    enabled: !!activeTienda,
  })

  const { data: pagos, isLoading } = useQuery({
    queryKey: ['pagos-ventas', activeTienda?.id, search, dateRange, empleadoId],
    queryFn: async () => {
      let query = supabase
        .from('pagos_venta')
        .select(`
          id, monto, tipo_pago, fecha, notas, created_at,
          venta:ventas!inner(
            id, numero_venta, estado, tienda_id,
            cliente:clientes(nombre, apellido)
          ),
          empleado:empleados(nombre, apellido)
        `)
        .eq('ventas.tienda_id', activeTienda!.id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000)

      if (search)          query = query.ilike('ventas.numero_venta', `%${search}%`)
      if (empleadoId)      query = query.eq('empleado_id', empleadoId)
      if (dateRange?.from) query = query.gte('fecha', dateRange.from)
      if (dateRange?.to)   query = query.lte('fecha', dateRange.to + 'T23:59:59')

      const { data, error } = await query
      if (error) throw error
      // Exclude pagos from anulada ventas — that money was returned
      return ((data ?? []) as unknown as PagoRow[]).filter(p => p.venta?.estado !== 'anulada')
    },
    enabled: !!activeTienda,
  })

  const all      = pagos ?? []
  const enCaja   = all.filter(p => p.tipo_pago === 'efectivo').reduce((s, p) => s + p.monto, 0)
  const enCuenta = all.filter(p => p.tipo_pago !== 'efectivo').reduce((s, p) => s + p.monto, 0)
  const total    = enCaja + enCuenta

  return (
    <div className="flex flex-col h-full pt-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
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

      {/* Card */}
      <div className="flex flex-col flex-1 min-h-0 bg-white rounded-xl border border-gray-200">

        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative w-44 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N.° de venta..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <select
            value={empleadoId}
            onChange={(e) => setEmpleadoId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 text-gray-600 shrink-0"
          >
            <option value="">Todos los empleados</option>
            {empleados?.map(e => (
              <option key={e.id} value={e.id}>{e.nombre} {e.apellido ?? ''}</option>
            ))}
          </select>

          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-sm shrink-0">
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

          {preset === 'custom' && (
            <div className="flex items-center gap-2 shrink-0">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500" />
              <span className="text-gray-400 text-xs">—</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600"># Venta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empleado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Monto</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Método</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : all.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <Banknote className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400">No hay pagos registrados en este período</p>
                  </td>
                </tr>
              ) : (
                all.map((p) => {
                  const cliente = p.venta?.cliente as { nombre: string; apellido: string | null } | null
                  const estadoVenta = p.venta?.estado as VentaEstado | undefined
                  const esCaja = p.tipo_pago === 'efectivo'
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(p.fecha)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">
                        {p.venta?.numero_venta ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'Cliente general'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {p.empleado ? `${p.empleado.nombre} ${p.empleado.apellido ?? ''}`.trim() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(p.monto)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                          esCaja ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        )}>
                          {esCaja
                            ? <Banknote className="w-3 h-3" />
                            : <CreditCard className="w-3 h-3" />
                          }
                          {metodoPagoLabel[p.tipo_pago] ?? p.tipo_pago}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {estadoVenta && (
                          <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', estadoConfig[estadoVenta].className)}>
                            {estadoConfig[estadoVenta].label}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-brand-50 flex items-center justify-between gap-6">
          <span className="text-xs text-gray-400 shrink-0">
            {all.length} pago{all.length !== 1 ? 's' : ''}
          </span>

          <div className="flex items-center gap-5 text-sm">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-gray-500 text-xs">Caja (efectivo)</span>
              <span className="font-semibold text-gray-800">{formatCRC(enCaja)}</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-gray-500 text-xs">Cuenta (tarjeta/SINPE/transf.)</span>
              <span className="font-semibold text-gray-800">{formatCRC(enCuenta)}</span>
            </div>
            <div className="h-4 w-px bg-gray-300" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total</span>
              <span className="text-lg font-bold text-brand-700">{formatCRC(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <VentaModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
