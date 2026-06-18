import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, UserCog, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useEmployees, useToggleEmpleadoActivo } from '@/hooks/useEmployees'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import type { Empleado } from '@/types'

const schema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  apellido: z.string().optional(),
  tienda_id: z.string().min(1, 'Tienda requerida'),
})

type FormData = z.infer<typeof schema>

interface EmpleadoModalProps {
  isOpen: boolean
  onClose: () => void
  empleado?: Empleado | null
}

function EmpleadoModal({ isOpen, onClose, empleado }: EmpleadoModalProps) {
  const qc = useQueryClient()
  const { activeTienda, isAdmin } = useAuth()
  const isEditing = !!empleado

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: empleado?.nombre ?? '',
      apellido: empleado?.apellido ?? '',
      tienda_id: empleado?.tienda_id ?? activeTienda?.id ?? '',
    },
  })

  const { data: tiendas } = useQuery({
    queryKey: ['tiendas-select'],
    queryFn: async () => {
      const { data } = await supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre')
      return data ?? []
    },
    enabled: isOpen && isAdmin,
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        apellido: data.apellido || null,
        tienda_id: data.tienda_id,
      }
      if (isEditing) {
        const { error } = await supabase.from('empleados').update(payload).eq('id', empleado.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('empleados').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      toast.success(isEditing ? 'Empleado actualizado' : 'Empleado creado')
      reset()
      onClose()
    },
    onError: () => toast.error('Error al guardar el empleado'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar empleado' : 'Nuevo empleado'}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Nombre" required error={errors.nombre?.message}>
            <input {...register('nombre')} className={inputClass(!!errors.nombre)} placeholder="Mariana" />
          </FormField>
          <FormField label="Apellido">
            <input {...register('apellido')} className={inputClass()} placeholder="González" />
          </FormField>
        </div>

        <FormField label="Tienda" required error={errors.tienda_id?.message}>
          {isAdmin ? (
            <select {...register('tienda_id')} className={inputClass(!!errors.tienda_id)}>
              <option value="">Seleccionar tienda...</option>
              {tiendas?.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          ) : (
            <input value={activeTienda?.nombre ?? ''} disabled className={cn(inputClass(), 'bg-gray-50 text-gray-500')} />
          )}
        </FormField>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear empleado'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function EmployeesPage() {
  const { data: empleados, isLoading } = useEmployees()
  const { canManage } = useAuth()
  const toggleActivo = useToggleEmpleadoActivo()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Empleado | null>(null)

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(e: Empleado) { setEditing(e); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(null) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <p className="text-sm text-gray-500 mt-1">Personal de las tiendas</p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo empleado
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : !empleados?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-10 h-10 bg-brand-50 rounded-2xl flex items-center justify-center mb-3">
              <UserCog className="w-5 h-5 text-brand-600" />
            </div>
            <p className="text-sm font-medium text-gray-700">No hay empleados registrados</p>
            {canManage && (
              <p className="text-xs text-gray-400 mt-1">Crea el primer empleado con el botón de arriba</p>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tienda</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Desde</th>
                {canManage && <th className="px-6 py-3.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {empleados.map((emp) => {
                const fullName = [emp.nombre, emp.apellido].filter(Boolean).join(' ')
                const initial = fullName.charAt(0).toUpperCase()
                return (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                          {initial}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(emp.tienda as { nombre: string } | undefined)?.nombre ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        emp.activo
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      )}>
                        {emp.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(emp.created_at).toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActivo.mutate({ id: emp.id, activo: !emp.activo })}
                            disabled={toggleActivo.isPending}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
                            title={emp.activo ? 'Desactivar' : 'Activar'}
                          >
                            {emp.activo
                              ? <ToggleRight className="w-4 h-4 text-green-500" />
                              : <ToggleLeft className="w-4 h-4" />
                            }
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <EmpleadoModal isOpen={modalOpen} onClose={closeModal} empleado={editing} />
    </div>
  )
}
