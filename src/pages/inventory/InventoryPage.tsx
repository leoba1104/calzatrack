import { useState, useMemo, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Package, Pencil, ChevronDown, ChevronRight, Trash2, X, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'
import { ProductModal } from '@/components/inventory/ProductModal'
import { VarianteModal } from '@/components/inventory/VarianteModal'
import { BulkImportModal } from '@/components/inventory/BulkImportModal'
import type { Producto, VarianteProducto } from '@/types'

interface VarianteConStock extends VarianteProducto {
  stock: number
}

interface ProductoConVariantes {
  id: string
  nombre: string
  descripcion: string | null
  activo: boolean
  precio_base: number
  categoria_id: string | null
  marca_id: string | null
  created_at: string
  updated_at: string
  marca: { id: string; nombre: string } | null
  categoria: { id: string; nombre: string } | null
  variantes: VarianteConStock[]
  totalStock: number
}

type ConfirmTarget = { type: 'producto'; id: string } | { type: 'variante'; id: string }
type StatusFilter = 'all' | 'active' | 'inactive'

export function InventoryPage() {
  const { activeTienda, canManage } = useAuth()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [productModal, setProductModal] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)
  const [varianteModal, setVarianteModal] = useState<{ productoId: string; productoNombre: string; variante: VarianteConStock | null } | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)

  const { data: inventario, isLoading } = useQuery({
    queryKey: ['inventario', activeTienda?.id],
    queryFn: async () => {
      const [productosRes, variantesRes, stockRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, descripcion, activo, precio_base, categoria_id, marca_id, created_at, updated_at, marca:marcas(id, nombre), categoria:categorias(id, nombre)')
          .order('nombre'),
        supabase
          .from('variantes_producto')
          .select('id, producto_id, sku, talla, color, precio, activo, created_at, updated_at')
          .order('talla'),
        supabase
          .from('inventario_tienda')
          .select('variante_id, stock')
          .eq('tienda_id', activeTienda!.id),
      ])

      const stockMap = new Map<string, number>(
        (stockRes.data ?? []).map((s) => [s.variante_id, s.stock])
      )

      const variantesByProducto = new Map<string, VarianteConStock[]>()
      for (const v of variantesRes.data ?? []) {
        const stock = stockMap.get(v.id) ?? 0
        const vConStock: VarianteConStock = { ...v, stock }
        if (!variantesByProducto.has(v.producto_id)) variantesByProducto.set(v.producto_id, [])
        variantesByProducto.get(v.producto_id)!.push(vConStock)
      }

      return (productosRes.data ?? []).map((p) => {
        const variantes = variantesByProducto.get(p.id) ?? []
        return {
          ...p,
          variantes,
          totalStock: variantes.reduce((sum, v) => sum + v.stock, 0),
        } as unknown as ProductoConVariantes
      })
    },
    enabled: !!activeTienda,
  })

  const { data: marcas } = useQuery({
    queryKey: ['marcas'],
    queryFn: async () => {
      const { data } = await supabase.from('marcas').select('id, nombre').order('nombre')
      return (data ?? []) as { id: string; nombre: string }[]
    },
  })

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: async () => {
      const { data } = await supabase.from('categorias').select('id, nombre').order('nombre')
      return (data ?? []) as { id: string; nombre: string }[]
    },
  })

  const deleteProducto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('productos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success('Producto eliminado')
      setConfirmTarget(null)
    },
    onError: () => toast.error('Error al eliminar el producto'),
  })

  const deleteVariante = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('variantes_producto').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success('Variante eliminada')
      setConfirmTarget(null)
    },
    onError: () => toast.error('Error al eliminar la variante'),
  })

  const hasFilters = !!brandFilter || !!categoryFilter || statusFilter !== 'all'

  function clearFilters() {
    setBrandFilter('')
    setCategoryFilter('')
    setStatusFilter('all')
    setSearch('')
  }

  const filtered = useMemo(() => {
    if (!inventario) return []
    return inventario.filter((p) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const marca = p.marca as { nombre: string } | null
        const matches =
          p.nombre.toLowerCase().includes(q) ||
          marca?.nombre.toLowerCase().includes(q) ||
          p.variantes.some((v) => v.sku.toLowerCase().includes(q))
        if (!matches) return false
      }
      if (brandFilter && p.marca_id !== brandFilter) return false
      if (categoryFilter && p.categoria_id !== categoryFilter) return false
      if (statusFilter === 'active' && !p.activo) return false
      if (statusFilter === 'inactive' && p.activo) return false
      return true
    })
  }, [inventario, search, brandFilter, categoryFilter, statusFilter])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openCreateProducto() { setEditingProducto(null); setProductModal(true) }
  function openEditProducto(p: ProductoConVariantes) { setEditingProducto(p as unknown as Producto); setProductModal(true) }
  function closeProductModal() { setProductModal(false); setEditingProducto(null) }

  function openCreateVariante(p: ProductoConVariantes) {
    setVarianteModal({ productoId: p.id, productoNombre: p.nombre, variante: null })
    if (!expanded.has(p.id)) toggleExpand(p.id)
  }

  function openEditVariante(p: ProductoConVariantes, v: VarianteConStock) {
    setVarianteModal({ productoId: p.id, productoNombre: p.nombre, variante: v })
  }

  function isConfirming(type: ConfirmTarget['type'], id: string) {
    return confirmTarget?.type === type && confirmTarget.id === id
  }

  const isPending = deleteProducto.isPending || deleteVariante.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">{activeTienda?.nombre}</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors bg-white"
            >
              <Upload className="w-4 h-4" />
              Importar CSV
            </button>
            <button
              onClick={openCreateProducto}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo producto
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Filters row */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          {/* Search — ancho fijo para no desplazar el resto */}
          <div className="relative w-56 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, marca o SKU..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Marca */}
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className={cn(
              'text-sm border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors',
              brandFilter ? 'border-brand-500 text-brand-700 font-medium' : 'border-gray-200 text-gray-600'
            )}
          >
            <option value="">Todas las marcas</option>
            {marcas?.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>

          {/* Categoría */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={cn(
              'text-sm border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white transition-colors',
              categoryFilter ? 'border-brand-500 text-brand-700 font-medium' : 'border-gray-200 text-gray-600'
            )}
          >
            <option value="">Todas las categorías</option>
            {categorias?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>

          {/* Estado toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((v) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  statusFilter === v
                    ? 'bg-brand-600 text-white font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {v === 'all' ? 'Todos' : v === 'active' ? 'Activos' : 'Inactivos'}
              </button>
            ))}
          </div>

          {/* Limpiar — siempre reserva su espacio para no mover el layout */}
          <button
            onClick={clearFilters}
            className={cn(
              'flex items-center gap-1.5 text-sm px-2 py-1.5 rounded-lg transition-colors shrink-0',
              (hasFilters || search)
                ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                : 'invisible pointer-events-none'
            )}
          >
            <X className="w-3.5 h-3.5" />
            Limpiar
          </button>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Cargando inventario...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400">No se encontraron productos</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-8" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Marca</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Categoría</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Variantes</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Stock total</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isOpen = expanded.has(p.id)
                  const marca = p.marca as { nombre: string } | null
                  const categoria = p.categoria as { nombre: string } | null
                  const confirmingProduct = isConfirming('producto', p.id)

                  return (
                    <Fragment key={p.id}>
                      {/* Product row */}
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(p.id)}
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {isOpen
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />
                          }
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{p.nombre}</p>
                          {p.descripcion && <p className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{marca?.nombre ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{categoria?.nombre ?? '—'}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{p.variantes.length}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            'inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold',
                            p.totalStock === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          )}>
                            {p.totalStock}
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
                        <td className="px-4 py-3 min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                          {canManage && (
                            confirmingProduct ? (
                              <div className="flex items-center gap-1 justify-end">
                                <span className="text-xs text-gray-500 mr-1">¿Eliminar?</span>
                                <button
                                  onClick={() => deleteProducto.mutate(p.id)}
                                  disabled={isPending}
                                  className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors"
                                >
                                  Sí
                                </button>
                                <button
                                  onClick={() => setConfirmTarget(null)}
                                  className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => openEditProducto(p)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                  title="Editar producto"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openCreateVariante(p)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                                  title="Agregar variante"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setConfirmTarget({ type: 'producto', id: p.id })}
                                  className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  title="Eliminar producto"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )
                          )}
                        </td>
                      </tr>

                      {/* Variant rows (expanded) */}
                      {isOpen && p.variantes.map((v) => {
                        const confirmingVariante = isConfirming('variante', v.id)
                        return (
                          <tr key={v.id} className="bg-purple-50/30 border-b border-gray-50 hover:bg-purple-50/50 transition-colors">
                            <td className="px-4 py-2.5" />
                            <td className="px-4 py-2.5 pl-8">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">{v.sku}</span>
                                {v.talla && <span className="text-xs text-gray-500">Talla {v.talla}</span>}
                                {v.color && <span className="text-xs text-gray-500">· {v.color}</span>}
                                {!v.activo && <span className="text-orange-500 text-xs">(inactiva)</span>}
                              </div>
                            </td>
                            <td className="px-4 py-2.5" colSpan={2} />
                            <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-800">
                              {formatCRC(v.precio)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={cn(
                                'inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold',
                                v.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                              )}>
                                {v.stock}
                              </span>
                            </td>
                            <td className="px-4 py-2.5" colSpan={2}>
                              {canManage && (
                                confirmingVariante ? (
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className="text-xs text-gray-500 mr-1">¿Eliminar?</span>
                                    <button
                                      onClick={() => deleteVariante.mutate(v.id)}
                                      disabled={isPending}
                                      className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors"
                                    >
                                      Sí
                                    </button>
                                    <button
                                      onClick={() => setConfirmTarget(null)}
                                      className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 justify-end">
                                    <button
                                      onClick={() => openEditVariante(p, v)}
                                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                      title="Editar variante"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setConfirmTarget({ type: 'variante', id: v.id })}
                                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                      title="Eliminar variante"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )
                              )}
                            </td>
                          </tr>
                        )
                      })}

                      {/* Empty variantes message */}
                      {isOpen && p.variantes.length === 0 && (
                        <tr className="bg-purple-50/20 border-b border-gray-50">
                          <td colSpan={8} className="px-4 py-3 pl-12 text-xs text-gray-400">
                            Sin variantes.{canManage && (
                              <>
                                {' '}
                                <button
                                  onClick={() => openCreateVariante(p)}
                                  className="text-brand-600 hover:underline"
                                >
                                  Agregar la primera variante
                                </button>
                              </>
                            )}
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
      </div>

      <BulkImportModal isOpen={bulkImportOpen} onClose={() => setBulkImportOpen(false)} />

      <ProductModal isOpen={productModal} onClose={closeProductModal} producto={editingProducto} />

      {varianteModal && (
        <VarianteModal
          isOpen={true}
          onClose={() => setVarianteModal(null)}
          productoId={varianteModal.productoId}
          productoNombre={varianteModal.productoNombre}
          variante={varianteModal.variante}
        />
      )}
    </div>
  )
}
