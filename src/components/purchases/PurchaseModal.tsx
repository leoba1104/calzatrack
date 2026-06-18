import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Info, ImageIcon, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import { formatCRC } from '@/lib/utils'
import type { Proveedor } from '@/types'

const headerSchema = z.object({
  proveedor_id:             z.string().min(1, 'Proveedor requerido'),
  fecha:                    z.string().min(1, 'Fecha requerida'),
  numero_factura_proveedor: z.string().optional(),
  estado:                   z.enum(['pendiente', 'recibida']),
  notas:                    z.string().optional(),
})

type HeaderData = z.infer<typeof headerSchema>

interface LineItem {
  _key:           string
  descripcion:    string
  marca:          string
  categoria:      string
  cantidad:       number
  costo_unitario: number
  crear_producto: boolean
}

function emptyLine(): LineItem {
  return { _key: crypto.randomUUID(), descripcion: '', marca: '', categoria: '', cantidad: 1, costo_unitario: 0, crear_producto: true }
}

interface PurchaseModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PurchaseModal({ isOpen, onClose }: PurchaseModalProps) {
  const qc = useQueryClient()
  const { activeTienda } = useAuth()

  const [lines, setLines]         = useState<LineItem[]>([emptyLine()])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<HeaderData>({
    resolver: zodResolver(headerSchema),
    defaultValues: { proveedor_id: '', fecha: new Date().toISOString().slice(0, 10), numero_factura_proveedor: '', estado: 'pendiente', notas: '' },
  })

