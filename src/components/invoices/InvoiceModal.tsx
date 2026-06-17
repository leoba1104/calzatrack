import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Trash2, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import type { Cliente, Producto } from '@/types'

const IVA = 0.13

const headerSchema = z.object({
  cliente_id: z.string().optional(),
  metodo_pago: z.enum(['efectivo', 'tarjeta', 'sinpe', 'transferencia', 'otro'], {
    message: 'Seleccione un método de pago',
  }),
  descuento: z.number({ invalid_type_error: 'Ingrese un monto válido' }).min(0),
  notas: z.string().optional(),
})

type HeaderData = z.infer<typeof headerSchema>

interface LineItem {
  producto_id: string
  nombre: string
  codigo: string
  cantidad: number
  precio_unitario: number
  descuento_item: number
}

interface InvoiceModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InvoiceModal({ isOpen, onClose }: InvoiceModalProps) {
  const { activeTienda, user } = useAuth()
  const qc = useQueryClient()

  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showProductList, setShowProductList] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<HeaderData>({
    resolver: zodResolver(headerSchema) as never,
    defaultValues: { descuento: 0 },
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes-select'],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, apellido').order('nombre').limit(500)
      return (data ?? []) as Pick<Cliente, 'id' | 'nombre' | 'apellido'>[]
    },
    enabled: isOpen,
  })

  const { data: productos } = useQuery({
    queryKey: ['productos-select', activeTienda?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, codigo, precio_venta, stock, activo')
        .eq('tienda_id', activeTienda!.id)
        .eq('activo', true)
        .order('nombre')
      return (data ?? []) as Pick<Producto, 'id' | 'nombre' | 'codigo' | 'precio_venta' | 'stock' | 'activo'>[]
    },
    enabled: isOpen && !!activeTienda,
  })

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return productos ?? []
    const q = productSearch.toLowerCase()
    return (productos ?? []).filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    )
  }, [productos, productSearch])

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.cantidad * i.precio_unitario - i.descuento_item, 0)
    const impuesto = subtotal * IVA
    return { subtotal, impuesto }
  }, [items])

  function addProduct(p: typeof filteredProducts[number]) {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.producto_id === p.id)
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing ? { ...item, cantidad: item.cantidad + 1 } : item
        )
      }
      return [...prev, {
        producto_id: p.id,
        nombre: p.nombre,
        codigo: p.codigo,
        cantidad: 1,
        precio_unitario: p.precio_venta,
        descuento_item: 0,
      }]
    })
    setProductSearch('')
    setShowProductList(false)
  }

  function updateItem(idx: number, field: keyof LineItem, value: number) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleClose() {
    reset()
    setItems([])
    setProductSearch('')
    onClose()
  }

  const mutation = useMutation({
    mutationFn: async (data: HeaderData) => {
      if (items.length === 0) throw new Error('NO_ITEMS')

      const descuentoGlobal = data.descuento ?? 0
      const { subtotal, impuesto } = totals
      const total = subtotal + impuesto - descuentoGlobal

      // Get next invoice number atomically
      const { data: numData, error: numErr } = await supabase
        .rpc('get_next_factura_number', { p_tienda_id: activeTienda!.id })
      if (numErr) throw numErr

      // Create invoice
      const { data: factura, error: facturaErr } = await supabase
        .from('facturas')
        .insert({
          tienda_id: activeTienda!.id,
          cliente_id: data.cliente_id || null,
          numero_factura: numData as string,
          subtotal,
          impuesto,
          descuento: descuentoGlobal,
          total,
          estado: 'pagada',
          metodo_pago: data.metodo_pago,
          notas: data.notas || null,
          vendedor_id: user!.id,
        })
        .select('id')
        .single()
      if (facturaErr) throw facturaErr

      // Create line items
      const itemsPayload = items.map((item) => ({
        factura_id: factura.id,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento_item: item.descuento_item,
        subtotal: item.cantidad * item.precio_unitario - item.descuento_item,
      }))

      const { error: itemsErr } = await supabase.from('factura_items').insert(itemsPayload)
      if (itemsErr) throw itemsErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturas'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Factura creada correctamente')
      handleClose()
    },
    onError: (e: Error) => {
      if (e.message === 'NO_ITEMS') toast.error('Agregue al menos un producto')
      else toast.error('Error al crear la factura')
    },
  })

  const grandTotal = totals.subtotal + totals.impuesto

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nueva factura" size="xl">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d as HeaderData))}>
        <div className="p-6 grid grid-cols-2 gap-6">

          {/* Left column — header fields */}
          <div className="space-y-4">
            <FormField label="Cliente (opcional)">
              <select {...register('cliente_id')} className={inputClass()}>
                <option value="">Cliente general</option>
                {clientes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido ?? ''}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Método de pago" required error={errors.metodo_pago?.message}>
              <select {...register('metodo_pago')} className={inputClass(!!errors.metodo_pago)}>
                <option value="">Seleccionar...</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="sinpe">SINPE Móvil</option>
                <option value="transferencia">Transferencia</option>
                <option value="otro">Otro</option>
              </select>
            </FormField>

            <FormField label="Descuento global (₡)" error={errors.descuento?.message}>
              <input {...register('descuento', { valueAsNumber: true })} type="number" min="0" step="1" className={inputClass()} placeholder="0" />
            </FormField>

            <FormField label="Notas">
              <textarea {...register('notas')} rows={3} className={inputClass()} placeholder="Observaciones de la venta..." />
            </FormField>
          </div>

          {/* Right column — product search + line items */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Agregar producto <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductList(true) }}
                  onFocus={() => setShowProductList(true)}
                  placeholder="Buscar por nombre o código..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                />
                {showProductList && filteredProducts.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredProducts.slice(0, 20).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-brand-50 transition-colors text-left"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{p.nombre}</span>
                          <span className="text-gray-400 text-xs ml-2">{p.codigo}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">Stock: {p.stock}</span>
                          <span className="font-medium text-brand-700">{formatCRC(p.precio_venta)}</span>
                          <Plus className="w-3.5 h-3.5 text-brand-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Line items */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 grid grid-cols-12 gap-1 text-xs font-medium text-gray-500">
                <span className="col-span-4">Producto</span>
                <span className="col-span-2 text-center">Cant.</span>
                <span className="col-span-3 text-right">Precio</span>
                <span className="col-span-2 text-right">Subtotal</span>
                <span className="col-span-1" />
              </div>

              {items.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-1 text-gray-300" />
                  <p className="text-xs">Sin productos</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto">
                  {items.map((item, idx) => (
                    <div key={item.producto_id} className="px-3 py-2 grid grid-cols-12 gap-1 items-center">
                      <div className="col-span-4">
                        <p className="text-xs font-medium text-gray-900 truncate">{item.nombre}</p>
                        <p className="text-xs text-gray-400">{item.codigo}</p>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) => updateItem(idx, 'cantidad', Math.max(1, Number(e.target.value)))}
                          className="w-full text-center text-xs border border-gray-200 rounded px-1 py-1 outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          min="0"
                          value={item.precio_unitario}
                          onChange={(e) => updateItem(idx, 'precio_unitario', Number(e.target.value))}
                          className="w-full text-right text-xs border border-gray-200 rounded px-1 py-1 outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="col-span-2 text-right text-xs font-medium text-gray-900">
                        {formatCRC(item.cantidad * item.precio_unitario - item.descuento_item)}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Totals + submit */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-end justify-between gap-4">
          <div className="text-sm space-y-1">
            <div className="flex gap-8">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium text-gray-900 ml-auto">{formatCRC(totals.subtotal)}</span>
            </div>
            <div className="flex gap-8">
              <span className="text-gray-500">IVA (13%)</span>
              <span className="font-medium text-gray-900 ml-auto">{formatCRC(totals.impuesto)}</span>
            </div>
            <div className={cn('flex gap-8 text-base font-bold border-t border-gray-200 pt-1 mt-1')}>
              <span className="text-gray-800">Total</span>
              <span className="text-brand-700 ml-auto">{formatCRC(grandTotal)}</span>
            </div>
          </div>

          <div className="flex gap-3 shrink-0">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || items.length === 0}
              className="px-5 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {mutation.isPending ? 'Creando...' : 'Crear factura'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
