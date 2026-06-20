import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'
import type { CierreCaja } from '@/types'

const METODO_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  sinpe:         'SINPE',
  transferencia: 'Transferencia',
  otro:          'Otro',
}

function CierreRow({ cierre }: { cierre: CierreCaja }) {
  const [expanded, setExpanded] = useState(false)

  const fechaLabel = format(new Date(cierre.fecha + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })
  const metodos = ['efectivo', 'tarjeta', 'sinpe', 'transferencia', 'otro'] as const

  return (
    <div className="border-b border-gray-50 last:border-0">
      {/* Summary row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
      >
        <span className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 capitalize">{fechaLabel}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {cierre.pares_vendidos} par{cierre.pares_vendidos !== 1 ? 'es' : ''} vendido{cierre.pares_vendidos !== 1 ? 's' : ''}
            {cierre.notas ? ' · ' + cierre.notas.slice(0, 40) : ''}
          </p>
        </div>

        {/* Method pills */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          {metodos.filter((m) => cierre[m] > 0).map((m) => (
            <span key={m} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {METODO_LABELS[m]} {formatCRC(cierre[m])}
            </span>
          ))}
        </div>

        <span className="text-sm font-bold text-gray-900 shrink-0 ml-3">
          {formatCRC(cierre.total_dia)}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* By payment method */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Método de pago</p>
              <div className="space-y-1.5">
                {metodos.filter((m) => cierre[m] > 0).map((m) => (
                  <div key={m} className="flex justify-between text-sm">
                    <span className="text-gray-600">{METODO_LABELS[m]}</span>
                    <span className="font-medium text-gray-900">{formatCRC(cierre[m])}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By sale type */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tipo de venta</p>
              <div className="space-y-1.5">
                {([
                  ['Contado',   cierre.total_contado],
                  ['Apartados', cierre.total_apartados],
                  ['Créditos',  cierre.total_creditos],
                ] as [string, number][]).filter(([, v]) => v > 0).map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-medium text-gray-900">{formatCRC(value)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span>{cierre.pares_vendidos} pares vendidos</span>
            <span>{cierre.apartados_abiertos} apartados abiertos</span>
            <span>{cierre.creditos_abiertos} créditos abiertos</span>
          </div>

          {cierre.notas && (
            <p className="text-xs text-gray-500 italic mt-2 pt-2 border-t border-gray-100">
              "{cierre.notas}"
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ReportsPage() {
  const { activeTienda, isAdmin } = useAuth()

  const { data: cierres = [], isLoading } = useQuery({
    queryKey: ['cierres', activeTienda?.id],
    queryFn: async () => {
      let q = supabase
        .from('cierres_caja')
        .select('*, tienda:tiendas(nombre)')
        .order('fecha', { ascending: false })
        .limit(90) // ~3 months

      if (!isAdmin && activeTienda) {
        q = q.eq('tienda_id', activeTienda.id)
      }

      const { data, error } = await q
      if (error) throw error
      return data as CierreCaja[]
    },
    enabled: !!activeTienda || isAdmin,
  })

  // Group by month for display
  const byMonth = cierres.reduce<Record<string, CierreCaja[]>>((acc, c) => {
    const key = format(new Date(c.fecha + 'T12:00:00'), 'MMMM yyyy', { locale: es })
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Historial de cierres de caja</p>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-gray-100">

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : cierres.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6 text-brand-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">Sin cierres registrados</p>
            <p className="text-xs text-gray-400 mt-1">Haz tu primer cierre de caja para empezar el historial</p>
          </div>
        ) : (
          <div>
            {Object.entries(byMonth).map(([month, items]) => (
              <div key={month}>
                {/* Month header */}
                <div className={cn(
                  'px-4 py-2 bg-gray-50/60 border-b border-gray-100',
                  'flex items-center justify-between'
                )}>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider capitalize">
                    {month}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatCRC(items.reduce((s, c) => s + c.total_dia, 0))} total
                  </span>
                </div>
                {items.map((c) => (
                  <CierreRow key={c.id} cierre={c} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
