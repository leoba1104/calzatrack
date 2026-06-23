import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ShoppingCart, Eye, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { PurchaseModal } from '@/components/purchases/PurchaseModal'
import { CompraDetailModal } from '@/components/purchases/CompraDetailModal'
import type { Compra } from '@/types'

type EstadoBadge = { label: string; class: string }
const estadoBadge: Record<Compra['estado'], EstadoBadge> = {
  pendiente: { label: 'Pendiente', class: 'bg-amber-100 text-amber-700' },
  recibida:  { label: 'Recibida',  class: 'bg-green-100 text-green-700' },
  anulada:   { label: 'Anulada',   class: 'bg-red-100 text-red-600' },
}

export function PurchasesPage() {
  const { activeTienda, canManage } = useAuth()
  const qc = useQueryClient()

  const [modalOpen, setModalOpen]           = useState(false)
  const [detailCompra, setDetailCompra]     = useState<Compra | null>(null)
  const [confirmAnular, setConfirmAnular]   = useState<string | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null)

  const { data: compras, isLoading } = useQuery({
    queryKey: ['compras', activeTienda?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select(`
          *,
          proveedor:proveedores(id, nombre_empresa),
          items:detalle_compras(
            id, cantidad, costo_unitario, subtotal, descripcion,
            variante:variantes_producto(sku, talla, color),
            producto:productos(nombre)
          )
        `)
        .eq('tienda_id', activeTienda!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Compra[]
    },
    enabled: !!activeTienda,
  })

  const recibirCompra = useMutation({
    mutationFn: async (id: string) => {
      // The DB trigger manage_stock_on_compra handles stock increment automatically
      const { error } = await supabase.from('compras').update({ estado: 'recibida' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success('Compra marcada como recibida')
    },
    onError: () => toast.error('Error al recibir la compra'),
  })

  const anularCompra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compras').update({ estado: 'anulada' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success('Compra anulada')
      setConfirmAnular(null)
    },
    onError: () => toast.error('Error al anular la compra'),
  })

  const eliminarCompra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compras').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      toast.success('Compra eliminada')
      setConfirmEliminar(null)
    },
    onError: () => toast.error('Error al eliminar la compra'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm text-gray-500 mt-1">Facturas de proveedores</p>
        </div>
        {canManage && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva compra
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : !compras?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-10 h-10 bg-brand-50 rounded-2xl flex items-center justify-center mb-3">
              <ShoppingCart className="w-5 h-5 text-brand-600" />
            </div>
            <p className="text-sm font-medium text-gray-700">No hay compras registradas</p>
            {canManage && <p className="text-xs text-gray-400 mt-1">Registra la primera compra con el botón de arriba</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">N.° factura</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Artículos</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const badge     = estadoBadge[c.estado]
                const proveedor = c.proveedor as { nombre_empresa: string } | null
                const confirming         = confirmAnular === c.id
                const confirmingEliminar = confirmEliminar === c.id
                const itemCount  = c.items?.length ?? 0

                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-700">{formatDate(c.fecha)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {proveedor?.nombre_empresa ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {c.numero_factura_proveedor ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', badge.class)}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(c.total_pagado)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end min-w-[180px]">

                        {/* Detail view */}
                        <button
                          onClick={() => setDetailCompra(c)}
                          title="Ver detalle"
                          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {confirming ? (
                          <>
                            <span className="text-xs text-gray-500 ml-1 mr-1">¿Anular?</span>
                            <button onClick={() => anularCompra.mutate(c.id)} disabled={anularCompra.isPending} className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors">Sí</button>
                            <button onClick={() => setConfirmAnular(null)} className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">No</button>
                          </>
                        ) : confirmingEliminar ? (
                          <>
                            <span className="text-xs text-gray-500 ml-1 mr-1">¿Eliminar?</span>
                            <button onClick={() => eliminarCompra.mutate(c.id)} disabled={eliminarCompra.isPending} className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors">Sí</button>
                            <button onClick={() => setConfirmEliminar(null)} className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">No</button>
                          </>
                        ) : (
                          <>
                            {canManage && c.estado === 'pendiente' && (
                              <button
                                onClick={() => recibirCompra.mutate(c.id)}
                                disabled={recibirCompra.isPending}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-60 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Recibir
                              </button>
                            )}
                            {canManage && c.estado !== 'anulada' && (
                              <button
                                onClick={() => setConfirmAnular(c.id)}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-100 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Anular
                              </button>
                            )}
                            {canManage && (
                              <button
                                onClick={() => setConfirmEliminar(c.id)}
                                title="Eliminar compra"
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
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

      <PurchaseModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

      <CompraDetailModal
        compra={detailCompra}
        isOpen={!!detailCompra}
        onClose={() => setDetailCompra(null)}
      />
    </div>
  )
}
