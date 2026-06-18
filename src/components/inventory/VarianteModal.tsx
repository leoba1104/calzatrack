import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import type { VarianteProducto } from '@/types'

const createSchema = z.object({
  sku: z.string().min(1, 'SKU requerido'),
  talla: z.string().optional(),
  color: z.string().optional(),
  precio: z.number({ error: 'Precio requerido' }).min(1, 'Precio debe ser mayor a 0'),
  stock_inicial: z.number().min(0).default(0),
  activo: z.boolean().default(true),
})

const editSchema = z.object({
  sku: z.string().min(1, 'SKU requerido'),
  talla: z.string().optional(),
  color: z.string().optional(),
  precio: z.number({ error: 'Precio requerido' }).min(1, 'Precio debe ser mayor a 0'),
  activo: z.boolean().default(true),
})

type CreateData = z.infer<typeof createSchema>

interface VarianteModalProps {
  isOpen: boolean
  onClose: () => void
  productoId: string
  productoNombre: string
  variante?: (VarianteProducto & { stock?: number }) | null
}

export function VarianteModal({ isOpen, onClose, productoId, productoNombre, variante }: VarianteModalProps) {
  const qc = useQueryClient()
  const { activeTienda } = useAuth()
  const isEditing = !!variante

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateData>({
    resolver: zodResolver(isEditing ? editSchema : createSchema) as never,
    defaultValues: {
      sku: '',
      talla: '',
      color: '',
      precio: 0,
      stock_inicial: 0,
      activo: true,
    },
  })

  useEffect(() => {
    if (isOpen) {
      reset(isEditing ? {
        sku: variante.sku,
        talla: variante.talla ?? '',
        color: variante.color ?? '',
        precio: variante.precio,
        activo: variante.activo,
      } : { sku: '', talla: '', color: '', precio: 0, stock_inicial: 0, activo: true })
    }
  }, [isOpen, variante, isEditing, reset])

  const mutation = useMutation({
    mutationFn: async (data: CreateData) => {
      if (isEditing) {
        const { error } = await supabase.from('variantes_producto').update({
          sku: data.sku,
          talla: data.talla || null,
          color: data.color || null,
          precio: data.precio,
          activo: data.activo,
        }).eq('id', variante.id)
        if (error) throw error
      } else {
        const { data: newVar, error } = await supabase.from('variantes_producto').insert({
          producto_id: productoId,
          sku: data.sku,
          talla: data.talla || null,
          color: data.color || null,
          precio: data.precio,
          activo: data.activo,
        }).select('id').single()
        if (error) throw error

        if (data.stock_inicial > 0 && activeTienda && newVar) {
          const { error: stockErr } = await supabase.from('inventario_tienda').insert({
            tienda_id: activeTienda.id,
            variante_id: newVar.id,
            stock: data.stock_inicial,
          })
          if (stockErr) throw stockErr
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['inventario-disponible'] })
      toast.success(isEditing ? 'Variante actualizada' : 'Variante creada')
      onClose()
    },
    onError: (e: Error) => {
      if (e.message?.includes('unique') || e.message?.includes('duplicate')) {
        toast.error('El SKU ya existe — use uno diferente')
      } else {
        toast.error('Error al guardar la variante')
      }
    },
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Editar variante — ${productoNombre}` : `Nueva variante — ${productoNombre}`}
    >
      <form onSubmit={handleSubmit((d) => mutation.mutate(d as CreateData))} className="p-6 space-y-4">
        <FormField label="SKU" required error={errors.sku?.message}>
          <input {...register('sku')} className={inputClass(!!errors.sku)} placeholder="NIKE-TCB-38" />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Talla">
            <input {...register('talla')} className={inputClass()} placeholder="38" />
          </FormField>
          <FormField label="Color">
            <input {...register('color')} className={inputClass()} placeholder="Blanco" />
          </FormField>
        </div>

        <FormField label="Precio de venta (₡)" required error={errors.precio?.message}>
          <input
            {...register('precio', { valueAsNumber: true })}
            type="number"
            min="1"
            step="1"
            className={inputClass(!!errors.precio)}
            placeholder="35000"
          />
        </FormField>

        {!isEditing && (
          <FormField label={`Stock inicial en ${activeTienda?.nombre ?? 'esta tienda'}`}>
            <input
              {...register('stock_inicial', { valueAsNumber: true })}
              type="number"
              min="0"
              step="1"
              className={inputClass()}
              placeholder="0"
            />
          </FormField>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input {...register('activo')} type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm text-gray-700">Variante activa</span>
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear variante'}
          </button>
        </div>
      </form>
    </Modal>
  )
}