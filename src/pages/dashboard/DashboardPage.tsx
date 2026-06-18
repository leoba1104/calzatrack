import { useQuery } from '@tanstack/react-query'
import { Package, ShoppingCart, Users, AlertTriangle, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  bg: string
}

function StatCard({ label, value, icon: Icon, color, bg }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const { activeTienda } = useAuth()

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', activeTienda?.id],
    queryFn: async () => {
      if (!activeTienda) return null

      const [variantesRes, clientesRes, ventasRes, sinStockRes] = await Promise.all([
        supabase
          .from('inventario_tienda')
          .select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id),
        supabase
          .from('clientes')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('ventas')
          .select('total')
          .eq('tienda_id', activeTienda.id)
          .eq('estado', 'pagada'),
        supabase
          .from('inventario_tienda')
          .select('id', { count: 'exact', head: true })
          .eq('tienda_id', activeTienda.id)
          .eq('stock', 0),
      ])

      const totalVentas = ventasRes.data?.reduce((sum, v) => sum + v.total, 0) ?? 0

      return {
        variantes: variantesRes.count ?? 0,
        clientes: clientesRes.count ?? 0,
        ventas: totalVentas,
        sinStock: sinStockRes.count ?? 0,
      }
    },
    enabled: !!activeTienda,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {activeTienda?.nombre ?? 'Bienvenido a CalzaTrack'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Referencias en inventario"
          value={stats?.variantes ?? '—'}
          icon={Package}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="Clientes"
          value={stats?.clientes ?? '—'}
          icon={Users}
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          label="Ventas totales"
          value={stats ? formatCRC(stats.ventas) : '—'}
          icon={TrendingUp}
          color="text-brand-600"
          bg="bg-brand-50"
        />
        <StatCard
          label="Sin stock"
          value={stats?.sinStock ?? '—'}
          icon={AlertTriangle}
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-800">Actividad reciente</h2>
        </div>
        <p className="text-sm text-gray-500">
          Las últimas ventas y movimientos aparecerán aquí.
        </p>
      </div>
    </div>
  )
}
