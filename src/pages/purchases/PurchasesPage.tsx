import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ShoppingCart, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import { PurchaseModal } from '@/components/purchases/PurchaseModal'
import type { Compra, DetalleCompra } from '@/types'

type EstadoBadge = { label: string; class: string }
const estadoBadge: Record<Compra['estado'], EstadoBadge> = {
  pendiente: { label: 'Pendiente',  class: 'bg-amber-100 text-amber-700' },
  recibida:  { label: 'Recibida',   class: 'bg-green-100 text-green-700' },
  anulada:   { label: 'Anulada',    class: 'bg-red-100 text-red-600' },
}

export function PurchasesPage() {
  const { activeTienda, canManage } = useAuth()
  const qc = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmAnular, setConfirmAnular] = useState<string | null>(null)

  const { data: compras, isLoading } = useQuery({
    queryKey: ['compras', activeTienda?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select(`
          *,
          proveedor:proveedores(id, nombre_empresa),
          items:detalle_compras(
            id, cantidad, costo_unitario, subtotal,
            variante:variantes_producto(sku, talla, color, producto:productos(nombre))
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
    mutationFn: async (compra: Compra) => {
      if (!activeTienda) throw new Error('Sin tienda activa')

      // Update estado
      const { error } = await supabase
        .from('compras')
        .update({ estado: 'recibida' })
        .eq('id', compra.id)
      if (error) throw error

      // Increment stock for each item
      const items = compra.items ?? []
      for (const item of items) {
        const { data: row } = await supabase
          .from('inventario_tienda')
          .select('id, stock')
          .eq('tienda_id', activeTienda.id)
          .eq('variante_id', item.variante_id)
          .maybeSingle()

        if (row) {
          await supabase
            .from('inventario_tienda')
            .update({ stock: row.stock + item.cantidad })
            .eq('id', row.id)
        } else {
          await supabase
            .from('inventario_tienda')
            .insert({ tienda_id: activeTienda.id, variante_id: item.variante_id, stock: item.cantidad })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success('Compra marcada como recibida — inventario actualizado')
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
      toast.success('Compra anulada')
      setConfirmAnular(null)
    },
    onError: () => toast.error('Error al anular la compra'),
  })

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm text-gray-500 mt-1">Facturas de proveedores — {activeTienda?.nombre}</p>
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
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">N.° factura</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const isOpen = expanded.has(c.id)
                const badge = estadoBadge[c.estado]
                const proveedor = c.proveedor as { nombre_empresa: string } | null
                const confirming = confirmAnular === c.id

                return (
                  <Fragment key={c.id}>
                    <tr
                      className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(c.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(c.fecha)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{proveedor?.nombre_empresa ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.numero_factura_proveedor ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', badge.class)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(c.total_pagado)}</td>
                      {canManage && (
                        <td className="px-4 py-3 min-w-[180px]" onClick={(e) => e.stopPropagation()}>
                          {confirming ? (
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-xs text-gray-500 mr-1">¿Anular?</span>
                              <button onClick={() => anularCompra.mutate(c.id)} disabled={anularCompra.isPending} className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors">Sí</button>
                              <button onClick={() => setConfirmAnular(null)} className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">No</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 justify-end">
                              {c.estado === 'pendiente' && (
                                <button
                                  onClick={() => recibirCompra.mutate(c)}
                                  disabled={recibirCompra.isPending}
                                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-60 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Recibir
                                </button>
                              )}
                              {c.estado !== 'anulada' && (
                                <button
                                  onClick={() => setConfirmAnular(c.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-100 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Anular
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>

                    {/* Expanded: line items */}
                    {isOpen && (
                      <tr className="border-b border-gray-50">
                        <td colSpan={canManage ? 7 : 6} className="px-4 py-3 bg-gray-50/30">
                          {c.notas && (
                            <p className="text-xs text-gray-500 mb-2 italic">"{c.notas}"</p>
                          )}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 border-b border-gray-100">
                                <th className="text-left py-1.5 font-medium pl-4">Producto</th>
                                <th className="text-center py-1.5 font-medium">Cantidad</th>
                                <th className="text-right py-1.5 font-medium">Costo unit.</th>
                                <th className="text-right py-1.5 font-medium pr-4">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(c.items ?? []).map((item) => {
                                const det = item as unknown as DetalleCompra & {
                                  variante: { sku: string; talla: string | null; color: string | null; producto: { nombre: string } | null } | null
                                }
                                const v = det.variante
                                return (
                                  <tr key={item.id} className="border-b border-gray-50 last:border-0">
                                    <td className="py-1.5 pl-4">
                                      <span className="font-medium text-gray-700">{v?.producto?.nombre ?? '—'}</span>
                                      <span className="ml-2 font-mono text-brand-600 bg-brand-50 px-1 rounded">{v?.sku}</span>
                                      {v?.talla && <span className="text-gray-400 ml-1">T.{v.talla}</span>}
                                      {v?.color && <span className="text-gray-400 ml-1">· {v.color}</span>}
                                    </td>
                                    <td className="py-1.5 text-center text-gray-600">{item.cantidad}</td>
                                    <td className="py-1.5 text-right text-gray-600">{formatCRC(item.costo_unitario)}</td>
                                    <td className="py-1.5 text-right font-semibold text-gray-800 pr-4">{formatCRC(item.subtotal)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <PurchaseModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
