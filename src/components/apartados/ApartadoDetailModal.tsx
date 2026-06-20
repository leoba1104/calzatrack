import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, CheckCircle2, Loader2, Ban } from 'lucide-react'
import { addDays, differenceInDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import type { Venta, PagoVenta, DetalleVenta, MetodoPago } from '@/types'

type RichPago = PagoVenta & { empleado?: { nombre: string; apellido: string | null } | null }
type RichItem = DetalleVenta & {
  variante?: { sku: string; talla: string | null; color: string | null; producto: { nombre: string } } | null
}

function diasInfo(createdAt: string) {
  const limite = addDays(new Date(createdAt), 60)
  const dias   = differenceInDays(limite, new Date())
  return { limite, dias, vencido: dias < 0 }
}

const metodoPagoLabel: Record<MetodoPago, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  sinpe:         'SINPE Móvil',
  transferencia: 'Transferencia',
  otro:          'Otro',
}

interface ApartadoDetailModalProps {
  venta: Venta | null
  isOpen: boolean
  onClose: () => void
  onCompleted?: () => void
}

export function ApartadoDetailModal({ venta, isOpen, onClose, onCompleted }: ApartadoDetailModalProps) {
  const qc = useQueryClient()

  const [showAbono, setShowAbono]           = useState(false)
  const [monto, setMonto]                   = useState('')
  const [tipoPago, setTipoPago]             = useState<MetodoPago>('efectivo')
  const [fechaAbono, setFechaAbono]         = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notasAbono, setNotasAbono]         = useState('')
  const [showCancelar, setShowCancelar]     = useState(false)
  const [metodoCancelacion, setMetodoCancelacion] = useState<MetodoPago>('efectivo')

  // Live pagos query — updates immediately after any mutation without waiting for parent refetch
  const { data: pagosData = [] } = useQuery({
    queryKey: ['pagos-apartado', venta?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos_venta')
        .select('id, monto, tipo_pago, fecha, notas, created_at')
        .eq('venta_id', venta!.id)
      if (error) throw error
      // Sort client-side: newest first
      return [...(data as RichPago[])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    },
    enabled: !!venta?.id && isOpen,
  })

  // Derived values — safe to compute even when venta is null (guarded below)
  const pagos        = pagosData
  const items        = (venta?.items  ?? []) as unknown as RichItem[]
  const cliente      = (venta?.cliente ?? null) as { nombre: string; apellido: string | null } | null
  const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0)
  const saldo        = (venta?.total ?? 0) - totalAbonado
  const porcentaje   = venta ? Math.min(100, Math.round((totalAbonado / venta.total) * 100)) : 0
  const { limite, dias, vencido } = venta
    ? diasInfo(venta.created_at)
    : { limite: new Date(), dias: 60, vencido: false }
  const pagado = saldo <= 0

  // Hooks must all be called unconditionally before any early return
  const abonoMutation = useMutation({
    mutationFn: async () => {
      const montoNum = parseFloat(monto)
      if (!montoNum || montoNum <= 0) throw new Error('Monto inválido')
      if (montoNum > saldo + 0.01) throw new Error(`El monto no puede superar el saldo (${formatCRC(saldo)})`)
      // If the user picked today, use the exact current timestamp so the row
      // sorts at the top of VentasPage (which orders by pagos_venta.fecha DESC).
      // For past dates use local noon to avoid UTC-midnight timezone shift.
      const today    = format(new Date(), 'yyyy-MM-dd')
      const fechaISO = fechaAbono === today
        ? new Date().toISOString()
        : new Date(fechaAbono + 'T12:00:00').toISOString()

      const { error } = await supabase.from('pagos_venta').insert({
        venta_id:  venta!.id,
        monto:     montoNum,
        tipo_pago: tipoPago,
        fecha:     fechaISO,
        notas:     notasAbono || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos-apartado', venta?.id] })
      qc.invalidateQueries({ queryKey: ['apartados'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['pagos-ventas'] })
      toast.success('Abono registrado')
      setMonto('')
      setNotasAbono('')
      setFechaAbono(format(new Date(), 'yyyy-MM-dd'))
      setShowAbono(false)
    },
    onError: (e: Error) => toast.error(e.message || 'Error al registrar el abono'),
  })

  const completarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ventas').update({ estado: 'pagada' }).eq('id', venta!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos-apartado', venta?.id] })
      qc.invalidateQueries({ queryKey: ['apartados'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['pagos-ventas'] })
      toast.success('¡Apartado completado! — marcado como pagado')
      onCompleted?.()
      onClose()
    },
    onError: () => toast.error('Error al completar el apartado'),
  })

  const cancelarDeudaMutation = useMutation({
    mutationFn: async (metodoPago: MetodoPago) => {
      if (saldo > 0) {
        const { error: pagoError } = await supabase.from('pagos_venta').insert({
          venta_id:  venta!.id,
          monto:     saldo,
          tipo_pago: metodoPago,
          fecha:     new Date().toISOString(),
          notas:     'Cancelación de deuda',
        })
        if (pagoError) throw pagoError
      }
      const { error } = await supabase.from('ventas').update({ estado: 'pagada' }).eq('id', venta!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos-apartado', venta?.id] })
      qc.invalidateQueries({ queryKey: ['apartados'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['pagos-ventas'] })
      toast.success('Deuda cancelada — apartado cerrado')
      onCompleted?.()
      onClose()
    },
    onError: () => toast.error('Error al cancelar la deuda'),
  })

  // Early return AFTER all hooks
  if (!venta) return null

  const diasBadgeClass = vencido
    ? 'bg-red-100 text-red-700'
    : dias <= 7
    ? 'bg-amber-100 text-amber-700'
    : 'bg-green-100 text-green-700'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Apartado ${venta.numero_venta}`} size="xl">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 grid grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Cliente</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">
            {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'Cliente general'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Fecha límite</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-gray-700">{format(limite, "d 'de' MMMM yyyy", { locale: es })}</p>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', diasBadgeClass)}>
              {vencido ? `Vencido hace ${Math.abs(dias)}d` : `${dias}d restantes`}
            </span>
          </div>
        </div>

        {/* Progress */}
        <div className="col-span-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Abonado: <strong className="text-gray-800">{formatCRC(totalAbonado)}</strong></span>
            <span>Saldo: <strong className={cn(pagado ? 'text-green-700' : 'text-gray-800')}>
              {pagado ? '¡Pagado!' : formatCRC(saldo)}
            </strong></span>
            <span className="text-gray-400">{formatCRC(venta.total)} total</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', pagado ? 'bg-green-500' : 'bg-brand-500')}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <p className="text-right text-xs text-gray-400 mt-1">{porcentaje}%</p>
        </div>
      </div>

      {/* Products */}
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Productos reservados</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left pb-2 font-medium">Producto</th>
              <th className="text-center pb-2 font-medium w-16">Cant.</th>
              <th className="text-right pb-2 font-medium w-28">Precio</th>
              <th className="text-right pb-2 font-medium w-28">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((it) => {
              const v    = it.variante
              const name = v?.producto?.nombre ?? '—'
              const variant = [v?.talla && `T${v.talla}`, v?.color].filter(Boolean).join(' · ')
              return (
                <tr key={it.id}>
                  <td className="py-2 pr-4">
                    <p className="font-medium text-gray-800">{name}</p>
                    {variant && <p className="text-xs text-gray-400">{variant}</p>}
                    {v?.sku && <span className="font-mono text-xs text-brand-700 bg-brand-50 px-1 rounded">{v.sku}</span>}
                  </td>
                  <td className="py-2 text-center text-gray-600">{it.cantidad}</td>
                  <td className="py-2 text-right text-gray-600">{formatCRC(it.precio_unitario)}</td>
                  <td className="py-2 text-right font-semibold text-gray-800">{formatCRC(it.subtotal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Payment history + abono form */}
      <div className="px-6 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Historial de abonos</p>
        {pagos.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Sin abonos registrados aún</p>
        ) : (
          <div className="space-y-2">
            {pagos.map((p, i) => (
              <div key={p.id ?? i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{formatCRC(p.monto)}</p>
                  <p className="text-xs text-gray-400">
                    {metodoPagoLabel[p.tipo_pago as MetodoPago] ?? p.tipo_pago} · {formatDate(p.fecha)}
                    {p.notas && ` · ${p.notas}`}
                  </p>
                </div>
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add abono */}
        {!pagado && (
          <div className="mt-4">
            {showCancelar ? (
              <div className="mt-2 p-4 border border-amber-100 rounded-xl bg-amber-50/40 space-y-3">
                <p className="text-sm font-semibold text-gray-700">
                  Cancelar deuda — saldo: <span className="text-amber-700">{formatCRC(saldo)}</span>
                </p>
                <FormField label="Método de pago recibido">
                  <select
                    value={metodoCancelacion}
                    onChange={(e) => setMetodoCancelacion(e.target.value as MetodoPago)}
                    className={inputClass()}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="sinpe">SINPE Móvil</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="otro">Otro</option>
                  </select>
                </FormField>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowCancelar(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => cancelarDeudaMutation.mutate(metodoCancelacion)}
                    disabled={cancelarDeudaMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60"
                  >
                    {cancelarDeudaMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirmar y cerrar
                  </button>
                </div>
              </div>
            ) : !showAbono ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowAbono(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Registrar abono
                </button>
                <button
                  onClick={() => setShowCancelar(true)}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-600 transition-colors"
                  title="Condonar el saldo restante y cerrar el apartado"
                >
                  <Ban className="w-4 h-4" />
                  Cancelar deuda
                </button>
              </div>
            ) : (
              <div className="mt-2 p-4 border border-brand-100 rounded-xl bg-brand-50/40 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Nuevo abono — saldo: {formatCRC(saldo)}</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Monto" required>
                    <input
                      type="number"
                      min="1"
                      max={saldo}
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder={`Máx. ${formatCRC(saldo)}`}
                      className={inputClass()}
                    />
                  </FormField>
                  <FormField label="Método de pago">
                    <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value as MetodoPago)} className={inputClass()}>
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="sinpe">SINPE Móvil</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="otro">Otro</option>
                    </select>
                  </FormField>
                  <FormField label="Fecha">
                    <input type="date" value={fechaAbono} onChange={(e) => setFechaAbono(e.target.value)} className={inputClass()} />
                  </FormField>
                  <FormField label="Notas (opcional)">
                    <input value={notasAbono} onChange={(e) => setNotasAbono(e.target.value)} className={inputClass()} placeholder="Referencia, observación..." />
                  </FormField>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAbono(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={() => abonoMutation.mutate()}
                    disabled={abonoMutation.isPending || !monto}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
                  >
                    {abonoMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Guardar abono
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Complete button */}
        {pagado && (
          <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-xl flex items-center justify-between">
            <p className="text-sm text-green-700 font-medium">¡Saldo completado! Puedes marcar el apartado como pagado.</p>
            <button
              onClick={() => completarMutation.mutate()}
              disabled={completarMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors shrink-0 ml-4"
            >
              {completarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {completarMutation.isPending ? 'Completando...' : 'Completar apartado'}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
