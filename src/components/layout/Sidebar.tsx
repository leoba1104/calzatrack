import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  FileText,
  Users,
  BarChart3,
  Footprints,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inventario', label: 'Inventario', icon: Package },
  { to: '/facturas', label: 'Facturas', icon: FileText },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/analiticas', label: 'Analíticas', icon: BarChart3 },
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-200">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <Footprints className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-gray-900">CalzaTrack</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
