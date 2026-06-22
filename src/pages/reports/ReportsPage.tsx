import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Eye, Search } from 'lucide-react'
import { useCategoriasContado, CIERRE_COLOR_MAP } from '@/hooks/useCategoriasContado'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import type { CierreCaja } from '@/types'

const METODO_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  sinpe:         'SINPE',
  transferencia: 'Transferencia',
  otro:          'Otro',
}

const METODO_COLORS: Record<string, string> = {
  efectivo:      'bg-green-100 text-green-700',
  tarjeta:       'bg-blue-100 text-blue-700',
  sinpe:         'bg-purple-100 text-purple-700',
  transferencia: 'bg-orange-100 text-orange-700',
  otro:          'bg-gray-100 text-gray-600',
}

const METODOS = ['efectivo', 'tarjeta', 'sinpe', 'transferencia', 'otro'] as const

function CierreDetailModal({ cierre, onClose }: { cierre: CierreCaja; onClose: () => void }) {
  const { data: categoriasContado = [] } = useCategoriasContado()
  const fechaLabel  = format(new Date(cierre.fecha + 'T12:00:00'), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  const desdeHora   = format(new Date(cierre.desde), 'HH:mm', { locale: es })
  const hastaHora   = format(new Date(cierre.created_at), 'HH:mm', { locale: es })
  const esAutoCierre = cierre.notas === 'Cierre automático'

  return (
    <Modal isOpen onClose={onClose} title="Detalle del cierre">
      <div className="px-6 py-4 space-y-5">

        {/* Header info */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-gray-800 capitalize">{fechaLabel}</p>
          <p className="text-xs text-gray-400">
            {desdeHora} → {hastaHora}
            {esAutoCierre && (
              <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-500">Automático</span>
            )}
          </p>
        </div>

        {/* Total highlight */}
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 text-center">
          <p className="text-xs text-brand-600 font-medium uppercase tracking-wide mb-1">Total del período</p>
          <p className="text-3xl font-bold text-brand-700">{formatCRC(cierre.total_dia)}</p>
        </div>

        {/* By payment method */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por método de pago</p>
          <div className="grid grid-cols-2 gap-2">
            {METODOS.filter((m) => cierre[m] > 0).map((m) => (
              <div key={m} className={cn('rounded-xl p-3', METODO_COLORS[m])}>
                <p className="text-xs font-medium opacity-70">{METODO_LABELS[m]}</p>
                <p className="text-base font-bold mt-0.5">{formatCRC(cierre[m])}</p>
              </div>
            ))}
            {METODOS.every((m) => cierre[m] === 0) && (
              <p className="col-span-2 text-sm text-gray-400 text-center py-2">Sin pagos en este período</p>
            )}
          </div>
        </div>

        {/* Sale type breakdown */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por tipo de venta</p>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
            {categoriasContado
              .filter((cat) => (cierre.categorias_totales?.[cat.slug] ?? 0) > 0)
              .map((cat) => (
                <div key={cat.slug} className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${CIERRE_COLOR_MAP[cat.color]?.split(' ')[0] ?? 'bg-gray-200'}`} />
                    <span className="text-gray-600">{cat.nombre}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{formatCRC(cierre.categorias_totales[cat.slug])}</span>
                </div>
              ))
            }
            {cierre.total_apartados > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                <span className="text-gray-600">Apartados</span>
                <span className="font-semibold text-gray-900">{formatCRC(cierre.total_apartados)}</span>
              </div>
            )}
            {cierre.total_creditos > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                <span className="text-gray-600">Créditos</span>
                <span className="font-semibold text-gray-900">{formatCRC(cierre.total_creditos)}</span>
              </div>
            )}
            {cierre.total_dia === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400 text-center">Sin ventas en este período</div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{cierre.pares_vendidos}</p>
            <p className="text-xs text-gray-500 mt-0.5">Pares</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-orange-700">{cierre.apartados_abiertos}</p>
            <p className="text-xs text-orange-500 mt-0.5">Apartados</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-700">{cierre.creditos_abiertos}</p>
            <p className="text-xs text-blue-500 mt-0.5">Créditos</p>
          </div>
        </div>

        {/* By employee */}
        {(cierre.breakdown_empleados ?? []).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Por empleado</p>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
              {(cierre.breakdown_empleados ?? []).map(({ nombre, total }) => (
                <div key={nombre} className="flex items-center justify-between px-4 py-2.5 bg-white text-sm">
                  <span className="text-gray-600">{nombre}</span>
                  <span className="font-semibold text-gray-900">{formatCRC(total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cierre.notas && !esAutoCierre && (
          <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-3">
            "{cierre.notas}"
          </p>
        )}
      </div>
    </Modal>
  )
}

export function ReportsPage() {
  const { activeTienda, isAdmin } = useAuth()

  const [search, setSearch]           = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [detailCierre, setDetailCierre]   = useState<CierreCaja | null>(null)

  const { data: cierres = [], isLoading } = useQuery({
    queryKey: ['cierres', activeTienda?.id],
    queryFn: async () => {
      let q = supabase
        .from('cierres_caja')
        .select('*, tienda:tiendas(nombre)')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)

      if (!isAdmin && activeTienda) {
        q = q.eq('tienda_id', activeTienda.id)
      }

      const { data, error } = await q
      if (error) throw error
      return data as CierreCaja[]
    },
    enabled: !!activeTienda || isAdmin,
  })

  // Available months for the filter dropdown
  const months = [...new Set(
    cierres.map((c) => format(new Date(c.fecha + 'T12:00:00'), 'yyyy-MM'))
  )].sort((a, b) => b.localeCompare(a))

  // Apply filters
  const filtered = cierres.filter((c) => {
    if (selectedMonth && !c.fecha.startsWith(selectedMonth)) return false
    if (search) {
      const hora = format(new Date(c.created_at), 'HH:mm')
      const fechaStr = format(new Date(c.fecha + 'T12:00:00'), "d 'de' MMMM", { locale: es }).toLowerCase()
      const q = search.toLowerCase()
      if (!fechaStr.includes(q) && !hora.includes(q) && !(c.notas ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // Group by date (YYYY-MM-DD) — newest first
  const byDate = filtered.reduce<Record<string, CierreCaja[]>>((acc, c) => {
    if (!acc[c.fecha]) acc[c.fecha] = []
    acc[c.fecha].push(c)
    return acc
  }, {})

  const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historial de cierres de caja</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por fecha, hora..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-gray-600 bg-white"
        >
          <option value="">Todos los meses</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {format(new Date(m + '-15'), 'MMMM yyyy', { locale: es })}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6 text-brand-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">Sin cierres registrados</p>
            <p className="text-xs text-gray-400 mt-1">Los cierres de caja aparecerán aquí</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_200px_40px] gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Fecha</span>
              <span className="text-right">Pares</span>
              <span className="text-right">Total</span>
              <span>Métodos</span>
              <span />
            </div>

            {dateKeys.map((fecha) => {
              const items    = byDate[fecha]
              const fechaLabel = format(new Date(fecha + 'T12:00:00'), "EEE d 'de' MMMM 'de' yyyy", { locale: es })
              const multiCierre = items.length > 1

              return (
                <div key={fecha} className="border-b border-gray-50 last:border-0">
                  {/* Date group label when multiple cierres in same day */}
                  {multiCierre && (
                    <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100">
                      <span className="text-xs font-medium text-amber-600 capitalize">
                        {fechaLabel} · {items.length} cierres
                      </span>
                    </div>
                  )}

                  {items.map((cierre, idx) => {
                    const hora = format(new Date(cierre.created_at), 'HH:mm')
                    const esAuto = cierre.notas === 'Cierre automático'

                    return (
                      <div
                        key={cierre.id}
                        className={cn(
                          'grid grid-cols-[1fr_80px_80px_200px_40px] gap-4 items-center px-4 py-3.5 hover:bg-gray-50/60 transition-colors',
                          idx < items.length - 1 && 'border-b border-gray-50'
                        )}
                      >
                        {/* Date + time */}
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">
                            {multiCierre ? `Cierre ${idx + 1}` : fechaLabel}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {multiCierre
                              ? `${format(new Date(cierre.desde), 'HH:mm')} → ${hora}`
                              : hora
                            }
                            {esAuto && (
                              <span className="ml-1.5 inline-flex px-1 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">Auto</span>
                            )}
                          </p>
                        </div>

                        {/* Pares */}
                        <span className="text-sm text-right text-gray-600">
                          {cierre.pares_vendidos}
                        </span>

                        {/* Total */}
                        <span className="text-sm font-bold text-gray-900 text-right">
                          {formatCRC(cierre.total_dia)}
                        </span>

                        {/* Method pills */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {METODOS.filter((m) => cierre[m] > 0).map((m) => (
                            <span key={m} className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', METODO_COLORS[m])}>
                              {METODO_LABELS[m]}
                            </span>
                          ))}
                        </div>

                        {/* Eye */}
                        <button
                          onClick={() => setDetailCierre(cierre)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </>
        )}
      </div>

      {detailCierre && (
        <CierreDetailModal cierre={detailCierre} onClose={() => setDetailCierre(null)} />
      )}
    </div>
  )
}
