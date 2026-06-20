import { useState, useMemo, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Trash, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import { PhoneInput } from '@/components/ui/PhoneInput'
import type { Cliente, Empleado, VentaTipo, MetodoPago } from '@/types'

const headerSchema = z.object({
  cliente_id:        z.string().optional(),
  empleado_id:       z.string().optional(),
  tipo:              z.enum(['contado', 'apartado', 'credito']).default('contado'),
  // z.enum rechaza "" (cadena vacía del <select>); validamos el valor real en la mutación
  metodo_pago:       z.string().optional(),
  descuento:         z.number().min(0).default(0),
  abono_inicial:     z.number().min(0).default(0),
  notas:             z.string().optional(),
  // Contact fields — required for apartados (stored directly on the venta)
  contacto_nombre:   z.string().optional(),
  contacto_apellido: z.string().optional(),
  contacto_telefono: z.string().optional(),
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

interface SaleModalProps {
  isOpen: boolean
  onClose: () => void
  initialTipo?: VentaTipo
}

export function SaleModal({ isOpen, onClose, initialTipo = 'contado' }: SaleModalProps) {
  const { activeTienda } = useAuth()
  const qc = useQueryClient()

  const [items, setItems] = useState<LineItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showProductList, setShowProductList] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showProductList) return
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowProductList(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showProductList])

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<HeaderData>({
    resolver: zodResolver(headerSchema) as never,
    defaultValues: { descuento: 0, tipo: initialTipo, abono_inicial: 0 },
  })

  const tipoActual = watch('tipo') as VentaTipo

  const { data: clientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, apellido, moroso, telefono')
        .order('nombre')
        .limit(500)
      return (data ?? []) as Pick<Cliente, 'id' | 'nombre' | 'apellido' | 'moroso' | 'telefono'>[]
    },
    enabled: isOpen,
  })

  const selectedClienteId = watch('cliente_id')
  const selectedCliente   = clientes?.find(c => c.id === selectedClienteId)
  const clienteEsMoroso   = selectedCliente?.moroso === true

  // Auto-fill contact fields when a registered client is selected on an apartado
  useEffect(() => {
    if (tipoActual === 'apartado' && selectedCliente) {
      setValue('contacto_nombre',   selectedCliente.nombre)
      setValue('contacto_apellido', selectedCliente.apellido ?? '')
      setValue('contacto_telefono', selectedCliente.telefono ?? '')
    }
  }, [selectedCliente, tipoActual, setValue])

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
    return { subtotal }
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
    reset({ descuento: 0, tipo: initialTipo, abono_inicial: 0 })
    setItems([])
    setProductSearch('')
    onClose()
  }

  const mutation = useMutation({
    mutationFn: async (data: HeaderData) => {
      if (items.length === 0) throw new Error('NO_ITEMS')
      if (tipoActual === 'contado' && !data.metodo_pago) throw new Error('NO_PAGO')
      if (tipoActual === 'credito' && !data.cliente_id) throw new Error('NO_CLIENTE_CREDITO')
      if (tipoActual === 'credito' && clienteEsMoroso) throw new Error('CLIENTE_MOROSO')
      if (tipoActual === 'apartado' && !data.contacto_nombre?.trim())   throw new Error('NO_CONTACTO_NOMBRE')
      if (tipoActual === 'apartado' && !data.contacto_apellido?.trim()) throw new Error('NO_CONTACTO_APELLIDO')
      const abonoInicial = data.abono_inicial ?? 0
      if (tipoActual !== 'contado' && abonoInicial > 0 && !data.metodo_pago) throw new Error('NO_PAGO')

      const descuento = data.descuento ?? 0
      const { subtotal } = totals
      const impuesto = 0
      const total = subtotal - descuento

      // 1. Get sequential number
      const { data: numData, error: numErr } = await supabase
        .rpc('get_next_numero_venta', { p_tienda_id: activeTienda!.id })
      if (numErr) throw numErr

      // 2. Insert venta — estado='pendiente' initially (trigger only fires on UPDATE to 'pagada')
      const { data: venta, error: ventaErr } = await supabase
        .from('ventas')
        .insert({
          tienda_id:    activeTienda!.id,
          cliente_id:   data.cliente_id || null,
          empleado_id:  data.empleado_id || null,
          numero_venta: numData as string,
          subtotal,
          impuesto,
          descuento,
          total,
          tipo:              data.tipo,
          estado:            'pendiente',
          notas:             data.notas || null,
          contacto_nombre:   data.contacto_nombre?.trim() || null,
          contacto_apellido: data.contacto_apellido?.trim() || null,
          contacto_telefono: data.contacto_telefono?.trim() || null,
        })
        .select('id')
        .single()
      if (ventaErr) throw ventaErr

      // 3. Insert line items
      const { error: itemsErr } = await supabase.from('detalle_ventas').insert(
        items.map((item) => ({
          venta_id:       venta.id,
          variante_id:    item.variante_id,
          cantidad:       item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento_item: 0,
          subtotal:       item.cantidad * item.precio_unitario,
        }))
      )
      if (itemsErr) throw itemsErr

      // 4. Contado: update estado → pagada (triggers stock decrement)
      //    Apartado/Crédito: stay pendiente, no update needed
      if (data.tipo === 'contado') {
        const { error: updateErr } = await supabase
          .from('ventas')
          .update({ estado: 'pagada' })
          .eq('id', venta.id)
        if (updateErr) throw updateErr
      }

      // 5. Register payment
      if (data.tipo === 'contado' && data.metodo_pago) {
        // Full payment — registers the complete total
        const { error: pagoErr } = await supabase.from('pagos_venta').insert({
          venta_id:   venta.id,
          empleado_id: data.empleado_id || null,
          monto:      total,
          tipo_pago:  data.metodo_pago as MetodoPago,
        })
        if (pagoErr) throw pagoErr
      } else if (data.tipo !== 'contado' && abonoInicial > 0 && data.metodo_pago) {
        // Initial deposit for apartado/crédito
        const { error: pagoErr } = await supabase.from('pagos_venta').insert({
          venta_id:   venta.id,
          empleado_id: data.empleado_id || null,
          monto:      abonoInicial,
          tipo_pago:  data.metodo_pago as MetodoPago,
        })
        if (pagoErr) throw pagoErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['pagos-ventas'] })
      qc.invalidateQueries({ queryKey: ['apartados'] })
      qc.invalidateQueries({ queryKey: ['creditos'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['inventario-disponible'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Venta registrada correctamente')
      handleClose()
    },
    onError: (e: Error) => {
      if (e.message === 'NO_ITEMS') toast.error('Agregue al menos un producto')
      else if (e.message === 'NO_PAGO') toast.error('Seleccione el método de pago')
      else if (e.message === 'NO_CLIENTE_CREDITO') toast.error('El crédito debe asignarse a un cliente registrado')
      else if (e.message === 'CLIENTE_MOROSO') toast.error('No se puede crear un crédito a un cliente moroso')
      else if (e.message === 'NO_CONTACTO_NOMBRE')   toast.error('Ingrese el nombre del cliente del apartado')
      else if (e.message === 'NO_CONTACTO_APELLIDO') toast.error('Ingrese el apellido del cliente del apartado')
      else toast.error('Error al registrar la venta')
    },
  })

  const descuentoActual = watch('descuento') ?? 0
  const grandTotal = Math.max(0, totals.subtotal - (descuentoActual || 0))

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
              {clienteEsMoroso && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  ⚠ Cliente moroso — no puede recibir créditos
                </p>
              )}
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

            <FormField label="Tipo de venta" required error={errors.tipo?.message}>
              <select {...register('tipo')} className={inputClass(!!errors.tipo)}>
                <option value="contado">Normal (contado)</option>
                <option value="apartado">Apartado</option>
                {/* Crédito requiere cliente registrado y no moroso */}
                {selectedClienteId && !clienteEsMoroso && <option value="credito">Crédito</option>}
              </select>
            </FormField>

            {tipoActual === 'contado' && (
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

            {tipoActual === 'apartado' && (
              <div className="space-y-3 p-3 bg-purple-50 border border-purple-100 rounded-xl">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                  Datos del cliente del apartado <span className="text-red-500 normal-case font-normal">* requeridos</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Nombre" required>
                    <input
                      {...register('contacto_nombre')}
                      className={inputClass()}
                      placeholder="Ej: María"
                    />
                  </FormField>
                  <FormField label="Apellido" required>
                    <input
                      {...register('contacto_apellido')}
                      className={inputClass()}
                      placeholder="Ej: González"
                    />
                  </FormField>
                </div>
                <FormField label="Teléfono">
                  <PhoneInput
                    {...register('contacto_telefono')}
                    className={inputClass()}
                  />
                </FormField>
                <p className="text-xs text-purple-600">
                  Si seleccionó un cliente registrado arriba, los datos se llenaron automáticamente. Puede editarlos si difieren.
                </p>
              </div>
            )}

            {tipoActual !== 'contado' && (
              <div className="space-y-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  {tipoActual === 'apartado' ? 'Enganche inicial (opcional)' : 'Pago inicial (opcional)'}
                </p>
                <FormField label="Monto abonado ahora (₡)">
                  <input
                    {...register('abono_inicial', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass()}
                    placeholder="0 — sin abono inicial"
                  />
                </FormField>
                <FormField
                  label="Método de pago"
                  error={errors.metodo_pago?.message}
                >
                  <select {...register('metodo_pago')} className={inputClass(!!errors.metodo_pago)}>
                    <option value="">Seleccionar...</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="sinpe">SINPE Móvil</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="otro">Otro</option>
                  </select>
                </FormField>
              </div>
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
              <div className="relative" ref={searchContainerRef}>
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
          <div className="text-sm space-y-1 min-w-[200px]">
            {descuentoActual > 0 && (
              <>
                <div className="flex justify-between gap-8 text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatCRC(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-8 text-green-600 font-medium">
                  <span>Descuento</span>
                  <span>−{formatCRC(descuentoActual)}</span>
                </div>
                <div className="border-t border-gray-200 pt-1" />
              </>
            )}
            <div className="flex justify-between gap-8 text-base font-bold">
              <span className="text-gray-800">Total</span>
              <span className="text-brand-700">{formatCRC(grandTotal)}</span>
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
