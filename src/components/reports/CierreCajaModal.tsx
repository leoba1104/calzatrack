import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Calculator, CheckCircle2 } from 'lucide-react'
import { format, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { DatePicker } from '@/components/ui/DatePicker'
import { Textarea } from '@/components/ui/Textarea'
import { FormField } from '@/components/ui/FormField'
import { formatCRC } from '@/lib/utils'
import type { MetodoPago, VentaTipo } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
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
}

type PagoRow = {
  monto: number
  tipo_pago: MetodoPago
  venta: { tipo: VentaTipo } | null
}

type ItemRow = { cantidad: number }

export function CierreCajaModal({ isOpen, onClose }: Props) {
  const { activeTienda, user } = useAuth()
  const qc = useQueryClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [fecha, setFecha]       = useState(today)
  const [notas, setNotas]       = useState('')
  const [preview, setPreview]   = useState<Preview | null>(null)
  const [loading, setLoading]   = useState(false)

  async function calcular() {
    if (!activeTienda) return
    setLoading(true)
    setPreview(null)
    try {
      const fechaDate = new Date(fecha + 'T12:00:00')
      const startISO  = startOfDay(fechaDate).toISOString()
      const endISO    = endOfDay(fechaDate).toISOString()

      // 1. Get all ventas for this tienda (to filter pagos by venta_id)
      const { data: ventasRaw, error: eVentas } = await supabase
        .from('ventas')
        .select('id, tipo, estado')
        .eq('tienda_id', activeTienda.id)
      if (eVentas) throw eVentas
      const tiendaVentaIds = (ventasRaw ?? []).map((v) => v.id)
      const ventaTipoMap = Object.fromEntries(
        (ventasRaw ?? []).map((v) => [v.id, v.tipo as VentaTipo])
      )

      // 2. Get all pagos for today whose venta belongs to this tienda
      const { data: pagosRaw, error: ePagos } = await supabase
        .from('pagos_venta')
        .select('monto, tipo_pago, venta_id')
        .in('venta_id', tiendaVentaIds.length ? tiendaVentaIds : [''])
        .gte('fecha', startISO)
        .lte('fecha', endISO)
      if (ePagos) throw ePagos

      const pagos = (pagosRaw ?? []) as (Omit<PagoRow, 'venta'> & { venta_id: string })[]

      // 3. Pares from contado ventas made today (stock physically left the store)
      const contadoPagadas = (ventasRaw ?? [])
        .filter((v) => v.tipo === 'contado' && v.estado === 'pagada')
        .map((v) => v.id)

      const { data: itemsRaw, error: eItems } = await supabase
        .from('detalle_ventas')
        .select('cantidad, venta_id')
        .in('venta_id', contadoPagadas.length ? contadoPagadas : [''])
      if (eItems) throw eItems

      // Only count items for contado ventas that have a pago today
      const pagadosHoyIds = new Set(pagos.map((p) => p.venta_id))
      const pares = (itemsRaw ?? [] as (ItemRow & { venta_id: string })[])
        .filter((i) => pagadosHoyIds.has(i.venta_id))
        .reduce((s, i) => s + i.cantidad, 0)

      // 4. Count open apartados and créditos right now
      const [{ count: aptCount }, { count: credCount }] = await Promise.all([
        supabase.from('ventas').select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id).eq('tipo', 'apartado').eq('estado', 'pendiente'),
        supabase.from('ventas').select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id).eq('tipo', 'credito').eq('estado', 'pendiente'),
      ])

      // Aggregate
      const result: Preview = {
        efectivo: 0, tarjeta: 0, sinpe: 0, transferencia: 0, otro: 0,
        total_contado: 0, total_apartados: 0, total_creditos: 0, total_dia: 0,
        pares_vendidos: pares,
        apartados_abiertos: aptCount ?? 0,
        creditos_abiertos: credCount ?? 0,
      }

      for (const pago of pagos) {
        const monto     = pago.monto
        const metodo    = pago.tipo_pago as MetodoPago
        const ventaTipo = ventaTipoMap[pago.venta_id]

        result[metodo as keyof typeof result] = (result[metodo as keyof typeof result] as number) + monto
        if (ventaTipo === 'contado')  result.total_contado   += monto
        if (ventaTipo === 'apartado') result.total_apartados += monto
        if (ventaTipo === 'credito')  result.total_creditos  += monto
        result.total_dia += monto
      }

      setPreview(result)
    } catch (e) {
      toast.error('Error al calcular el cierre')
    } finally {
      setLoading(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!preview || !activeTienda || !user) throw new Error('Datos incompletos')
      const { error } = await supabase.from('cierres_caja').insert({
        tienda_id:          activeTienda.id,
        fecha,
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
      })
      if (error) {
        if (error.code === '23505') throw new Error('Ya existe un cierre para ese día')
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cierres'] })
      toast.success('Cierre de caja guardado')
      handleClose()
    },
    onError: (e: Error) => toast.error(e.message || 'Error al guardar el cierre'),
  })

  function handleClose() {
    setFecha(today)
    setNotas('')
    setPreview(null)
    setLoading(false)
    onClose()
  }

  const fechaLabel = format(new Date(fecha + 'T12:00:00'), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cierre de caja">
      <div className="space-y-5 px-6 py-4">

        {/* Date picker */}
        <FormField label="Fecha del cierre">
          <DatePicker value={fecha} onChange={(d) => { setFecha(d); setPreview(null) }} />
        </FormField>

        {/* Calculate button */}
        {!preview && (
          <button
            onClick={calcular}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {loading ? 'Calculando...' : 'Calcular totales del día'}
          </button>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 capitalize">{fechaLabel}</p>
              <button
                onClick={calcular}
                disabled={loading}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Recalcular
              </button>
            </div>

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
            </div>

            {/* By sale type */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por tipo de venta</p>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {([
                  ['Contado',    preview.total_contado],
                  ['Apartados',  preview.total_apartados],
                  ['Créditos',   preview.total_creditos],
                ] as [string, number][]).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-semibold text-gray-900">{formatCRC(value)}</span>
                  </div>
                ))}
              </div>
            </div>

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

            {/* Confirm */}
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {saveMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle2 className="w-4 h-4" />}
              {saveMutation.isPending ? 'Guardando...' : 'Confirmar cierre'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
