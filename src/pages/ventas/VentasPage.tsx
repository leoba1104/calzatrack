import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, CalendarDays, Banknote, CreditCard, XCircle, Smartphone, ArrowLeftRight } from 'lucide-react'
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  format,
} from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { VentaModal } from '@/components/ventas/VentaModal'
import type { VentaTipo, VentaEstado } from '@/types'

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

const tipoConfig: Record<VentaTipo, { label: string; className: string }> = {
  contado:  { label: 'Normal',    className: 'bg-green-100 text-green-700' },
  apartado: { label: 'Apartado',  className: 'bg-blue-100 text-blue-700' },
  credito:  { label: 'Crédito',   className: 'bg-orange-100 text-orange-700' },
}

const metodoPagoLabel: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  sinpe:         'SINPE',
  transferencia: 'Transfer.',
  otro:          'Otro',
}

function MetodoChip({ tipoPago }: { tipoPago: string }) {
  const Icon = tipoPago === 'efectivo' ? Banknote
    : tipoPago === 'tarjeta' ? CreditCard
    : tipoPago === 'sinpe' ? Smartphone
    : tipoPago === 'transferencia' ? ArrowLeftRight
    : null
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
      {Icon && <Icon className="w-3 h-3" />}
      {metodoPagoLabel[tipoPago] ?? tipoPago}
    </span>
  )
}

// One row per pagos_venta entry
type RawPago = {
  id: string
  monto: number
  tipo_pago: string
  fecha: string
  notas: string | null
  venta: {
    id: string
    numero_venta: string
    tipo: VentaTipo
    estado: VentaEstado
    total: number
    tienda_id: string
    empleado_id: string | null
    cliente: { nombre: string; apellido: string | null } | null
    empleado: { nombre: string; apellido: string | null } | null
  } | null
}

// Ventas with no pagos yet (apartado/credito)
type PendingVenta = {
  id: string
  numero_venta: string
  tipo: VentaTipo
  estado: VentaEstado
  fecha: string
  total: number
  empleado_id: string | null
  cliente: { nombre: string; apellido: string | null } | null
  empleado: { nombre: string; apellido: string | null } | null
  pagos: { id: string }[]
}

interface EmpleadoOption { id: string; nombre: string; apellido: string | null }

