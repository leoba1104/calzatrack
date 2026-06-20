import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import type { VentaTipo, VentaEstado } from '@/types'

const TIPO_CONFIG: Record<VentaTipo, { label: string; className: string }> = {
  contado:  { label: 'Normal',   className: 'bg-green-100 text-green-700' },
  apartado: { label: 'Apartado', className: 'bg-blue-100 text-blue-700' },
  credito:  { label: 'Crédito',  className: 'bg-orange-100 text-orange-700' },
}
const ESTADO_CONFIG: Record<VentaEstado, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-700' },
  pagada:    { label: 'Pagada',    className: 'bg-green-100 text-green-700' },
  anulada:   { label: 'Anulada',  className: 'bg-red-100 text-red-600' },
}
const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE',
  transferencia: 'Transferencia', otro: 'Otro',
}

type VentaDetail = {
  id: string
  numero_venta: string
  fecha: string
  tipo: VentaTipo
  estado: VentaEstado
  subtotal: number
  descuento: number
  impuesto: number
  total: number
  notas: string | null
  contacto_nombre:   string | null
  contacto_apellido: string | null
  contacto_telefono: string | null
  cliente: { nombre: string; apellido: string | null } | null
  empleado: { nombre: string; apellido: string | null } | null
  items: {
    id: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    variante: {
      sku: string; talla: string | null; color: string | null
      producto: { nombre: string } | null
    } | null
  }[]
  pagos: {
    id: string; monto: number; tipo_pago: string; fecha: string; notas: string | null
  }[]
}

interface SaleDetailModalProps {
  ventaId: string | null
  isOpen: boolean
  onClose: () => void
}

export function SaleDetailModal({ ventaId, isOpen, onClose }: SaleDetailModalProps) {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const [confirmAnular, setConfirmAnular] = useState(false)

  useEffect(() => { setConfirmAnular(false) }, [ventaId])

  const { data: venta, isLoading } = useQuery({
    queryKey: ['venta-detail', ventaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, numero_venta, fecha, tipo, estado, subtotal, descuento, impuesto, total, notas,
          contacto_nombre, contacto_apellido, contacto_telefono,
          cliente:clientes(nombre, apellido),
          empleado:empleados(nombre, apellido),
          items:detalle_ventas(
            id, cantidad, precio_unitario, subtotal,
            variante:variantes_producto(sku, talla, color, producto:productos(nombre))
          ),
          pagos:pagos_venta(id, monto, tipo_pago, fecha, notas)
        `)
        .eq('id', ventaId!)
        .single()
      if (error) throw error
      return data as unknown as VentaDetail
    },
    enabled: !!ventaId && isOpen,
  })

  const anularMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ventas').update({ estado: 'anulada' }).eq('id', ventaId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      qc.invalidateQueries({ queryKey: ['venta-detail', ventaId] })
      toast.success('Venta anulada')
      onClose()
    },
    onError: () => toast.error('Error al anular la venta'),
  })

  const canAnular = isAdmin && venta?.tipo === 'contado' && venta?.estado === 'pagada'
  const totalPagado = venta?.pagos.reduce((s, p) => s + p.monto, 0) ?? 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={venta ? `Venta ${venta.numero_venta}` : 'Detalle de venta'}
      size="lg"
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
        </div>
      ) : !venta ? (
        <div className="p-6 text-center text-gray-400">No se encontró la venta</div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-y-auto">
          {/* Info header */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium', TIPO_CONFIG[venta.tipo].className)}>
                {TIPO_CONFIG[venta.tipo].label}
              </span>
              <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium', ESTADO_CONFIG[venta.estado].className)}>
                {ESTADO_CONFIG[venta.estado].label}
              </span>
              <span className="text-xs text-gray-400 ml-1">{formatDate(venta.fecha)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {venta.tipo === 'apartado' && (venta.contacto_nombre || venta.contacto_apellido) ? (
                <div className="col-span-2">
                  <span className="text-gray-500">Contacto: </span>
                  <span className="text-gray-800 font-medium">
                    {`${venta.contacto_apellido ?? ''} ${venta.contacto_nombre ?? ''}`.trim()}
                  </span>
                  {venta.contacto_telefono && (
                    <span className="text-gray-500 ml-2">{venta.contacto_telefono}</span>
                  )}
                </div>
              ) : (
                <div>
                  <span className="text-gray-500">Cliente: </span>
                  <span className="text-gray-800 font-medium">
                    {venta.cliente
                      ? `${venta.cliente.nombre} ${venta.cliente.apellido ?? ''}`.trim()
                      : 'Cliente general'}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Empleado: </span>
                <span className="text-gray-800">
                  {venta.empleado
                    ? `${venta.empleado.nombre} ${venta.empleado.apellido ?? ''}`.trim()
                    : '—'}
                </span>
              </div>
              {venta.notas && (
                <div className="col-span-2">
                  <span className="text-gray-500">Notas: </span>
                  <span className="text-gray-700">{venta.notas}</span>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Productos</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Producto</th>
                  <th className="text-center pb-2 font-medium w-12">Cant.</th>
                  <th className="text-right pb-2 font-medium">P. Unit.</th>
                  <th className="text-right pb-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {venta.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5">
                      <p className="font-medium text-gray-900">{item.variante?.producto?.nombre ?? '—'}</p>
                      <p className="text-xs text-gray-400">
                        {[
                          item.variante?.sku,
                          item.variante?.talla && `T${item.variante.talla}`,
                          item.variante?.color,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="py-2.5 text-center text-gray-700">{item.cantidad}</td>
                    <td className="py-2.5 text-right text-gray-600">{formatCRC(item.precio_unitario)}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">{formatCRC(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-5 py-3 space-y-1 text-sm bg-gray-50/60">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatCRC(venta.subtotal)}</span>
            </div>
            {venta.descuento > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Descuento</span>
                <span>−{formatCRC(venta.descuento)}</span>
              </div>
            )}
            {venta.impuesto > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Impuesto (IVA)</span>
                <span>{formatCRC(venta.impuesto)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>Total</span>
              <span className="text-brand-700">{formatCRC(venta.total)}</span>
            </div>
          </div>

          {/* Pagos */}
          {venta.pagos.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pagos recibidos</p>
              <div className="space-y-2">
                {venta.pagos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 shrink-0">
                        {METODO_LABELS[p.tipo_pago] ?? p.tipo_pago}
                      </span>
                      <span className="text-gray-400 text-xs shrink-0">{formatDate(p.fecha)}</span>
                      {p.notas && (
                        <span className="text-gray-400 text-xs truncate">{p.notas}</span>
                      )}
                    </div>
                    <span className="font-medium text-gray-900 shrink-0 ml-4">{formatCRC(p.monto)}</span>
                  </div>
                ))}
              </div>
              {venta.pagos.length > 1 && (
                <div className="flex justify-between text-sm font-semibold text-gray-700 mt-3 pt-2 border-t border-gray-100">
                  <span>Total cobrado</span>
                  <span>{formatCRC(totalPagado)}</span>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div>
              {canAnular && !confirmAnular && (
                <button
                  onClick={() => setConfirmAnular(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Anular venta
                </button>
              )}
              {canAnular && confirmAnular && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-red-600 font-medium">¿Confirmar anulación?</span>
                  <button
                    onClick={() => anularMutation.mutate()}
                    disabled={anularMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
                  >
                    {anularMutation.isPending ? 'Anulando...' : 'Sí, anular'}
                  </button>
                  <button
                    onClick={() => setConfirmAnular(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
