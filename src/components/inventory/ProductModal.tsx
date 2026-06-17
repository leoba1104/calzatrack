import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import type { CategoriaProducto, Producto } from '@/types'

const schema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  codigo: z.string().min(1, 'Código requerido'),
  marca: z.string().min(1, 'Marca requerida'),
  categoria_id: z.string().optional(),
  genero: z.enum(['hombre', 'mujer', 'nino', 'nina', 'unisex', '']).optional(),
  talla: z.string().optional(),
  color: z.string().optional(),
  precio_costo: z.number({ error: 'Debe ser ≥ 0' }).min(0, 'Debe ser ≥ 0'),
  precio_venta: z.number({ error: 'Debe ser ≥ 0' }).min(0, 'Debe ser ≥ 0'),
  stock: z.number({ error: 'Debe ser ≥ 0' }).int().min(0, 'Debe ser ≥ 0'),
  stock_minimo: z.number({ error: 'Debe ser ≥ 0' }).int().min(0, 'Debe ser ≥ 0'),
  descripcion: z.string().optional(),
  activo: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  producto?: Producto | null
}

export function ProductModal({ isOpen, onClose, producto }: ProductModalProps) {
  const { activeTienda } = useAuth()
  const qc = useQueryClient()
  const isEditing = !!producto

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: async () => {
      const { data } = await supabase.from('categorias_producto').select('*').order('nombre')
      return (data ?? []) as CategoriaProducto[]
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as never,
    defaultValues: { activo: true, stock: 0, stock_minimo: 5, precio_costo: 0, precio_venta: 0 },
  })

  useEffect(() => {
    if (isOpen) {
      reset(isEditing ? {
        nombre: producto.nombre,
        codigo: producto.codigo,
        marca: producto.marca,
        categoria_id: producto.categoria_id ?? '',
        genero: (producto.genero as FormData['genero']) ?? '',
        talla: producto.talla ?? '',
        color: producto.color ?? '',
        precio_costo: producto.precio_costo,
        precio_venta: producto.precio_venta,
        stock: producto.stock,
        stock_minimo: producto.stock_minimo,
        descripcion: producto.descripcion ?? '',
        activo: producto.activo,
      } : {
        nombre: '', codigo: '', marca: '', categoria_id: '', genero: '',
        talla: '', color: '', precio_costo: 0, precio_venta: 0,
        stock: 0, stock_minimo: 5, descripcion: '', activo: true,
      })
    }
  }, [isOpen, producto, isEditing, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        codigo: data.codigo,
        marca: data.marca,
        categoria_id: data.categoria_id || null,
        genero: data.genero || null,
        talla: data.talla || null,
        color: data.color || null,
        precio_costo: data.precio_costo,
        precio_venta: data.precio_venta,
        stock: data.stock,
        stock_minimo: data.stock_minimo,
        descripcion: data.descripcion || null,
        activo: data.activo,
      }
      if (isEditing) {
        const { error } = await supabase.from('productos').update(payload).eq('id', producto.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('productos').insert({ ...payload, tienda_id: activeTienda!.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      toast.success(isEditing ? 'Producto actualizado' : 'Producto creado')
      onClose()
    },
    onError: (e: Error) => {
      if (e.message.includes('unique')) toast.error('Ya existe un producto con ese código en esta tienda')
      else toast.error('Error al guardar el producto')
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar producto' : 'Nuevo producto'} size="lg">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d as FormData))} className="p-6 space-y-5">

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Nombre" required error={errors.nombre?.message} className="col-span-2">
            <input {...register('nombre')} className={inputClass(!!errors.nombre)} placeholder="Zapato de cuero" />
          </FormField>

          <FormField label="Código / SKU" required error={errors.codigo?.message}>
            <input {...register('codigo')} className={inputClass(!!errors.codigo)} placeholder="ZAP-001" />
          </FormField>

          <FormField label="Marca" required error={errors.marca?.message}>
            <input {...register('marca')} className={inputClass(!!errors.marca)} placeholder="Nike" />
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Categoría">
            <select {...register('categoria_id')} className={inputClass()}>
              <option value="">Sin categoría</option>
              {categorias?.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Género">
            <select {...register('genero')} className={inputClass()}>
              <option value="">—</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
              <option value="nino">Niño</option>
              <option value="nina">Niña</option>
              <option value="unisex">Unisex</option>
            </select>
          </FormField>

          <FormField label="Talla">
            <input {...register('talla')} className={inputClass()} placeholder="38, M, etc." />
          </FormField>
        </div>

        <FormField label="Color">
          <input {...register('color')} className={inputClass()} placeholder="Negro, Café..." />
        </FormField>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Precio costo (₡)" required error={errors.precio_costo?.message}>
            <input {...register('precio_costo', { valueAsNumber: true })} type="number" min="0" step="1" className={inputClass(!!errors.precio_costo)} placeholder="0" />
          </FormField>

          <FormField label="Precio venta (₡)" required error={errors.precio_venta?.message}>
            <input {...register('precio_venta', { valueAsNumber: true })} type="number" min="0" step="1" className={inputClass(!!errors.precio_venta)} placeholder="0" />
          </FormField>

          <FormField label="Stock actual" error={errors.stock?.message}>
            <input {...register('stock', { valueAsNumber: true })} type="number" min="0" className={inputClass(!!errors.stock)} placeholder="0" />
          </FormField>
        </div>

        <FormField label="Stock mínimo (alerta)" error={errors.stock_minimo?.message}>
          <input {...register('stock_minimo', { valueAsNumber: true })} type="number" min="0" className={inputClass(!!errors.stock_minimo)} placeholder="5" />
        </FormField>

        <FormField label="Descripción">
          <textarea {...register('descripcion')} rows={2} className={inputClass()} placeholder="Descripción opcional del producto..." />
        </FormField>

        <label className="flex items-center gap-2 cursor-pointer">
          <input {...register('activo')} type="checkbox" className="w-4 h-4 rounded accent-brand-600" />
          <span className="text-sm text-gray-700">Producto activo</span>
        </label>

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
