import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Trash, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import type { Cliente, Empleado, VentaEstado, MetodoPago } from '@/types'

const IVA = 0.13

const headerSchema = z.object({
  cliente_id: z.string().optional(),
  empleado_id: z.string().optional(),
  estado: z.enum(['borrador', 'apartado', 'credito', 'pagada', 'anulada']).default('pagada'),
  metodo_pago: z.enum(['efectivo', 'tarjeta', 'sinpe', 'transferencia', 'otro']).optional(),
  descuento: z.number().min(0).default(0),
  notas: z.string().optional(),
})

type HeaderData = z.infer<typeof headerSchema>

interface LineItem {
  variante_id: string
  display: string
  sku: string
  cantidad: number
  precio_unitario: number
  stock_disponible: number
}

interface DisponibleRow {
  variante_id: string
  stock: number
  variante: {
    id: string
    sku: string
    talla: string | null
    color: string | null
    precio: number
    activo: boolean
    producto: { nombre: string }
  }
}

interface VentaModalProps {
  isOpen: boolean
  onClose: () => void
  initialEstado?: VentaEstado
}

export function VentaModal({ isOpen, onClose, initialEstado = 'pagada' }: VentaModalProps) {
  const { activeTienda } = useAuth()
  const qc = useQueryClient()

  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showProductList, setShowProductList] = useState(false)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<HeaderData>({
    resolver: zodResolver(headerSchema) as never,
    defaultValues: { descuento: 0, estado: initialEstado },
  })

  const estadoActual = watch('estado') as VentaEstado

  const { data: clientes } = useQuery({
    queryKey: ['clientes-select'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, apellido')
        .order('nombre')
        .limit(500)
      return (data ?? []) as Pick<Cliente, 'id' | 'nombre' | 'apellido'>[]
    },
    enabled: isOpen,
  })

  const { data: empleados } = useQuery({
    queryKey: ['empleados', activeTienda?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('empleados')
        .select('id, nombre, apellido')
        .eq('tienda_id', activeTienda!.id)
        .eq('activo', true)
        .order('nombre')
      return (data ?? []) as Pick<Empleado, 'id' | 'nombre' | 'apellido'>[]
    },
    enabled: isOpen && !!activeTienda,
  })

  const { data: disponibles } = useQuery({
    queryKey: ['inventario-disponible', activeTienda?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventario_tienda')
        .select(`
          variante_id,
          stock,
          variante:variantes_producto!inner(
            id, sku, talla, color, precio, activo,
            producto:productos!inner(nombre)
          )
        `)
        .eq('tienda_id', activeTienda!.id)
        .gt('stock', 0)
      return (data ?? []).filter((d) => (d.variante as unknown as DisponibleRow['variante'])?.activo) as unknown as DisponibleRow[]
    },
    enabled: isOpen && !!activeTienda,
  })

  const filteredDisponibles = useMemo(() => {
    if (!disponibles) return []
    if (!productSearch.trim()) return disponibles
    const q = productSearch.toLowerCase()
    return disponibles.filter((d) => {
      const v = d.variante
      return (
        v.producto.nombre.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        (v.talla ?? '').toLowerCase().includes(q) ||
        (v.color ?? '').toLowerCase().includes(q)
      )
    })
  }, [disponibles, productSearch])

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0)
    const impuesto = subtotal * IVA
    return { subtotal, impuesto }
  }, [items])

  function displayName(d: DisponibleRow) {
    const v = d.variante
    const parts = [v.talla && `T${v.talla}`, v.color].filter(Boolean).join(' · ')
    return parts ? `${v.producto.nombre} — ${parts}` : v.producto.nombre
  }

  function addDisponible(d: DisponibleRow) {
    const id = d.variante_id
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.variante_id === id)
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx && item.cantidad < item.stock_disponible
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        )
      }
      return [...prev, {
        variante_id: id,
        display: displayName(d),
        sku: d.variante.sku,
        cantidad: 1,
        precio_unitario: d.variante.precio,
        stock_disponible: d.stock,
      }]
    })
    setProductSearch('')
    setShowProductList(false)
  }

  function updateCantidad(idx: number, cantidad: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, cantidad: Math.max(1, Math.min(cantidad, item.stock_disponible)) }
          : item
      )
    )
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleClose() {
    reset({ descuento: 0, estado: initialEstado })
    setItems([])
    setProductSearch('')
    onClose()
  }

  const mutation = useMutation({
    mutationFn: async (data: HeaderData) => {
      if (items.length === 0) throw new Error('NO_ITEMS')
      if (estadoActual === 'pagada' && !data.metodo_pago) throw new Error('NO_PAGO')

      const descuento = data.descuento ?? 0
      const { subtotal, impuesto } = totals
      const total = subtotal + impuesto - descuento

      // 1. Get sequential number
      const { data: numData, error: numErr } = await supabase
        .rpc('get_next_numero_venta', { p_tienda_id: activeTienda!.id })
      if (numErr) throw numErr

      // 2. Insert venta as borrador (trigger fires on UPDATE only)
      const { data: venta, error: ventaErr } = await supabase
        .from('ventas')
        .insert({
          tienda_id: activeTienda!.id,
          cliente_id: data.cliente_id || null,
          empleado_id: data.empleado_id || null,
          numero_venta: numData as string,
          subtotal,
          impuesto,
          descuento,
          total,
          estado: 'borrador',
          notas: data.notas || null,
        })
        .select('id')
        .single()
      if (ventaErr) throw ventaErr

      // 3. Insert line items
      const { error: itemsErr } = await supabase.from('detalle_ventas').insert(
        items.map((item) => ({
          venta_id: venta.id,
          variante_id: item.variante_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento_item: 0,
          subtotal: item.cantidad * item.precio_unitario,
        }))
      )
      if (itemsErr) throw itemsErr

      // 4. Update estado → triggers stock decrement
      const { error: updateErr } = await supabase
        .from('ventas')
        .update({ estado: data.estado })
        .eq('id', venta.id)
      if (updateErr) throw updateErr

      // 5. Register payment if pagada
      if (data.estado === 'pagada' && data.metodo_pago) {
        const { error: pagoErr } = await supabase.from('pagos_venta').insert({
          venta_id: venta.id,
          empleado_id: data.empleado_id || null,
          monto: total,
          tipo_pago: data.metodo_pago as MetodoPago,
        })
        if (pagoErr) throw pagoErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['inventario-disponible'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Venta registrada correctamente')
      handleClose()
    },
    onError: (e: Error) => {
      if (e.message === 'NO_ITEMS') toast.error('Agregue al menos un producto')
      else if (e.message === 'NO_PAGO') toast.error('Seleccione el método de pago')
      else toast.error('Error al registrar la venta')
    },
  })

  const grandTotal = totals.subtotal + totals.impuesto

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nueva venta" size="xl">
      <form noValidate onSubmit={handleSubmit((d) => mutation.mutate(d as HeaderData))}>
        <div className="p-6 grid grid-cols-2 gap-6">

          {/* Left column */}
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

            <FormField label="Empleado que atiende">
              <select {...register('empleado_id')} className={inputClass()}>
                <option value="">Sin asignar</option>
                {empleados?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} {e.apellido ?? ''}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Estado de la venta" required error={errors.estado?.message}>
              <select {...register('estado')} className={inputClass(!!errors.estado)}>
                <option value="pagada">Pagada</option>
                <option value="apartado">Apartado</option>
                <option value="credito">Crédito</option>
                <option value="borrador">Borrador</option>
              </select>
            </FormField>

            {estadoActual === 'pagada' && (
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
            )}

            <FormField label="Descuento (₡)">
              <input
                {...register('descuento', { valueAsNumber: true })}
                type="number"
                min="0"
                step="1"
                className={inputClass()}
                placeholder="0"
              />
            </FormField>

            <FormField label="Notas">
              <textarea
                {...register('notas')}
                rows={3}
                className={inputClass()}
                placeholder="Observaciones de la venta..."
              />
            </FormField>
          </div>

          {/* Right column */}
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
                  placeholder="Buscar por nombre, SKU, talla o color..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                />
                {showProductList && filteredDisponibles.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredDisponibles.slice(0, 20).map((d) => (
                      <button
                        key={d.variante_id}
                        type="button"
                        onClick={() => addDisponible(d)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-brand-50 transition-colors text-left"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{displayName(d)}</span>
                          <span className="text-gray-400 text-xs ml-2">{d.variante.sku}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">Stock: {d.stock}</span>
                          <span className="font-medium text-brand-700">{formatCRC(d.variante.precio)}</span>
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
                <span className="col-span-5">Producto</span>
                <span className="col-span-2 text-center">Cant.</span>
                <span className="col-span-3 text-right">Precio</span>
                <span className="col-span-1 text-right">Total</span>
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
                    <div key={item.variante_id} className="px-3 py-2 grid grid-cols-12 gap-1 items-center">
                      <div className="col-span-5">
                        <p className="text-xs font-medium text-gray-900 truncate">{item.display}</p>
                        <p className="text-xs text-gray-400">{item.sku}</p>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          max={item.stock_disponible}
                          value={item.cantidad}
                          onChange={(e) => updateCantidad(idx, Number(e.target.value))}
                          className="w-full text-center text-xs border border-gray-200 rounded px-1 py-1 outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="col-span-3 text-right text-xs text-gray-700">
                        {formatCRC(item.precio_unitario)}
                      </div>
                      <div className="col-span-1 text-right text-xs font-medium text-gray-900">
                        {formatCRC(item.cantidad * item.precio_unitario)}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash className="w-3.5 h-3.5" />
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
              {mutation.isPending ? 'Registrando...' : 'Registrar venta'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
