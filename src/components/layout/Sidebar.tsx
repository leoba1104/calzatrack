import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  FileText,
  Users,
  BarChart3,
  Footprints,
  UserCog,
  LogOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  allowedRoles?: UserRole[]
}

const navItems: NavItem[] = [
  { to: '/',           label: 'Dashboard',  icon: LayoutDashboard, end: true },
  { to: '/inventario', label: 'Inventario', icon: Package },
  { to: '/ventas',     label: 'Ventas',     icon: FileText },
  { to: '/clientes',   label: 'Clientes',   icon: Users },
  { to: '/empleados',  label: 'Empleados',  icon: UserCog, allowedRoles: ['admin', 'owner'] },
  { to: '/analiticas', label: 'Analíticas', icon: BarChart3, allowedRoles: ['admin', 'owner'] },
]

const rolLabel: Record<UserRole, string> = {
  admin:    'Administrador',
  owner:    'Dueño',
  employee: 'Empleado',
}

export function Sidebar() {
  const { profile, activeTienda, signOut } = useAuth()

  const visibleItems = navItems.filter(
    ({ allowedRoles }) => !allowedRoles || (profile?.rol && allowedRoles.includes(profile.rol as UserRole))
  )

  const displayName = profile
    ? [profile.nombre, profile.apellido].filter(Boolean).join(' ')
    : 'Usuario'

  return (
    <aside className="w-64 flex flex-col shrink-0 bg-[#160829]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
          <Footprints className="w-4 h-4 text-white" />
        </div>
        <span className="text-[15px] font-bold text-white tracking-tight">CalzaTrack</span>
      </div>

      {/* Active store badge */}
      {activeTienda && (
        <div className="mx-3 mb-4 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
          <p className="text-[10px] uppercase tracking-widest text-purple-400 font-semibold mb-0.5">
            Tienda activa
          </p>
          <p className="text-sm font-semibold text-white truncate">{activeTienda.nombre}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'text-purple-300 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 mt-2 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1">
          <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-purple-400">
              {profile?.rol ? (rolLabel[profile.rol as UserRole] ?? profile.rol) : ''}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-purple-400 hover:text-white hover:bg-white/5 transition-all duration-150"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
