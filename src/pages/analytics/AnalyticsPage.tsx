import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC } from '@/lib/utils'

const BAR_COLORS = ['#9333ea', '#ec4899', '#3b82f6', '#10b981']

export function AnalyticsPage() {
  const { activeTienda, isAdmin } = useAuth()

  const { data: rawVentas, isLoading } = useQuery({
    queryKey: ['analytics-ventas', activeTienda?.id, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('ventas')
        .select('fecha, total, tienda_id, tienda:tiendas(nombre)')
        .eq('estado', 'pagada')
        .gte('fecha', new Date(new Date().getFullYear(), 0, 1).toISOString())
        .order('fecha')

      if (!isAdmin && activeTienda) {
        query = query.eq('tienda_id', activeTienda.id)
      }

      const { data } = await query
      return data ?? []
    },
  })

  const { chartData, tiendaNombres } = useMemo(() => {
    if (!rawVentas) return { chartData: [], tiendaNombres: [] }

    const byMonth: Record<string, Record<string, number>> = {}
    const nameSet = new Set<string>()

    rawVentas.forEach((v) => {
      const month = new Date(v.fecha).toLocaleString('es-CR', { month: 'short' })
      if (!byMonth[month]) byMonth[month] = {}
      const nombre = (v.tienda as unknown as { nombre: string } | null)?.nombre ?? 'Tienda'
      nameSet.add(nombre)
      byMonth[month][nombre] = (byMonth[month][nombre] ?? 0) + v.total
    })

    return {
      chartData: Object.entries(byMonth).map(([mes, valores]) => ({ mes, ...valores })),
      tiendaNombres: [...nameSet],
    }
  }, [rawVentas])

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
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            Sin datos de ventas para este año
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 11 }} width={100} />
              <Tooltip formatter={(v) => formatCRC(Number(v))} />
              <Legend />
              {tiendaNombres.map((nombre, i) => (
                <Bar
                  key={nombre}
                  dataKey={nombre}
                  fill={BAR_COLORS[i % BAR_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
