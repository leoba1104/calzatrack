import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { format, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { FormField } from '@/components/ui/FormField'
import { formatCRC } from '@/lib/utils'
import type { MetodoPago, VentaTipo } from '@/types'
import { useCategoriasContado, CIERRE_COLOR_MAP } from '@/hooks/useCategoriasContado'

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface EmpleadoTotal {
  nombre: string
  total: number
}

interface Preview {
  desde: string
  efectivo: number
  tarjeta: number
  sinpe: number
  transferencia: number
  otro: number
  total_contado: number
  total_apartados: number
  total_creditos: number
  total_dia: number
  categorias_totales: Record<string, number>
  breakdown_empleados: EmpleadoTotal[]
  pares_vendidos: number
  apartados_abiertos: number
  creditos_abiertos: number
}

export function CierreCajaModal({ isOpen, onClose }: Props) {
  const { activeTienda, user } = useAuth()
  const qc = useQueryClient()
  const { data: categoriasContado = [] } = useCategoriasContado()

  const today  = format(new Date(), 'yyyy-MM-dd')
  const endISO = endOfDay(new Date()).toISOString()

  const [notas, setNotas]     = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && !preview) calcular()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  async function calcular() {
    if (!activeTienda) return
    setLoading(true)
    setPreview(null)
    try {
      // 1. Find the last cierre for today → defines where this period starts
      const { data: lastCierre } = await supabase
        .from('cierres_caja')
        .select('created_at')
        .eq('tienda_id', activeTienda.id)
        .eq('fecha', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const desde = lastCierre?.created_at ?? startOfDay(new Date()).toISOString()

      // 2. All ventas for this tienda (include categoria_venta)
      const { data: ventasRaw, error: eVentas } = await supabase
        .from('ventas')
        .select('id, tipo, estado, empleado_id, categoria_venta')
        .eq('tienda_id', activeTienda.id)
      if (eVentas) throw eVentas

      const tiendaVentaIds      = (ventasRaw ?? []).map((v) => v.id)
      const ventaTipoMap        = Object.fromEntries((ventasRaw ?? []).map((v) => [v.id, v.tipo as VentaTipo]))
      const ventaCategoriaMap   = Object.fromEntries((ventasRaw ?? []).map((v) => [v.id, v.categoria_venta as string | null]))
      const ventaEmpleadoMap    = Object.fromEntries((ventasRaw ?? []).map((v) => [v.id, v.empleado_id as string | null]))

      // 3. Pagos since the last cierre (or start of day if first cierre)
      const { data: pagosRaw, error: ePagos } = await supabase
        .from('pagos_venta')
        .select('monto, tipo_pago, venta_id')
        .in('venta_id', tiendaVentaIds.length ? tiendaVentaIds : [''])
        .gt('fecha', desde)
        .lte('fecha', endISO)
      if (ePagos) throw ePagos

      const pagos = (pagosRaw ?? []) as { monto: number; tipo_pago: MetodoPago; venta_id: string }[]

      // 4. Pares: contado ventas paid in this period
      const contadoPagadas   = (ventasRaw ?? []).filter((v) => v.tipo === 'contado' && v.estado === 'pagada').map((v) => v.id)
      const pagadosEnPeriodo = new Set(pagos.map((p) => p.venta_id))

      const { data: itemsRaw, error: eItems } = await supabase
        .from('detalle_ventas')
        .select('cantidad, venta_id')
        .in('venta_id', contadoPagadas.length ? contadoPagadas : [''])
      if (eItems) throw eItems

      const pares = (itemsRaw ?? [])
        .filter((i) => pagadosEnPeriodo.has(i.venta_id))
        .reduce((s, i) => s + i.cantidad, 0)

      // 5. Open positions snapshot
      const [{ count: aptCount }, { count: credCount }] = await Promise.all([
        supabase.from('ventas').select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id).eq('tipo', 'apartado').eq('estado', 'pendiente'),
        supabase.from('ventas').select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id).eq('tipo', 'credito').eq('estado', 'pendiente'),
      ])

      // 6. Employee names
      const empleadoIds = [...new Set(pagos.map((p) => ventaEmpleadoMap[p.venta_id]).filter(Boolean))] as string[]
      const empleadoNombreMap: Record<string, string> = {}
      if (empleadoIds.length) {
        const { data: emps } = await supabase.from('empleados').select('id, nombre, apellido').in('id', empleadoIds)
        for (const e of emps ?? []) {
          empleadoNombreMap[e.id] = `${e.nombre}${e.apellido ? ' ' + e.apellido : ''}`
        }
      }

      // Aggregate
      const result: Preview = {
        desde,
        efectivo: 0, tarjeta: 0, sinpe: 0, transferencia: 0, otro: 0,
        total_contado: 0, total_apartados: 0, total_creditos: 0, total_dia: 0,
        categorias_totales: {},
        breakdown_empleados: [],
        pares_vendidos: pares,
        apartados_abiertos: aptCount ?? 0,
        creditos_abiertos:  credCount ?? 0,
      }

      const empleadoTotals: Record<string, number> = {}

      for (const pago of pagos) {
        const m = pago.tipo_pago
        if (m === 'efectivo')           result.efectivo      += pago.monto
        else if (m === 'tarjeta')       result.tarjeta       += pago.monto
        else if (m === 'sinpe')         result.sinpe         += pago.monto
        else if (m === 'transferencia') result.transferencia += pago.monto
        else                            result.otro          += pago.monto

        const t   = ventaTipoMap[pago.venta_id]
        const cat = ventaCategoriaMap[pago.venta_id]

        if (t === 'contado') {
          result.total_contado += pago.monto
          if (cat) {
            result.categorias_totales[cat] = (result.categorias_totales[cat] ?? 0) + pago.monto
          }
        }
        if (t === 'apartado') result.total_apartados += pago.monto
        if (t === 'credito')  result.total_creditos  += pago.monto
        result.total_dia += pago.monto

        const empId = ventaEmpleadoMap[pago.venta_id]
        if (empId) empleadoTotals[empId] = (empleadoTotals[empId] ?? 0) + pago.monto
      }

      result.breakdown_empleados = Object.entries(empleadoTotals)
        .map(([id, total]) => ({ nombre: empleadoNombreMap[id] ?? 'Sin asignar', total }))
        .sort((a, b) => b.total - a.total)

      setPreview(result)
    } catch {
      toast.error('Error al calcular el cierre')
    } finally {
      setLoading(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!preview || !activeTienda || !user) throw new Error('Datos incompletos')

      const hasta = new Date().toISOString()

      const { error } = await supabase.from('cierres_caja').insert({
        tienda_id:           activeTienda.id,
        fecha:               today,
        desde:               preview.desde,
        efectivo:            preview.efectivo,
        tarjeta:             preview.tarjeta,
        sinpe:               preview.sinpe,
        transferencia:       preview.transferencia,
        otro:                preview.otro,
        total_contado:       preview.total_contado,
        total_apartados:     preview.total_apartados,
        total_creditos:      preview.total_creditos,
        total_dia:           preview.total_dia,
        categorias_totales:  preview.categorias_totales,
        breakdown_empleados: preview.breakdown_empleados,
        pares_vendidos:      preview.pares_vendidos,
        apartados_abiertos:  preview.apartados_abiertos,
        creditos_abiertos:   preview.creditos_abiertos,
        notas:               notas.trim() || null,
        cerrado_por:         user.id,
      })
      if (error) throw error

      // Cleanup: delete all ventas the cierre has captured.
      // - contado: scoped by creation date (ephemeral, deleted every cierre)
      // - apartado/crédito pagados: delete regardless of creation date since
      //   their payments are now persisted in the cierre totals
      // CASCADE removes detalle_ventas and pagos_venta automatically.
      const { error: cleanupContado } = await supabase
        .from('ventas')
        .delete()
        .eq('tienda_id', activeTienda.id)
        .eq('tipo', 'contado')
        .gt('created_at', preview.desde)
        .lte('created_at', hasta)
      if (cleanupContado) throw cleanupContado

      const { error: cleanupPagadas } = await supabase
        .from('ventas')
        .delete()
        .eq('tienda_id', activeTienda.id)
        .eq('estado', 'pagada')
        .in('tipo', ['apartado', 'credito'])
      if (cleanupPagadas) throw cleanupPagadas
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cierres'] })
      qc.invalidateQueries({ queryKey: ['cierre-hoy'] })
      toast.success('Cierre de caja guardado')
      handleClose()
    },
    onError: (e: Error) => toast.error(e.message || 'Error al guardar el cierre'),
  })

  function handleClose() {
    setNotas('')
    setPreview(null)
    setLoading(false)
    onClose()
  }

  const fechaLabel = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  const esPrimerCierre = !preview || preview.desde === startOfDay(new Date()).toISOString()

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cierre de caja">
      <div className="space-y-4 px-6 py-4">

        {/* Date + period badge */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Fecha</p>
          <p className="text-sm font-semibold text-gray-800 capitalize mt-0.5">{fechaLabel}</p>
          {preview && !esPrimerCierre && (
            <p className="text-xs text-amber-600 mt-1">
              Solo ventas desde las {format(new Date(preview.desde), 'HH:mm')} (post cierre anterior)
            </p>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Calculando totales...
          </div>
        )}

        {preview && !loading && (
          <div className="space-y-4">

            {/* Total highlight */}
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 text-center">
              <p className="text-xs text-brand-600 font-medium uppercase tracking-wide mb-1">
                {esPrimerCierre ? 'Total del día' : 'Total post-cierre'}
              </p>
              <p className="text-3xl font-bold text-brand-700">{formatCRC(preview.total_dia)}</p>
            </div>

            {/* By payment method */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por método de pago</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['Efectivo',      preview.efectivo,      'bg-green-50  text-green-800'],
                  ['Tarjeta',       preview.tarjeta,       'bg-blue-50   text-blue-800'],
                  ['SINPE Móvil',   preview.sinpe,         'bg-purple-50 text-purple-800'],
                  ['Transferencia', preview.transferencia,  'bg-orange-50 text-orange-800'],
                  ['Otro',          preview.otro,           'bg-gray-50   text-gray-700'],
                ] as [string, number, string][]).filter(([, v]) => v > 0).map(([label, value, cls]) => (
                  <div key={label} className={`rounded-xl p-3 ${cls}`}>
                    <p className="text-xs font-medium opacity-70">{label}</p>
                    <p className="text-base font-bold mt-0.5">{formatCRC(value)}</p>
                  </div>
                ))}
                {preview.total_dia === 0 && (
                  <p className="col-span-2 text-sm text-gray-400 text-center py-2">Sin pagos en este período</p>
                )}
              </div>
            </div>

            {/* Contado breakdown by category */}
            {preview.total_contado > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Ventas normales — {formatCRC(preview.total_contado)}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {categoriasContado
                    .filter((cat) => (preview.categorias_totales[cat.slug] ?? 0) > 0)
                    .map((cat) => (
                      <div key={cat.slug} className={`rounded-xl p-3 ${CIERRE_COLOR_MAP[cat.color] ?? 'bg-gray-50 text-gray-700'}`}>
                        <p className="text-xs font-medium opacity-70">{cat.nombre}</p>
                        <p className="text-sm font-bold mt-0.5">{formatCRC(preview.categorias_totales[cat.slug])}</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Apartados + Créditos */}
            {(preview.total_apartados > 0 || preview.total_creditos > 0) && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Abonos recibidos</p>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  {preview.total_apartados > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                      <span className="text-gray-600">Apartados</span>
                      <span className="font-semibold text-gray-900">{formatCRC(preview.total_apartados)}</span>
                    </div>
                  )}
                  {preview.total_creditos > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                      <span className="text-gray-600">Créditos</span>
                      <span className="font-semibold text-gray-900">{formatCRC(preview.total_creditos)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* By employee */}
            {preview.breakdown_empleados.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por empleado</p>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  {preview.breakdown_empleados.map(({ nombre, total }) => (
                    <div key={nombre} className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                      <span className="text-gray-600">{nombre}</span>
                      <span className="font-semibold text-gray-900">{formatCRC(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <FormField label="Notas (opcional)">
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones del día, diferencias en caja..."
                rows={2}
              />
            </FormField>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {saveMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />}
                {saveMutation.isPending ? 'Guardando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