  useEffect(() => {
    if (isOpen) {
      reset({ proveedor_id: '', fecha: new Date().toISOString().slice(0, 10), numero_factura_proveedor: '', estado: 'pendiente', notas: '' })
      setLines([emptyLine()])
      setImageFile(null)
      setImagePreview(null)
    }
  }, [isOpen, reset])

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-activos'],
    queryFn: async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre_empresa').eq('activo', true).order('nombre_empresa')
      return (data ?? []) as Pick<Proveedor, 'id' | 'nombre_empresa'>[]
    },
    enabled: isOpen,
  })

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => l._key === key ? { ...l, ...patch } : l))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key))
  }

  const total = lines.reduce((s, l) => s + l.cantidad * l.costo_unitario, 0)

  const mutation = useMutation({
    mutationFn: async (data: HeaderData) => {
      if (!activeTienda) throw new Error('Sin tienda activa')
      const validLines = lines.filter((l) => l.descripcion.trim())
      if (!validLines.length) throw new Error('Agrega al menos un producto')

      // 1. Get/create marcas and categorias for lines that want a catalog entry
      const marcaMap  = new Map<string, string>()
      const catMap    = new Map<string, string>()
      const marcaNames = [...new Set(validLines.filter((l) => l.crear_producto && l.marca.trim()).map((l) => l.marca.trim()))]
      const catNames   = [...new Set(validLines.filter((l) => l.crear_producto && l.categoria.trim()).map((l) => l.categoria.trim()))]

      if (marcaNames.length) {
        await supabase.from('marcas').upsert(marcaNames.map((nombre) => ({ nombre })), { onConflict: 'nombre', ignoreDuplicates: true })
        const { data: md } = await supabase.from('marcas').select('id, nombre').in('nombre', marcaNames)
        md?.forEach((m) => marcaMap.set(m.nombre, m.id))
      }
      if (catNames.length) {
        await supabase.from('categorias').upsert(catNames.map((nombre) => ({ nombre })), { onConflict: 'nombre', ignoreDuplicates: true })
        const { data: cd } = await supabase.from('categorias').select('id, nombre').in('nombre', catNames)
        cd?.forEach((c) => catMap.set(c.nombre, c.id))
      }

      // 2. Create products (inactive, no variants yet) for lines that requested it
      const productoIdMap = new Map<string, string>() // _key → producto_id
      for (const l of validLines.filter((l) => l.crear_producto)) {
        const { data: p, error } = await supabase
          .from('productos')
          .insert({
            nombre:       l.descripcion.trim(),
            marca_id:     l.marca.trim()     ? (marcaMap.get(l.marca.trim())    ?? null) : null,
            categoria_id: l.categoria.trim() ? (catMap.get(l.categoria.trim())  ?? null) : null,
            precio_base:  l.costo_unitario,
            activo:       false,
          })
          .select('id')
          .single()
        if (!error && p) productoIdMap.set(l._key, p.id)
      }

      // 3. Insert compra
      const { data: compra, error: cErr } = await supabase
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
      if (cErr || !compra) throw cErr ?? new Error('Error al crear la compra')

      // 4. Insert line items
      const { error: iErr } = await supabase.from('detalle_compras').insert(
        validLines.map((l) => ({
          compra_id:      compra.id,
          descripcion:    l.descripcion.trim(),
          producto_id:    productoIdMap.get(l._key) ?? null,
          variante_id:    null,
          cantidad:       l.cantidad,
          costo_unitario: l.costo_unitario,
          subtotal:       l.cantidad * l.costo_unitario,
        }))
      )
      if (iErr) throw iErr

      // 5. Upload invoice image if provided (non-fatal: compra already saved)
      if (imageFile) {
        const ext  = imageFile.name.split('.').pop() ?? 'jpg'
        const path = `${compra.id}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('facturas-compra')
          .upload(path, imageFile, { upsert: true })
        if (upErr) {
          console.error('[Storage 400]', upErr)
          toast.error(`Imagen no subida: ${upErr.message}`)
        } else {
          const { data: urlData } = supabase.storage.from('facturas-compra').getPublicUrl(path)
          await supabase.from('compras').update({ factura_imagen_url: urlData.publicUrl }).eq('id', compra.id)
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
  const linesWithProduct = lines.filter((l) => l.descripcion.trim() && l.crear_producto).length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva compra" size="xl">
      <form noValidate onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col">

        {/* Header */}
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

          <FormField label="Estado">
            <select {...register('estado')} className={inputClass()}>
              <option value="pendiente">Pendiente — aún no llega</option>
              <option value="recibida">Recibida — llega hoy</option>
            </select>
          </FormField>

          <FormField label="Notas">
            <input {...register('notas')} className={inputClass()} placeholder="Observaciones, condiciones de entrega..." />
          </FormField>

          {/* Invoice image upload */}
          <FormField label="Foto de la factura original">
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Vista previa" className="h-16 rounded-lg border border-gray-200 object-contain" />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null) }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Adjuntar imagen o PDF
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setImageFile(file)
                setImagePreview(URL.createObjectURL(file))
                e.target.value = ''
              }}
            />
          </FormField>
        </div>

        {/* Info banner */}
        <div className="mx-6 mt-4 flex items-start gap-2 p-3 bg-brand-50 rounded-xl border border-brand-100 text-xs text-brand-700">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>Los productos marcados con <strong>"Crear en catálogo"</strong> se agregan como <strong>inactivos sin tallas</strong>. Cuando llegue el pedido, ve a Inventario para agregar variantes (tallas/colores) y activarlos.</p>
        </div>

        {/* Line items */}
        <div className="px-6 pt-4 pb-2 flex-1 overflow-y-auto max-h-72">
          <div className="space-y-2">
            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_100px_100px_auto_auto] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
              <span>Descripción del producto</span>
              <span>Marca</span>
              <span>Categoría</span>
              <span className="text-center">Cant.</span>
              <span className="text-center">Costo unit.</span>
              <span className="text-center">+ catálogo</span>
              <span />
            </div>

            {lines.map((l) => (
              <div key={l._key} className="grid grid-cols-[2fr_1fr_1fr_100px_100px_auto_auto] gap-2 items-center">
                <input
                  value={l.descripcion}
                  onChange={(e) => updateLine(l._key, { descripcion: e.target.value })}
                  placeholder="Ej: Tenis Nike Mercurial"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  value={l.marca}
                  onChange={(e) => updateLine(l._key, { marca: e.target.value })}
                  placeholder="Nike"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  value={l.categoria}
                  onChange={(e) => updateLine(l._key, { categoria: e.target.value })}
                  placeholder="Tenis"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="number"
                  min="1"
                  value={l.cantidad}
                  onChange={(e) => updateLine(l._key, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full text-center px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="number"
                  min="0"
                  value={l.costo_unitario}
                  onChange={(e) => updateLine(l._key, { costo_unitario: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-full text-center px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={l.crear_producto}
                    onChange={(e) => updateLine(l._key, { crear_producto: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    title="Crear en catálogo de productos"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(l._key)}
                  disabled={lines.length === 1}
                  className="p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="mt-3 flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar línea
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="text-sm space-y-0.5">
            <div>
              <span className="text-gray-500">Total: </span>
              <span className="text-lg font-bold text-gray-900">{formatCRC(total)}</span>
            </div>
            {linesWithProduct > 0 && (
              <p className="text-xs text-brand-600">
                {linesWithProduct} producto{linesWithProduct !== 1 ? 's' : ''} se crearán en el catálogo como inactivos
                {estado === 'recibida' && ' · recibirás una notificación para asignar tallas'}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
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
