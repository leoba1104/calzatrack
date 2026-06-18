import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Tag, Trash2 } from 'lucide-react'
import { addDays, differenceInDays } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { ApartadoDetailModal } from '@/components/apartados/ApartadoDetailModal'
import type { Venta } from '@/types'

function diasInfo(createdAt: string) {
  const limite = addDays(new Date(createdAt), 60)
  const dias   = differenceInDays(limite, new Date())
  return { dias, vencido: dias < 0 }
}

export function ApartadosPage() {
  const { activeTienda, canManage } = useAuth()
  const qc = useQueryClient()

  // Store only the ID so the modal always reflects the latest query data
  const [detailVentaId, setDetailVentaId] = useState<string | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null)

  const { data: apartados, isLoading } = useQuery({
    queryKey: ['apartados', activeTienda?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, numero_venta, fecha, estado, total, notas, created_at, updated_at,
          cliente:clientes(nombre, apellido),
          pagos:pagos_venta(monto, tipo_pago, fecha, notas, created_at),
          items:detalle_ventas(
            id, cantidad, precio_unitario, subtotal,
            variante:variantes_producto(sku, talla, color, producto:productos(nombre))
          )
        `)
        .eq('tienda_id', activeTienda!.id)
        .eq('estado', 'apartado')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Venta[]
    },
    enabled: !!activeTienda,
  })

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ estado: 'anulada' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apartados'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success('Apartado eliminado — stock restaurado')
      setConfirmEliminar(null)
      setDetailVentaId(null)
    },
    onError: () => toast.error('Error al eliminar el apartado'),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Apartados</h1>
        <p className="text-sm text-gray-500 mt-1">Reservas con abonos — {activeTienda?.nombre}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : !apartados?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-10 h-10 bg-brand-50 rounded-2xl flex items-center justify-center mb-3">
              <Tag className="w-5 h-5 text-brand-600" />
            </div>
            <p className="text-sm font-medium text-gray-700">No hay apartados activos</p>
            <p className="text-xs text-gray-400 mt-1">Los apartados se crean desde la sección de Ventas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">N.° / Cliente</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Plazo</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="px-4 py-3 w-44">Progreso</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {apartados.map((v) => {
                const cliente     = v.cliente as { nombre: string; apellido: string | null } | null
                const pagos       = (v.pagos ?? []) as unknown as { monto: number }[]
                const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0)
                const saldo       = v.total - totalAbonado
                const porcentaje  = Math.min(100, Math.round((totalAbonado / v.total) * 100))
                const { dias, vencido } = diasInfo(v.created_at)
                const pagado      = saldo <= 0
                const confirming  = confirmEliminar === v.id

                const diasClass = vencido
                  ? 'text-red-600 bg-red-50 border-red-100'
                  : dias <= 7
                  ? 'text-amber-700 bg-amber-50 border-amber-100'
                  : 'text-green-700 bg-green-50 border-green-100'

                return (
                  <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-brand-700">{v.numero_venta}</p>
                      <p className="text-sm text-gray-700 mt-0.5">
                        {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : 'Cliente general'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(v.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', diasClass)}>
                        {vencido ? `Vencido` : `${dias}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(v.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', pagado ? 'bg-green-500' : 'bg-brand-500')}
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right shrink-0">{porcentaje}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {pagado
                        ? <span className="text-xs font-semibold text-green-600">¡Pagado!</span>
                        : <span className="text-sm font-semibold text-gray-800">{formatCRC(saldo)}</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end min-w-[120px]">
                        <button
                          onClick={() => setDetailVentaId(v.id)}
                          title="Ver detalle y abonar"
                          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canManage && (
                          confirming ? (
                            <>
                              <span className="text-xs text-gray-500 mx-1">¿Eliminar?</span>
                              <button
                                onClick={() => eliminarMutation.mutate(v.id)}
                                disabled={eliminarMutation.isPending}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors"
                              >
                                Sí
                              </button>
                              <button
                                onClick={() => setConfirmEliminar(null)}
                                className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmEliminar(v.id)}
                              title="Eliminar apartado"
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ApartadoDetailModal
        venta={apartados?.find(v => v.id === detailVentaId) ?? null}
        isOpen={!!detailVentaId}
        onClose={() => setDetailVentaId(null)}
        onCompleted={() => setDetailVentaId(null)}
      />
    </div>
  )
}
