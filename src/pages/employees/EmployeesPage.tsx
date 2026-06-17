import { UserCog, Shield, Store, User } from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

const rolConfig: Record<UserRole, { label: string; className: string }> = {
  admin:    { label: 'Administrador', className: 'bg-purple-100 text-purple-700' },
  owner:    { label: 'Dueño',         className: 'bg-blue-100 text-blue-700' },
  employee: { label: 'Empleado',      className: 'bg-gray-100 text-gray-600' },
}

const rolIcon: Record<UserRole, typeof Shield> = {
  admin:    Shield,
  owner:    Store,
  employee: User,
}

export function EmployeesPage() {
  const { data: empleados, isLoading } = useEmployees()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
        <p className="text-sm text-gray-500 mt-1">Personal registrado en el sistema</p>
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
            <p className="text-xs text-gray-400 mt-1">Los usuarios se crean desde el panel de Supabase</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tienda
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Desde
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {empleados.map((emp) => {
                const rol = emp.rol as UserRole
                const config = rolConfig[rol] ?? { label: emp.rol, className: 'bg-gray-100 text-gray-600' }
                const RolIcon = rolIcon[rol] ?? User
                const fullName = [emp.nombre, emp.apellido].filter(Boolean).join(' ') || '—'
                const initials = fullName !== '—' ? fullName.charAt(0).toUpperCase() : '?'

                return (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                          {initials}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', config.className)}>
                        <RolIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {(emp.tienda as { nombre: string } | undefined)?.nombre ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-400">
                        {new Date(emp.created_at).toLocaleDateString('es-CR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