export function VentasPage() {
  const { activeTienda, isAdmin } = useAuth()
  const qc = useQueryClient()

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

  // Primary query: one row per payment (date-filtered)
  const { data: pagos, isLoading: pagosLoading } = useQuery({
    queryKey: ['ventas', activeTienda?.id, 'pagos', search, dateRange, empleadoId],
    queryFn: async () => {
      let q = supabase
        .from('pagos_venta')
        .select(`
          id, monto, tipo_pago, fecha, notas,
          venta:ventas!inner(
            id, numero_venta, tipo, estado, total, tienda_id, empleado_id,
            cliente:clientes(nombre, apellido),
            empleado:empleados(nombre, apellido)
          )
        `)
        .eq('ventas.tienda_id', activeTienda!.id)
        .order('fecha', { ascending: false })
        .limit(1000)

      if (dateRange?.from) q = q.gte('fecha', dateRange.from)
      if (dateRange?.to)   q = q.lte('fecha', dateRange.to + 'T23:59:59')

      const { data, error } = await q
      if (error) throw error

      let rows = (data ?? []) as unknown as RawPago[]
      // Exclude anuladas/borrador, apply client-side text/empleado filters
      rows = rows.filter(p => p.venta && p.venta.estado !== 'anulada')
      if (search)     rows = rows.filter(p =>
        p.venta?.numero_venta?.toLowerCase().includes(search.toLowerCase())
      )
      if (empleadoId) rows = rows.filter(p => p.venta?.empleado_id === empleadoId)
      return rows
    },
    enabled: !!activeTienda,
    staleTime: 0,
  })

  // Secondary query: apartados/créditos that have never received a payment
  const { data: pendingRaw, isLoading: pendingLoading } = useQuery({
    queryKey: ['ventas', activeTienda?.id, 'pending', search, empleadoId],
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select(`
          id, numero_venta, tipo, estado, fecha, total, empleado_id,
          cliente:clientes(nombre, apellido),
          empleado:empleados(nombre, apellido),
          pagos:pagos_venta(id)
        `)
        .eq('tienda_id', activeTienda!.id)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(200)

      if (search)     q = q.ilike('numero_venta', `%${search}%`)
      if (empleadoId) q = q.eq('empleado_id', empleadoId)

      const { data, error } = await q
      if (error) throw error
      const ventas = (data ?? []) as unknown as PendingVenta[]
      return ventas.filter(v => v.pagos.length === 0)
    },
    enabled: !!activeTienda,
    staleTime: 0,
  })

  // Mutation: anular a pagada venta (admin only, from venta id)
  const anularMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ estado: 'anulada' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Venta anulada')
    },
    onError: () => toast.error('Error al anular la venta'),
  })

  const pagoList    = pagos ?? []
  const pendingList = pendingRaw ?? []
  const isLoading   = pagosLoading || pendingLoading

  const enCaja   = pagoList.filter(p => p.tipo_pago === 'efectivo').reduce((s, p) => s + p.monto, 0)
  const enCuenta = pagoList.filter(p => p.tipo_pago !== 'efectivo').reduce((s, p) => s + p.monto, 0)
  const totalCobrado = enCaja + enCuenta

  const colSpan = isAdmin ? 8 : 7

  return (
    <div className="flex flex-col h-full pt-6">
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
                {p === 'semana' ? 'Semana' : p.charAt(0).toUpperCase() + p.slice(1)}
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
                <th className="text-left px-4 py-3 font-medium text-gray-600"># Venta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empleado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha pago</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Monto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Método</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Tipo</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={colSpan} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : pagoList.length === 0 && pendingList.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="text-center py-16">
                    <Banknote className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400">No se encontraron ventas</p>
                  </td>
                </tr>
              ) : (
                <>
                  {/* One row per payment */}
                  {pagoList.map((p) => {
                    const venta    = p.venta!
                    const config   = tipoConfig[venta.tipo]
                    const cliente  = venta.cliente
                    const empleado = venta.empleado
                    const esAbono  = venta.tipo !== 'contado'
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-semibold text-brand-700">{venta.numero_venta}</p>
                          {p.notas && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[120px]">{p.notas}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'Cliente general'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {empleado ? `${empleado.nombre} ${empleado.apellido ?? ''}`.trim() : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(p.fecha)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {formatCRC(p.monto)}
                          {esAbono && (
                            <p className="text-xs font-normal text-gray-400">de {formatCRC(venta.total)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <MetodoChip tipoPago={p.tipo_pago} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
                            {config.label}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            {venta.tipo === 'contado' && (
                              <button
                                onClick={() => anularMutation.mutate(venta.id)}
                                disabled={anularMutation.isPending}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                                title="Anular venta"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}

                  {/* Pending section: apartados/créditos with no payments yet */}
                  {pendingList.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={colSpan} className="px-4 py-2 bg-gray-50 border-y border-gray-100">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Sin pagos registrados
                          </span>
                        </td>
                      </tr>
                      {pendingList.map((v) => {
                        const config   = tipoConfig[v.tipo]
                        const cliente  = v.cliente
                        const empleado = v.empleado
                        return (
                          <tr key={v.id} className="hover:bg-gray-50 transition-colors opacity-60">
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs font-semibold text-gray-500">{v.numero_venta}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'Cliente general'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {empleado ? `${empleado.nombre} ${empleado.apellido ?? ''}`.trim() : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-400">{formatDate(v.fecha)}</td>
                            <td className="px-4 py-3 text-right text-gray-400 text-xs">
                              ₡0 de {formatCRC(v.total)}
                            </td>
                            <td className="px-4 py-3 text-gray-300 text-xs">—</td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
                                {config.label}
                              </span>
                            </td>
                            {isAdmin && <td className="px-4 py-3" />}
                          </tr>
                        )
                      })}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-brand-50 flex items-center justify-between gap-6">
          <span className="text-xs text-gray-400 shrink-0">
            {pagoList.length} pago{pagoList.length !== 1 ? 's' : ''}
            {pendingList.length > 0 && ` · ${pendingList.length} sin pago`}
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
              <span className="text-lg font-bold text-brand-700">{formatCRC(totalCobrado)}</span>
            </div>
          </div>
        </div>
      </div>

      <VentaModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
