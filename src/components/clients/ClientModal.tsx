import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import type { Cliente } from '@/types'

const schema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  apellido: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  identificacion_fiscal: z.string().optional(),
  notas: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface ClientModalProps {
  isOpen: boolean
  onClose: () => void
  cliente?: Cliente | null
}

export function ClientModal({ isOpen, onClose, cliente }: ClientModalProps) {
  const qc = useQueryClient()
  const isEditing = !!cliente

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (isOpen) {
      reset(isEditing ? {
        nombre: cliente.nombre,
        apellido: cliente.apellido ?? '',
        telefono: cliente.telefono ?? '',
        email: cliente.email ?? '',
        identificacion_fiscal: cliente.identificacion_fiscal ?? '',
        notas: cliente.notas ?? '',
      } : { nombre: '', apellido: '', telefono: '', email: '', identificacion_fiscal: '', notas: '' })
    }
  }, [isOpen, cliente, isEditing, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        apellido: data.apellido || null,
        telefono: data.telefono || null,
        email: data.email || null,
        identificacion_fiscal: data.identificacion_fiscal || null,
        notas: data.notas || null,
      }
      if (isEditing) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clientes').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.success(isEditing ? 'Cliente actualizado' : 'Cliente creado')
      onClose()
    },
    onError: () => toast.error('Error al guardar el cliente'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar cliente' : 'Nuevo cliente'}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Nombre" required error={errors.nombre?.message}>
            <input {...register('nombre')} className={inputClass(!!errors.nombre)} placeholder="Juan" />
          </FormField>
          <FormField label="Apellido" error={errors.apellido?.message}>
            <input {...register('apellido')} className={inputClass()} placeholder="Pérez" />
          </FormField>
        </div>

        <FormField label="Teléfono" error={errors.telefono?.message}>
          <input {...register('telefono')} className={inputClass()} placeholder="8888-8888" />
        </FormField>

        <FormField label="Correo electrónico" error={errors.email?.message}>
          <input {...register('email')} type="email" className={inputClass(!!errors.email)} placeholder="cliente@correo.com" />
        </FormField>

        <FormField label="Cédula / Identificación fiscal">
          <input {...register('identificacion_fiscal')} className={inputClass()} placeholder="112345678" />
        </FormField>

        <FormField label="Notas" error={errors.notas?.message}>
          <textarea
            {...register('notas')}
            rows={3}
            className={inputClass()}
            placeholder="Observaciones del cliente..."
          />
        </FormField>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
