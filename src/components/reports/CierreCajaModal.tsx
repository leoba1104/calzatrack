import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Calculator, CheckCircle2 } from 'lucide-react'
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

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface EmpleadoTotal {
  nombre: string
  total: number
}

interface Preview {
  efectivo: number
  tarjeta: number
  sinpe: number
  transferencia: number
  otro: number
  total_contado: number
  total_apartados: number
  total_creditos: number
  total_dia: number
  pares_vendidos: number
  apartados_abiertos: number
  creditos_abiertos: number
  por_empleado: EmpleadoTotal[]
}

export function CierreCajaModal({ isOpen, onClose }: Props) {
  const { activeTienda, user } = useAuth()
  const qc = useQueryClient()

  const today    = format(new Date(), 'yyyy-MM-dd')
  const startISO = startOfDay(new Date()).toISOString()
  const endISO   = endOfDay(new Date()).toISOString()

  const [notas, setNotas]     = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)

  // Auto-calculate when modal opens
  useEffect(() => {
    if (isOpen && !preview) calcular()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  async function calcular() {
    if (!activeTienda) return
    setLoading(true)
    setPreview(null)
    try {
      // 1. All ventas for this tienda — map venta_id → tipo + empleado_id
      const { data: ventasRaw, error: eVentas } = await supabase
        .from('ventas')
        .select('id, tipo, estado, empleado_id')
        .eq('tienda_id', activeTienda.id)
      if (eVentas) throw eVentas

      const tiendaVentaIds  = (ventasRaw ?? []).map((v) => v.id)
      const ventaTipoMap    = Object.fromEntries((ventasRaw ?? []).map((v) => [v.id, v.tipo as VentaTipo]))
      const ventaEmpleadoMap = Object.fromEntries((ventasRaw ?? []).map((v) => [v.id, v.empleado_id as string | null]))

      // 2. Pagos received today for this tienda's ventas
      const { data: pagosRaw, error: ePagos } = await supabase
        .from('pagos_venta')
        .select('monto, tipo_pago, venta_id')
        .in('venta_id', tiendaVentaIds.length ? tiendaVentaIds : [''])
        .gte('fecha', startISO)
        .lte('fecha', endISO)
      if (ePagos) throw ePagos

      const pagos = (pagosRaw ?? []) as { monto: number; tipo_pago: MetodoPago; venta_id: string }[]

      // 3. Pares: contado ventas paid today
      const contadoPagadasHoy = (ventasRaw ?? [])
        .filter((v) => v.tipo === 'contado' && v.estado === 'pagada')
        .map((v) => v.id)
      const pagadosHoyIds = new Set(pagos.map((p) => p.venta_id))

      const { data: itemsRaw, error: eItems } = await supabase
        .from('detalle_ventas')
        .select('cantidad, venta_id')
        .in('venta_id', contadoPagadasHoy.length ? contadoPagadasHoy : [''])
      if (eItems) throw eItems

      const pares = (itemsRaw ?? [])
        .filter((i) => pagadosHoyIds.has(i.venta_id))
        .reduce((s, i) => s + i.cantidad, 0)

      // 4. Open positions snapshot
      const [{ count: aptCount }, { count: credCount }] = await Promise.all([
        supabase.from('ventas').select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id).eq('tipo', 'apartado').eq('estado', 'pendiente'),
        supabase.from('ventas').select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id).eq('tipo', 'credito').eq('estado', 'pendiente'),
      ])

      // 5. Employee names for those who appear in today's pagos
      const empleadoIds = [...new Set(
        pagos.map((p) => ventaEmpleadoMap[p.venta_id]).filter(Boolean)
      )] as string[]

      const empleadoNombreMap: Record<string, string> = {}
      if (empleadoIds.length) {
        const { data: emps } = await supabase
          .from('empleados')
          .select('id, nombre, apellido')
          .in('id', empleadoIds)
        for (const e of emps ?? []) {
          empleadoNombreMap[e.id] = `${e.nombre}${e.apellido ? ' ' + e.apellido : ''}`
        }
      }

      // Aggregate
      const result: Preview = {
        efectivo: 0, tarjeta: 0, sinpe: 0, transferencia: 0, otro: 0,
        total_contado: 0, total_apartados: 0, total_creditos: 0, total_dia: 0,
        pares_vendidos: pares,
        apartados_abiertos: aptCount ?? 0,
        creditos_abiertos:  credCount ?? 0,
        por_empleado: [],
      }

      const empleadoTotals: Record<string, number> = {}

      for (const pago of pagos) {
        const m = pago.tipo_pago
        if (m === 'efectivo')      result.efectivo      += pago.monto
        else if (m === 'tarjeta')       result.tarjeta       += pago.monto
        else if (m === 'sinpe')         result.sinpe         += pago.monto
        else if (m === 'transferencia') result.transferencia += pago.monto
        else                            result.otro          += pago.monto
        const t = ventaTipoMap[pago.venta_id]
        if (t === 'contado')  result.total_contado   += pago.monto
        if (t === 'apartado') result.total_apartados += pago.monto
        if (t === 'credito')  result.total_creditos  += pago.monto
        result.total_dia += pago.monto

        const empId = ventaEmpleadoMap[pago.venta_id]
        if (empId) {
          empleadoTotals[empId] = (empleadoTotals[empId] ?? 0) + pago.monto
        }
      }

      result.por_empleado = Object.entries(empleadoTotals)
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
      // Upsert: if a cierre already exists for today, replace it with the latest calculation
      const { error } = await supabase.from('cierres_caja').upsert({
        tienda_id:          activeTienda.id,
        fecha:              today,
        efectivo:           preview.efectivo,
        tarjeta:            preview.tarjeta,
        sinpe:              preview.sinpe,
        transferencia:      preview.transferencia,
        otro:               preview.otro,
        total_contado:      preview.total_contado,
        total_apartados:    preview.total_apartados,
        total_creditos:     preview.total_creditos,
        total_dia:          preview.total_dia,
        pares_vendidos:     preview.pares_vendidos,
        apartados_abiertos: preview.apartados_abiertos,
        creditos_abiertos:  preview.creditos_abiertos,
        notas:              notas.trim() || null,
        cerrado_por:        user.id,
      }, { onConflict: 'tienda_id,fecha' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cierres'] })
      toast.success('Cierre de caja guardado')
      handleClose()
    },
    onError: () => toast.error('Error al guardar el cierre'),
  })

  function handleClose() {
    setNotas('')
    setPreview(null)
    setLoading(false)
    onClose()
  }

  const fechaLabel = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cierre de caja">
      <div className="space-y-4 px-6 py-4">

        {/* Date badge */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Fecha</p>
          <p className="text-sm font-semibold text-gray-800 capitalize mt-0.5">{fechaLabel}</p>
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
              <p className="text-xs text-brand-600 font-medium uppercase tracking-wide mb-1">Total del día</p>
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
              </div>
              {preview.total_dia === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">Sin pagos registrados hoy</p>
              )}
            </div>

            {/* By sale type */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por tipo de venta</p>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {([
                  ['Contado',   preview.total_contado],
                  ['Apartados', preview.total_apartados],
                  ['Créditos',  preview.total_creditos],
                ] as [string, number][]).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-semibold text-gray-900">{formatCRC(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By employee */}
            {preview.por_empleado.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por empleado</p>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                  {preview.por_empleado.map(({ nombre, total }) => (
                    <div key={nombre} className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                      <span className="text-gray-600">{nombre}</span>
                      <span className="font-semibold text-gray-900">{formatCRC(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{preview.pares_vendidos}</p>
                <p className="text-xs text-gray-500 mt-0.5">Pares</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-orange-700">{preview.apartados_abiertos}</p>
                <p className="text-xs text-orange-500 mt-0.5">Apartados</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{preview.creditos_abiertos}</p>
                <p className="text-xs text-blue-500 mt-0.5">Créditos</p>
              </div>
            </div>

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
                onClick={calcular}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                <Calculator className="w-3.5 h-3.5" />
                Recalcular
              </button>
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
