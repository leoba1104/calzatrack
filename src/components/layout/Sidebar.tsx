import { useState } from 'react'
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
  ChevronDown,
  Check,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { UserRole, Tienda } from '@/types'

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
  const { profile, activeTienda, isAdmin, setActiveTienda, signOut } = useAuth()
  const [storeOpen, setStoreOpen] = useState(false)

  const { data: tiendas } = useQuery({
    queryKey: ['tiendas'],
    queryFn: async () => {
      const { data } = await supabase.from('tiendas').select('*').order('nombre')
      return (data ?? []) as Tienda[]
    },
    enabled: isAdmin,
  })

  const visibleItems = navItems.filter(
    ({ allowedRoles }) => !allowedRoles || (profile?.rol && allowedRoles.includes(profile.rol as UserRole))
  )

  const displayName = profile
    ? [profile.nombre, profile.apellido].filter(Boolean).join(' ')
    : 'Usuario'

  const canSwitchStore = isAdmin && tiendas && tiendas.length > 1

  return (
    <aside className="w-64 flex flex-col shrink-0 bg-[#160829]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
          <Footprints className="w-4 h-4 text-white" />
        </div>
        <span className="text-[15px] font-bold text-white tracking-tight">CalzaTrack</span>
      </div>

      {/* Store switcher / active store badge */}
      {activeTienda && (
        <div className="mx-3 mb-4 relative">
          <button
            onClick={() => canSwitchStore && setStoreOpen((o) => !o)}
            className={cn(
              'w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-left transition-colors',
              canSwitchStore && 'hover:bg-white/10 cursor-pointer'
            )}
          >
            <p className="text-[10px] uppercase tracking-widest text-purple-400 font-semibold mb-0.5">
              Tienda activa
            </p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white truncate">{activeTienda.nombre}</p>
              {canSwitchStore && (
                <ChevronDown className={cn('w-3.5 h-3.5 text-purple-400 shrink-0 transition-transform', storeOpen && 'rotate-180')} />
              )}
            </div>
          </button>

          {canSwitchStore && storeOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1e0a35] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
              {tiendas!.map((tienda) => (
                <button
                  key={tienda.id}
                  onClick={() => { setActiveTienda(tienda); setStoreOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors',
                    activeTienda.id === tienda.id
                      ? 'text-white bg-brand-700/50'
                      : 'text-purple-300 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <span>{tienda.nombre}</span>
                  {activeTienda.id === tienda.id && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
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
