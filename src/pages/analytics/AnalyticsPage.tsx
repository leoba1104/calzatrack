import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC } from '@/lib/utils'

export function AnalyticsPage() {
  const { activeTienda, isAdmin } = useAuth()

  const { data: ventasMensuales, isLoading } = useQuery({
    queryKey: ['analytics-ventas', activeTienda?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('facturas')
        .select('fecha, total, tienda_id, tienda:tiendas(nombre)')
        .eq('estado', 'pagada')
        .gte('fecha', new Date(new Date().getFullYear(), 0, 1).toISOString())
        .order('fecha')

      if (!data) return []

      const byMonth: Record<string, Record<string, number>> = {}
      data.forEach((f) => {
        const month = new Date(f.fecha).toLocaleString('es-CR', { month: 'short' })
        if (!byMonth[month]) byMonth[month] = {}
        const tiendaData = f.tienda as unknown as { nombre: string } | null
        const tiendaNombre = tiendaData?.nombre ?? 'Tienda'
        byMonth[month][tiendaNombre] = (byMonth[month][tiendaNombre] ?? 0) + f.total
      })

      return Object.entries(byMonth).map(([mes, valores]) => ({ mes, ...valores }))
    },
    enabled: !!activeTienda,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analíticas</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? 'Comparativo de ambas tiendas' : activeTienda?.nombre}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Ventas mensuales {new Date().getFullYear()}</h2>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">Cargando datos...</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ventasMensuales} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(v) => formatCRC(Number(v))} />
              <Legend />
              <Bar dataKey="Tienda Papá" fill="#4c6ef5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tienda Mamá" fill="#f06595" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
