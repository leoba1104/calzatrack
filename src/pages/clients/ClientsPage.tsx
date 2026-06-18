import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users, Pencil, Trash, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { ClientModal } from '@/components/clients/ClientModal'
import type { Cliente } from '@/types'

export function ClientsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [deleting, setDeleting] = useState<Cliente | null>(null)

  const toggleMorosoMutation = useMutation({
    mutationFn: async ({ id, moroso }: { id: string; moroso: boolean }) => {
      const { error } = await supabase.from('clientes').update({ moroso }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { moroso }) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['creditos'] })
      toast.success(moroso ? 'Cliente marcado como moroso' : 'Morosidad removida')
    },
    onError: () => toast.error('Error al actualizar — asegúrese de aplicar la migración de BD'),
  })

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes', search],
    queryFn: async () => {
      let query = supabase.from('clientes').select('*').order('nombre').limit(200)
      if (search) query = query.or(`nombre.ilike.%${search}%,apellido.ilike.%${search}%,telefono.ilike.%${search}%`)
      const { data } = await query
      return (data ?? []) as Cliente[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.success('Cliente eliminado')
      setDeleting(null)
    },
    onError: () => toast.error('No se puede eliminar — el cliente tiene ventas asociadas'),
  })

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(c: Cliente) { setEditing(c); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(null) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Directorio compartido entre ambas tiendas</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, apellido o teléfono..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Correo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Notas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Registrado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : clientes?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400">No se encontraron clientes</p>
                  </td>
                </tr>
              ) : (
                clientes?.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{c.nombre} {c.apellido ?? ''}</span>
                        {c.moroso && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600 shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Moroso
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.telefono ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{c.notas ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => toggleMorosoMutation.mutate({ id: c.id, moroso: !c.moroso })}
                          disabled={toggleMorosoMutation.isPending}
                          title={c.moroso ? 'Quitar morosidad' : 'Marcar como moroso'}
                          className={`p-1.5 rounded-lg transition-colors ${c.moroso ? 'text-red-500 hover:bg-red-50' : 'text-gray-300 hover:bg-red-50 hover:text-red-500'}`}
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleting(c)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientModal isOpen={modalOpen} onClose={closeModal} cliente={editing} />

      {/* Confirm delete dialog */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Eliminar cliente</h3>
            <p className="text-sm text-gray-600 mb-6">
              ¿Eliminar a <strong>{deleting.nombre} {deleting.apellido ?? ''}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleting.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
