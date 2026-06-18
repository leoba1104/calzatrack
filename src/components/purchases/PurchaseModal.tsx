import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import { formatCRC } from '@/lib/utils'
import type { Proveedor } from '@/types'

const headerSchema = z.object({
  proveedor_id:              z.string().min(1, 'Proveedor requerido'),
  fecha:                     z.string().min(1, 'Fecha requerida'),
  numero_factura_proveedor:  z.string().optional(),
  estado:                    z.enum(['pendiente', 'recibida']),
  notas:                     z.string().optional(),
})

type HeaderData = z.infer<typeof headerSchema>

interface LineItem {
  _key: string
  variante_id: string
  sku: string
  nombre: string
  talla: string | null
  color: string | null
  cantidad: number
  costo_unitario: number
}

interface VarianteRow {
  id: string
  sku: string
  talla: string | null
  color: string | null
  precio: number
  producto: { nombre: string } | null
}

interface PurchaseModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PurchaseModal({ isOpen, onClose }: PurchaseModalProps) {
  const qc = useQueryClient()
  const { activeTienda } = useAuth()

  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [varSearch, setVarSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<HeaderData>({
    resolver: zodResolver(headerSchema),
    defaultValues: {
      proveedor_id: '',
      fecha: new Date().toISOString().slice(0, 10),
      numero_factura_proveedor: '',
      estado: 'pendiente',
      notas: '',
    },
  })

  useEffect(() => {
    if (isOpen) {
      reset({
        proveedor_id: '',
        fecha: new Date().toISOString().slice(0, 10),
        numero_factura_proveedor: '',
        estado: 'pendiente',
        notas: '',
      })
      setLineItems([])
      setVarSearch('')
    }
  }, [isOpen, reset])

  // Close search results on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-activos'],
    queryFn: async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre_empresa').eq('activo', true).order('nombre_empresa')
      return (data ?? []) as Pick<Proveedor, 'id' | 'nombre_empresa'>[]
    },
    enabled: isOpen,
  })

  const { data: varResults, isFetching: searchingVars } = useQuery({
    queryKey: ['variantes-compra-search', varSearch],
    queryFn: async () => {
      const { data } = await supabase
        .from('variantes_producto')
        .select('id, sku, talla, color, precio, producto:productos(nombre)')
        .or(`sku.ilike.%${varSearch}%,producto.nombre.ilike.%${varSearch}%`)
        .eq('activo', true)
        .limit(8)
      return (data ?? []) as unknown as VarianteRow[]
    },
    enabled: varSearch.length >= 2,
  })

  function addVariante(v: VarianteRow) {
    const already = lineItems.find((l) => l.variante_id === v.id)
    if (already) {
      setLineItems((prev) => prev.map((l) => l.variante_id === v.id ? { ...l, cantidad: l.cantidad + 1 } : l))
    } else {
      setLineItems((prev) => [...prev, {
        _key: v.id,
        variante_id: v.id,
        sku: v.sku,
        nombre: (v.producto as { nombre: string } | null)?.nombre ?? '',
        talla: v.talla,
        color: v.color,
        cantidad: 1,
        costo_unitario: v.precio,
      }])
    }
    setVarSearch('')
    setShowResults(false)
  }

  function removeItem(key: string) {
    setLineItems((prev) => prev.filter((l) => l._key !== key))
  }

  function updateItem(key: string, field: 'cantidad' | 'costo_unitario', value: number) {
    setLineItems((prev) => prev.map((l) => l._key === key ? { ...l, [field]: value } : l))
  }

  const total = lineItems.reduce((sum, l) => sum + l.cantidad * l.costo_unitario, 0)

  const mutation = useMutation({
    mutationFn: async (data: HeaderData) => {
      if (!activeTienda) throw new Error('Sin tienda activa')
      if (!lineItems.length) throw new Error('Agrega al menos un producto')

      // 1. Insert compra
      const { data: compra, error: compraErr } = await supabase
        .from('compras')
        .insert({
          proveedor_id:             data.proveedor_id || null,
          fecha:                    data.fecha,
          numero_factura_proveedor: data.numero_factura_proveedor || null,
          tienda_id:                activeTienda.id,
          estado:                   data.estado,
          total_pagado:             total,
          notas:                    data.notas || null,
        })
        .select('id')
        .single()
      if (compraErr || !compra) throw compraErr ?? new Error('Error al crear la compra')

      // 2. Insert line items
      const { error: itemsErr } = await supabase.from('detalle_compras').insert(
        lineItems.map((l) => ({
          compra_id:      compra.id,
          variante_id:    l.variante_id,
          cantidad:       l.cantidad,
          costo_unitario: l.costo_unitario,
          subtotal:       l.cantidad * l.costo_unitario,
        }))
      )
      if (itemsErr) throw itemsErr

      // 3. If recibida, increment stock for each item
      if (data.estado === 'recibida') {
        for (const l of lineItems) {
          const { data: row } = await supabase
            .from('inventario_tienda')
            .select('id, stock')
            .eq('tienda_id', activeTienda.id)
            .eq('variante_id', l.variante_id)
            .maybeSingle()

          if (row) {
            await supabase
              .from('inventario_tienda')
              .update({ stock: row.stock + l.cantidad })
              .eq('id', row.id)
          } else {
            await supabase
              .from('inventario_tienda')
              .insert({ tienda_id: activeTienda.id, variante_id: l.variante_id, stock: l.cantidad })
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success('Compra registrada')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message || 'Error al registrar la compra'),
  })

  const estado = watch('estado')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva compra" size="xl">
      <form noValidate onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col">
        {/* Header fields */}
        <div className="p-6 border-b border-gray-100 grid grid-cols-2 gap-4">
          <FormField label="Proveedor" required error={errors.proveedor_id?.message}>
            <select {...register('proveedor_id')} className={inputClass(!!errors.proveedor_id)}>
              <option value="">Seleccionar proveedor...</option>
              {proveedores?.map((p) => <option key={p.id} value={p.id}>{p.nombre_empresa}</option>)}
            </select>
          </FormField>

          <FormField label="Fecha" required error={errors.fecha?.message}>
            <input {...register('fecha')} type="date" className={inputClass(!!errors.fecha)} />
          </FormField>

          <FormField label="N.° factura del proveedor">
            <input {...register('numero_factura_proveedor')} className={inputClass()} placeholder="FAC-0001" />
          </FormField>

          <FormField label="Estado" required>
            <select {...register('estado')} className={inputClass()}>
              <option value="pendiente">Pendiente (aún no llega)</option>
              <option value="recibida">Recibida (entra al inventario ahora)</option>
            </select>
          </FormField>

          <div className="col-span-2">
            <FormField label="Notas">
              <input {...register('notas')} className={inputClass()} placeholder="Observaciones..." />
            </FormField>
          </div>
        </div>

        {/* Product search */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-sm font-medium text-gray-700 mb-2">Productos</p>
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={varSearch}
              onChange={(e) => { setVarSearch(e.target.value); setShowResults(true) }}
              onFocus={() => varSearch.length >= 2 && setShowResults(true)}
              placeholder="Buscar variante por SKU o nombre..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            {showResults && varSearch.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                {searchingVars ? (
                  <div className="px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />Buscando...
                  </div>
                ) : !varResults?.length ? (
                  <div className="px-4 py-3 text-sm text-gray-400">Sin resultados</div>
                ) : varResults.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => addVariante(v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-brand-50 text-left text-sm transition-colors"
                  >
                    <div>
                      <span className="font-mono text-xs text-brand-700 mr-2">{v.sku}</span>
                      <span className="text-gray-700">{(v.producto as { nombre: string } | null)?.nombre}</span>
                      {(v.talla || v.color) && (
                        <span className="text-gray-400 ml-1">
                          {[v.talla && `T.${v.talla}`, v.color].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <Plus className="w-4 h-4 text-brand-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Line items table */}
        <div className="px-6 pb-4 flex-1 overflow-y-auto max-h-64">
          {lineItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
              Busca y agrega productos arriba
            </div>
          ) : (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left py-2 font-medium">Producto</th>
                  <th className="text-center py-2 font-medium w-24">Cantidad</th>
                  <th className="text-center py-2 font-medium w-32">Costo unit.</th>
                  <th className="text-right py-2 font-medium w-28">Subtotal</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lineItems.map((l) => (
                  <tr key={l._key}>
                    <td className="py-2 pr-2">
                      <p className="font-medium text-gray-800">{l.nombre}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-xs text-brand-700 bg-brand-50 px-1 rounded">{l.sku}</span>
                        {l.talla && <span className="text-xs text-gray-400">T.{l.talla}</span>}
                        {l.color && <span className="text-xs text-gray-400">· {l.color}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min="1"
                        value={l.cantidad}
                        onChange={(e) => updateItem(l._key, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-center text-sm border border-gray-200 rounded-lg py-1 outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min="0"
                        value={l.costo_unitario}
                        onChange={(e) => updateItem(l._key, 'costo_unitario', Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full text-center text-sm border border-gray-200 rounded-lg py-1 outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold text-gray-800">
                      {formatCRC(l.cantidad * l.costo_unitario)}
                    </td>
                    <td className="py-2 pl-2">
                      <button type="button" onClick={() => removeItem(l._key)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="text-sm">
            <span className="text-gray-500">Total: </span>
            <span className="text-lg font-bold text-gray-900">{formatCRC(total)}</span>
            {estado === 'recibida' && (
              <span className="ml-3 text-xs text-green-600 font-medium">· entrará al inventario</span>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !lineItems.length}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {mutation.isPending ? 'Guardando...' : 'Registrar compra'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
