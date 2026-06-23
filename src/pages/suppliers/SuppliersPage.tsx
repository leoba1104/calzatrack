import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Building2, Pencil, Trash2, ToggleLeft, ToggleRight, Phone, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { FormField, inputClass } from '@/components/ui/FormField'
import { PhoneInput, crPhoneSchema } from '@/components/ui/PhoneInput'
import type { Proveedor } from '@/types'

const schema = z.object({
  nombre_empresa: z.string().min(1, 'Nombre requerido'),
  contacto:       z.string().optional(),
  telefono:       z.string().regex(crPhoneSchema, 'Debe ser XXXX-XXXX').optional().or(z.literal('')),
  email:          z.string().email('Email inválido').optional().or(z.literal('')),
  notas:          z.string().optional(),
})

type FormData = z.infer<typeof schema>

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ProveedorModalProps {
  isOpen: boolean
  onClose: () => void
  proveedor?: Proveedor | null
}

function ProveedorModal({ isOpen, onClose, proveedor }: ProveedorModalProps) {
  const qc = useQueryClient()
  const { activeTienda } = useAuth()
  const isEditing = !!proveedor

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nombre_empresa: '', contacto: '', telefono: '', email: '', notas: '' },
  })

  useEffect(() => {
    if (isOpen) {
      reset({
        nombre_empresa: proveedor?.nombre_empresa ?? '',
        contacto:       proveedor?.contacto       ?? '',
        telefono:       proveedor?.telefono        ?? '',
        email:          proveedor?.email           ?? '',
        notas:          proveedor?.notas           ?? '',
      })
    }
  }, [isOpen, proveedor, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        nombre_empresa: data.nombre_empresa,
        contacto:       data.contacto  || null,
        telefono:       data.telefono  || null,
        email:          data.email     || null,
        notas:          data.notas     || null,
      }
      if (isEditing) {
        const { error } = await supabase.from('proveedores').update(payload).eq('id', proveedor.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('proveedores').insert({ ...payload, tienda_id: activeTienda!.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success(isEditing ? 'Proveedor actualizado' : 'Proveedor creado')
      onClose()
    },
    onError: () => toast.error('Error al guardar el proveedor'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar proveedor' : 'Nuevo proveedor'}>
      <form noValidate onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-6 space-y-4">
        <FormField label="Nombre de la empresa" required error={errors.nombre_empresa?.message}>
          <input {...register('nombre_empresa')} className={inputClass(!!errors.nombre_empresa)} placeholder="Distribuidora XYZ S.A." />
        </FormField>

        <FormField label="Persona de contacto" error={errors.contacto?.message}>
          <input {...register('contacto')} className={inputClass()} placeholder="Carlos Mora" />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Teléfono" error={errors.telefono?.message}>
            <PhoneInput {...register('telefono')} className={inputClass(!!errors.telefono)} />
          </FormField>
          <FormField label="Correo electrónico" error={errors.email?.message}>
            <input {...register('email')} type="email" className={inputClass(!!errors.email)} placeholder="ventas@empresa.com" />
          </FormField>
        </div>

        <FormField label="Notas">
          <textarea {...register('notas')} rows={3} className={inputClass()} placeholder="Condiciones de pago, días de entrega..." />
        </FormField>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={mutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors">
            {mutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SuppliersPage() {
  const { canManage, activeTienda } = useAuth()
  const qc = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Proveedor | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: proveedores, isLoading } = useQuery({
    queryKey: ['proveedores', activeTienda?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('tienda_id', activeTienda!.id)
        .order('nombre_empresa')
      if (error) throw error
      return data as Proveedor[]
    },
    enabled: !!activeTienda,
  })

  const toggleActivo = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('proveedores').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success('Proveedor actualizado')
    },
    onError: () => toast.error('Error al actualizar el proveedor'),
  })

  const deleteProveedor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proveedores').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success('Proveedor eliminado')
      setConfirmDeleteId(null)
    },
    onError: () => toast.error('Error al eliminar el proveedor'),
  })

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(p: Proveedor) { setEditing(p); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(null) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-sm text-gray-500 mt-1">Empresas y distribuidoras</p>
        </div>
        {canManage && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
            <Plus className="w-4 h-4" />
            Nuevo proveedor
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : !proveedores?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-10 h-10 bg-brand-50 rounded-2xl flex items-center justify-center mb-3">
              <Building2 className="w-5 h-5 text-brand-600" />
            </div>
            <p className="text-sm font-medium text-gray-700">No hay proveedores registrados</p>
            {canManage && <p className="text-xs text-gray-400 mt-1">Agrega el primero con el botón de arriba</p>}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Comunicación</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                {canManage && <th className="px-6 py-3.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {proveedores.map((p) => {
                const confirming = confirmDeleteId === p.id
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                          {p.nombre_empresa.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{p.nombre_empresa}</p>
                          {p.notas && <p className="text-xs text-gray-400 truncate max-w-[200px]">{p.notas}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{p.contacto ?? '—'}</td>
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        {p.telefono && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Phone className="w-3 h-3 text-gray-400" />{p.telefono}
                          </div>
                        )}
                        {p.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Mail className="w-3 h-3 text-gray-400" />{p.email}
                          </div>
                        )}
                        {!p.telefono && !p.email && <span className="text-xs text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 min-w-[160px]">
                        {confirming ? (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs text-gray-500 mr-1">¿Eliminar?</span>
                            <button onClick={() => deleteProveedor.mutate(p.id)} disabled={deleteProveedor.isPending} className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors">Sí</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">No</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="Editar"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => toggleActivo.mutate({ id: p.id, activo: !p.activo })} disabled={toggleActivo.isPending} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50" title={p.activo ? 'Desactivar' : 'Activar'}>
                              {p.activo ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setConfirmDeleteId(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ProveedorModal isOpen={modalOpen} onClose={closeModal} proveedor={editing} />
    </div>
  )
}
