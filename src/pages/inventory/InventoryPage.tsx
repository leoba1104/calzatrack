import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Package, Pencil, PowerOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'
import { ProductModal } from '@/components/inventory/ProductModal'
import type { Producto } from '@/types'

export function InventoryPage() {
  const { activeTienda } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)

  const { data: productos, isLoading } = useQuery({
    queryKey: ['productos', activeTienda?.id, search],
    queryFn: async () => {
      let query = supabase
        .from('productos')
        .select('*, categoria:categorias_producto(id, nombre)')
        .eq('tienda_id', activeTienda!.id)
        .order('nombre')

      if (search) query = query.or(`nombre.ilike.%${search}%,codigo.ilike.%${search}%,marca.ilike.%${search}%`)

      const { data } = await query
      return (data ?? []) as Producto[]
    },
    enabled: !!activeTienda,
  })

  const toggleActivoMutation = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('productos').update({ activo: !activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
    onError: () => toast.error('Error al actualizar el producto'),
  })

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(p: Producto) { setEditing(p); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(null) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">{activeTienda?.nombre}</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
          <Plus className="w-4 h-4" />
          Nuevo producto
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código o marca..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Marca</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Talla</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Costo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Precio venta</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Stock</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : productos?.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400">No se encontraron productos</p>
                  </td>
                </tr>
              ) : (
                productos?.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.nombre}</p>
                      {p.categoria && <p className="text-xs text-gray-400">{(p.categoria as { nombre: string }).nombre}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.codigo}</td>
                    <td className="px-4 py-3 text-gray-700">{p.marca}</td>
                    <td className="px-4 py-3 text-gray-600">{p.talla ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCRC(p.precio_costo)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCRC(p.precio_venta)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold',
                        p.stock <= p.stock_minimo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      )}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Editar">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActivoMutation.mutate({ id: p.id, activo: p.activo })}
                          className={cn('p-1.5 rounded-lg transition-colors', p.activo ? 'text-gray-400 hover:bg-red-50 hover:text-red-600' : 'text-gray-400 hover:bg-green-50 hover:text-green-600')}
                          title={p.activo ? 'Desactivar' : 'Activar'}
                        >
                          <PowerOff className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductModal isOpen={modalOpen} onClose={closeModal} producto={editing} />
    </div>
  )
}
