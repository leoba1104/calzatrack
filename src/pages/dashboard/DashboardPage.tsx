import { useQuery } from '@tanstack/react-query'
import { Package, FileText, Users, TrendingUp, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC } from '@/lib/utils'

interface StatCard {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  bg: string
}

function StatCard({ label, value, icon: Icon, color, bg }: StatCard) {
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

      const [productosRes, clientesRes, facturasRes, stockBajoRes] = await Promise.all([
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('tienda_id', activeTienda.id).eq('activo', true),
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('facturas').select('total').eq('tienda_id', activeTienda.id).eq('estado', 'pagada'),
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('tienda_id', activeTienda.id).filter('stock', 'lte', 'stock_minimo'),
      ])

      const totalVentas = facturasRes.data?.reduce((sum, f) => sum + f.total, 0) ?? 0

      return {
        productos: productosRes.count ?? 0,
        clientes: clientesRes.count ?? 0,
        ventas: totalVentas,
        stockBajo: stockBajoRes.count ?? 0,
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
          label="Productos activos"
          value={stats?.productos ?? '—'}
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
          label="Stock bajo"
          value={stats?.stockBajo ?? '—'}
          icon={AlertTriangle}
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-800">Actividad reciente</h2>
        </div>
        <p className="text-sm text-gray-500">
          Las últimas facturas y movimientos aparecerán aquí.
        </p>
      </div>
    </div>
  )
}
