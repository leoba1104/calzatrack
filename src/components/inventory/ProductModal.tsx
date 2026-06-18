import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import type { Producto, Marca, Categoria } from '@/types'

const schema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  descripcion: z.string().optional(),
  categoria_id: z.string().optional(),
  marca_id: z.string().optional(),
  precio_base: z.number({ error: 'Ingrese un precio' }).min(0, 'Debe ser ≥ 0'),
  activo: z.boolean().default(true),
})

type FormData = z.infer<typeof schema>

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  producto?: Producto | null
}

export function ProductModal({ isOpen, onClose, producto }: ProductModalProps) {
  const qc = useQueryClient()
  const isEditing = !!producto

  const { data: marcas } = useQuery({
    queryKey: ['marcas'],
    queryFn: async () => {
      const { data } = await supabase.from('marcas').select('id, nombre').order('nombre')
      return (data ?? []) as Marca[]
    },
  })

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: async () => {
      const { data } = await supabase.from('categorias').select('id, nombre').order('nombre')
      return (data ?? []) as Categoria[]
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as never,
    defaultValues: { activo: true, precio_base: 0 },
  })

  useEffect(() => {
    if (isOpen) {
      reset(isEditing ? {
        nombre: producto.nombre,
        descripcion: producto.descripcion ?? '',
        categoria_id: producto.categoria_id ?? '',
        marca_id: producto.marca_id ?? '',
        precio_base: producto.precio_base,
        activo: producto.activo,
      } : {
        nombre: '', descripcion: '', categoria_id: '', marca_id: '',
        precio_base: 0, activo: true,
      })
    }
  }, [isOpen, producto, isEditing, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        categoria_id: data.categoria_id || null,
        marca_id: data.marca_id || null,
        precio_base: data.precio_base,
        activo: data.activo,
      }
      if (isEditing) {
        const { error } = await supabase.from('productos').update(payload).eq('id', producto.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('productos').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] })
      toast.success(isEditing ? 'Producto actualizado' : 'Producto creado')
      onClose()
    },
    onError: () => toast.error('Error al guardar el producto'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar producto' : 'Nuevo producto'} size="md">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d as FormData))} className="p-6 space-y-4">

        <FormField label="Nombre" required error={errors.nombre?.message}>
          <input {...register('nombre')} className={inputClass(!!errors.nombre)} placeholder="Tenis Clásico Blanco" />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Marca">
            <select {...register('marca_id')} className={inputClass()}>
              <option value="">Sin marca</option>
              {marcas?.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Categoría">
            <select {...register('categoria_id')} className={inputClass()}>
              <option value="">Sin categoría</option>
              {categorias?.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Precio base de referencia (₡)" error={errors.precio_base?.message}>
          <input
            {...register('precio_base', { valueAsNumber: true })}
            type="number"
            min="0"
            step="1"
            className={inputClass(!!errors.precio_base)}
            placeholder="35000"
          />
        </FormField>

        <FormField label="Descripción">
          <textarea {...register('descripcion')} rows={2} className={inputClass()} placeholder="Descripción del producto..." />
        </FormField>

        <label className="flex items-center gap-2 cursor-pointer">
          <input {...register('activo')} type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm text-gray-700">Producto activo</span>
        </label>

        <p className="text-xs text-gray-400">
          Los SKUs, tallas, colores y precios por variante se gestionan desde la lista de inventario.
        </p>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
