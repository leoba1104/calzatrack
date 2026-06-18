import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, CreditCard, Trash2, AlertTriangle, ArchiveRestore } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { CreditoDetailModal } from '@/components/creditos/CreditoDetailModal'
import type { Venta } from '@/types'

type RichCliente = { nombre: string; apellido: string | null; moroso: boolean }

export function CreditosPage() {
  const { activeTienda, canManage } = useAuth()
  const qc = useQueryClient()

  const [detailVentaId, setDetailVentaId]     = useState<string | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null)

  const { data: creditos, isLoading } = useQuery({
    queryKey: ['creditos', activeTienda?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, numero_venta, fecha, estado, total, notas, archivado, created_at, updated_at,
          cliente:clientes(id, nombre, apellido, moroso),
          pagos:pagos_venta(monto, tipo_pago, fecha, notas, created_at),
          items:detalle_ventas(
            id, cantidad, precio_unitario, subtotal,
            variante:variantes_producto(sku, talla, color, producto:productos(nombre))
          )
        `)
        .eq('tienda_id', activeTienda!.id)
        .eq('estado', 'credito')
        .order('archivado', { ascending: true })   // active first
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Venta[]
    },
    enabled: !!activeTienda,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['creditos'] })
    qc.invalidateQueries({ queryKey: ['ventas'] })
    qc.invalidateQueries({ queryKey: ['pagos-ventas'] })
  }

  const archivarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ archivado: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Crédito archivado')
      setConfirmEliminar(null)
      setDetailVentaId(null)
    },
    onError: () => toast.error('Error al archivar el crédito'),
  })

  const desarchivarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ archivado: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Crédito desarchivado')
    },
    onError: () => toast.error('Error al desarchivar el crédito'),
  })

  const activos    = creditos?.filter(v => !(v as unknown as { archivado: boolean }).archivado) ?? []
  const archivados = creditos?.filter(v =>  (v as unknown as { archivado: boolean }).archivado) ?? []
  const isEmpty    = !creditos?.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Créditos</h1>
        <p className="text-sm text-gray-500 mt-1">Ventas a crédito — {activeTienda?.nombre}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-10 h-10 bg-orange-50 rounded-2xl flex items-center justify-center mb-3">
              <CreditCard className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-sm font-medium text-gray-700">No hay créditos</p>
            <p className="text-xs text-gray-400 mt-1">Los créditos se crean desde la sección de Ventas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3">N.° / Cliente</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="px-4 py-3 w-44">Progreso</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {/* Active credits */}
              {activos.map((v) => {
                const cliente      = v.cliente as unknown as RichCliente | null
                const pagos        = (v.pagos ?? []) as unknown as { monto: number }[]
                const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0)
                const saldo        = v.total - totalAbonado
                const porcentaje   = Math.min(100, Math.round((totalAbonado / v.total) * 100))
                const pagado       = saldo <= 0
                const confirming   = confirmEliminar === v.id

                return (
                  <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-brand-700">{v.numero_venta}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-sm text-gray-700">
                          {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : '—'}
                        </p>
                        {cliente?.moroso && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Moroso
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(v.fecha)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(v.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', pagado ? 'bg-green-500' : 'bg-orange-400')}
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
                          title="Ver detalle y registrar pago"
                          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canManage && (
                          confirming ? (
                            <>
                              <span className="text-xs text-gray-500 mx-1">¿Archivar?</span>
                              <button
                                onClick={() => archivarMutation.mutate(v.id)}
                                disabled={archivarMutation.isPending}
                                className="px-2 py-1 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-60"
                              >
                                Sí
                              </button>
                              <button
                                onClick={() => setConfirmEliminar(null)}
                                className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmEliminar(v.id)}
                              title="Archivar crédito"
                              className="p-1.5 text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
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

              {/* Divider when both sections have rows */}
              {activos.length > 0 && archivados.length > 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-2 bg-gray-50 border-y border-gray-100">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Archivados</span>
                  </td>
                </tr>
              )}

              {/* Archived credits — read-only */}
              {archivados.map((v) => {
                const cliente      = v.cliente as unknown as RichCliente | null
                const pagos        = (v.pagos ?? []) as unknown as { monto: number }[]
                const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0)
                const saldo        = v.total - totalAbonado
                const porcentaje   = Math.min(100, Math.round((totalAbonado / v.total) * 100))
                const pagado       = saldo <= 0

                return (
                  <tr key={v.id} className="border-b border-gray-100 opacity-50">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-gray-400">{v.numero_venta}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-sm text-gray-500">
                          {cliente ? `${cliente.nombre} ${cliente.apellido ?? ''}`.trim() : '—'}
                        </p>
                        <span className="inline-flex px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                          Archivado
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(v.fecha)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-400">{formatCRC(v.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', pagado ? 'bg-green-300' : 'bg-gray-300')}
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-300 w-8 text-right shrink-0">{porcentaje}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-sm">
                      {pagado ? '¡Pagado!' : formatCRC(saldo)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => desarchivarMutation.mutate(v.id)}
                          disabled={desarchivarMutation.isPending}
                          title="Desarchivar — vuelve a crédito activo"
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-brand-600 hover:bg-brand-50 border border-gray-200 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                          Desarchivar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <CreditoDetailModal
        venta={creditos?.find(v => v.id === detailVentaId) ?? null}
        isOpen={!!detailVentaId}
        onClose={() => setDetailVentaId(null)}
        onCompleted={() => setDetailVentaId(null)}
      />
    </div>
  )
}
