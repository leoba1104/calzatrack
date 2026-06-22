import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Banknote, CreditCard, ClipboardCheck, ReceiptText } from 'lucide-react'
import { format, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'
import { SaleModal } from '@/components/sales/SaleModal'
import { CierreCajaModal } from '@/components/reports/CierreCajaModal'
import { useCategoriasContado, BADGE_COLOR_MAP } from '@/hooks/useCategoriasContado'
import type { VentaTipo } from '@/types'

type RawPago = {
  id: string
  monto: number
  tipo_pago: string
  fecha: string
  venta: {
    id: string
    tipo: VentaTipo
    categoria_venta: string | null
  } | null
}

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta',
  sinpe: 'SINPE', transferencia: 'Transfer.', otro: 'Otro',
}

const TIPO_ABONO_LABEL: Record<string, string> = {
  apartado: 'Abono apartado',
  credito:  'Abono crédito',
}

export function SalesPage() {
  const { activeTienda } = useAuth()
  const qc = useQueryClient()
  const { data: categoriasContado = [] } = useCategoriasContado()

  const [modalOpen, setModalOpen]   = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)

  const today    = format(new Date(), 'yyyy-MM-dd')
  const todayLabel = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })

  const { data: ultimoCierre } = useQuery({
    queryKey: ['cierre-hoy', activeTienda?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from('cierres_caja')
        .select('created_at')
        .eq('tienda_id', activeTienda!.id)
        .eq('fecha', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as { created_at: string } | null
    },
    enabled: !!activeTienda,
    staleTime: 0,
  })

  const cierreDesde = ultimoCierre?.created_at

  const { data: pagos = [], isLoading } = useQuery({
    queryKey: ['caja-hoy', activeTienda?.id, cierreDesde],
    queryFn: async () => {
      const desde = cierreDesde ?? startOfDay(new Date()).toISOString()
      const hasta = endOfDay(new Date()).toISOString()

      const { data, error } = await supabase
        .from('pagos_venta')
        .select(`
          id, monto, tipo_pago, fecha,
          venta:ventas!inner(id, tipo, categoria_venta, tienda_id)
        `)
        .eq('ventas.tienda_id', activeTienda!.id)
        .gt('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as RawPago[]
    },
    enabled: !!activeTienda,
    staleTime: 0,
  })

  // Totals
  const totalDia    = pagos.reduce((s, p) => s + p.monto, 0)
  const totalCaja   = pagos.filter(p => p.tipo_pago === 'efectivo').reduce((s, p) => s + p.monto, 0)
  const totalCuenta = totalDia - totalCaja

  const porCategoria = categoriasContado.map((cat) => ({
    ...cat,
    total: pagos
      .filter(p => p.venta?.tipo === 'contado' && p.venta?.categoria_venta === cat.slug)
      .reduce((s, p) => s + p.monto, 0),
  }))

  const totalApartados = pagos.filter(p => p.venta?.tipo === 'apartado').reduce((s, p) => s + p.monto, 0)
  const totalCreditos  = pagos.filter(p => p.venta?.tipo === 'credito').reduce((s, p) => s + p.monto, 0)

  const tiposDesglose = [
    ...porCategoria.filter(c => c.total > 0).map(c => ({ label: c.nombre, total: c.total, color: c.color })),
    ...(totalApartados > 0 ? [{ label: 'Apartados', total: totalApartados, color: 'blue' }] : []),
    ...(totalCreditos  > 0 ? [{ label: 'Créditos',  total: totalCreditos,  color: 'orange' }] : []),
  ]

  const hasPagos = pagos.length > 0

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCierreOpen(true)}
            disabled={!hasPagos}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 bg-white rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            Cierre de caja
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva venta
          </button>
        </div>
      </div>

      {/* Post-cierre banner */}
      {cierreDesde && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
          <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
          Cierre realizado a las {format(new Date(cierreDesde), 'HH:mm')} —
          {hasPagos ? ' mostrando ventas post-cierre.' : ' sin ventas nuevas aún.'}
        </div>
      )}

      {/* Stats card — total + caja/cuenta + tipo desglose */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Total row */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              {cierreDesde ? 'Total post-cierre' : 'Total del día'}
            </p>
            <p className="text-3xl font-bold text-brand-700 mt-0.5">{formatCRC(totalDia)}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-gray-400 flex items-center justify-end gap-1.5 mb-0.5">
                <Banknote className="w-3.5 h-3.5" />
                Caja (efectivo)
              </p>
              <p className="text-lg font-bold text-gray-800">{formatCRC(totalCaja)}</p>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div className="text-right">
              <p className="text-xs text-gray-400 flex items-center justify-end gap-1.5 mb-0.5">
                <CreditCard className="w-3.5 h-3.5" />
                Cuenta (tarjeta / SINPE / transf.)
              </p>
              <p className="text-lg font-bold text-gray-800">{formatCRC(totalCuenta)}</p>
            </div>
          </div>
        </div>

        {/* Tipo desglose — compact row list */}
        {tiposDesglose.length > 0 && (
          <div className="px-6 py-3 flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400 mr-2 shrink-0">Por tipo:</span>
            {tiposDesglose.map(({ label, total }) => (
              <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-600">
                <span className="font-medium text-gray-900">{label}</span>
                <span className="text-gray-400">{formatCRC(total)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Transaction list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Movimientos</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600" />
          </div>
        ) : pagos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <ReceiptText className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Sin movimientos</p>
            <p className="text-xs text-gray-300 mt-1">Las ventas registradas aparecerán aquí</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pagos.map((p) => {
              const tipo  = p.venta?.tipo ?? 'contado'
              const cat   = tipo === 'contado'
                ? categoriasContado.find(c => c.slug === p.venta?.categoria_venta)
                : null
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="text-xs text-gray-400 w-12 shrink-0 tabular-nums">
                    {format(new Date(p.fecha), 'HH:mm')}
                  </span>

                  {cat ? (
                    <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium', BADGE_COLOR_MAP[cat.color] ?? 'bg-gray-100 text-gray-600')}>
                      {cat.nombre}
                    </span>
                  ) : (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {TIPO_ABONO_LABEL[tipo] ?? tipo}
                    </span>
                  )}

                  <span className="flex-1" />

                  <span className="font-semibold text-gray-900 tabular-nums">{formatCRC(p.monto)}</span>

                  <span className="px-2 py-0.5 rounded text-xs bg-gray-50 text-gray-500 border border-gray-100 shrink-0">
                    {METODO_LABEL[p.tipo_pago] ?? p.tipo_pago}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SaleModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          qc.invalidateQueries({ queryKey: ['caja-hoy'] })
        }}
      />
      <CierreCajaModal
        isOpen={cierreOpen}
        onClose={() => {
          setCierreOpen(false)
          qc.invalidateQueries({ queryKey: ['caja-hoy'] })
          qc.invalidateQueries({ queryKey: ['cierre-hoy'] })
        }}
      />
    </div>
  )
}
