import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'

// ── Period helpers ─────────────────────────────────────────────
type Periodo = 'mes' | 'mes_anterior' | 'año' | 'año_anterior'

function periodoRange(p: Periodo) {
  const now = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  switch (p) {
    case 'mes':
      return { desde: fmt(startOfMonth(now)), hasta: fmt(endOfMonth(now)), label: format(now, 'MMMM yyyy', { locale: es }) }
    case 'mes_anterior': {
      const prev = subMonths(now, 1)
      return { desde: fmt(startOfMonth(prev)), hasta: fmt(endOfMonth(prev)), label: format(prev, 'MMMM yyyy', { locale: es }) }
    }
    case 'año':
      return { desde: fmt(startOfYear(now)), hasta: fmt(endOfYear(now)), label: String(now.getFullYear()) }
    case 'año_anterior': {
      const prev = subYears(now, 1)
      return { desde: fmt(startOfYear(prev)), hasta: fmt(endOfYear(prev)), label: String(prev.getFullYear()) }
    }
  }
}

// ── Constants ──────────────────────────────────────────────────
const PALETTE = ['#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6']
const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE',
  transferencia: 'Transferencia', otro: 'Otro',
}
const TIPO_LABELS: Record<string, string> = {
  contado: 'Contado', apartado: 'Apartado', credito: 'Crédito',
}
const STOCK_PAGE = 10

// ── Raw Supabase types ─────────────────────────────────────────
type RawVenta = {
  fecha: string; total: number; descuento: number; tipo: string
  tienda:   { nombre: string } | null
  empleado: { nombre: string; apellido: string | null } | null
}
type RawPago = { monto: number; tipo_pago: string }
type RawDetalle = {
  subtotal: number; cantidad: number
  variante: {
    producto: {
      nombre: string
      categoria: { nombre: string } | null
      marca:    { nombre: string } | null
    } | null
  } | null
}
type RawInv = {
  stock: number
  tienda:   { nombre: string } | null
  variante: {
    sku: string; talla: string | null; color: string | null
    producto: { nombre: string } | null
  } | null
}
type RawCompra = { fecha: string; total_pagado: number }

// ── UI helpers ─────────────────────────────────────────────────
function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100">{title}</h2>
}

function KpiMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900 truncate">{value}</p>
    </div>
  )
}

function Card({ title, full, action, children }: {
  title: string; full?: boolean; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 p-5', full && 'md:col-span-2')}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

function empNombre(e: { nombre: string; apellido: string | null } | null): string {
  if (!e) return 'Sin asignar'
  return `${e.nombre}${e.apellido ? ' ' + e.apellido : ''}`.trim()
}

function groupByTime(
  items: { fecha: string; total: number }[],
  esAnio: boolean
): { label: string; total: number }[] {
  const acc: Record<string, { label: string; total: number }> = {}
  for (const item of items) {
    const d       = new Date(item.fecha + 'T12:00:00')
    const sortKey = esAnio ? format(d, 'yyyy-MM') : format(d, 'yyyy-MM-dd')
    const label   = esAnio ? format(d, 'MMM', { locale: es }) : format(d, 'd/M', { locale: es })
    if (!acc[sortKey]) acc[sortKey] = { label, total: 0 }
    acc[sortKey].total += item.total
  }
  return Object.entries(acc)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
}

// ── Main ───────────────────────────────────────────────────────
export function AnalyticsPage() {
  const { activeTienda, isAdmin } = useAuth()
  const enabled = isAdmin || !!activeTienda

  const [periodo, setPeriodo]               = useState<Periodo>('año')
  const [selectedEmpleado, setSelectedEmpleado] = useState('')
  const [stockPage, setStockPage]           = useState(0)

  const range  = useMemo(() => periodoRange(periodo), [periodo])
  const esAnio = periodo === 'año' || periodo === 'año_anterior'

  // ── Queries ────────────────────────────────────────────────────

  const { data: ventas = [] } = useQuery({
    queryKey: ['analytics-ventas', activeTienda?.id, isAdmin, range.desde, range.hasta],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('fecha, total, descuento, tipo, tienda:tiendas(nombre), empleado:empleados(nombre, apellido)')
        .eq('estado', 'pagada')
        .gte('fecha', range.desde)
        .lte('fecha', range.hasta)
        .order('fecha')
      if (!isAdmin && activeTienda) q = q.eq('tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawVenta[]
    },
  })

  const { data: pagos = [] } = useQuery({
    queryKey: ['analytics-pagos', activeTienda?.id, isAdmin, range.desde, range.hasta],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('pagos_venta')
        .select('monto, tipo_pago, venta:ventas!inner(tienda_id, estado, fecha)')
        .eq('ventas.estado', 'pagada')
        .gte('ventas.fecha', range.desde)
        .lte('ventas.fecha', range.hasta)
      if (!isAdmin && activeTienda) q = q.eq('ventas.tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawPago[]
    },
  })

  const { data: detalles = [] } = useQuery({
    queryKey: ['analytics-detalles', activeTienda?.id, isAdmin, range.desde, range.hasta],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('detalle_ventas')
        .select(`
          subtotal, cantidad,
          variante:variantes_producto(
            producto:productos(nombre, categoria:categorias(nombre), marca:marcas(nombre))
          ),
          venta:ventas!inner(tienda_id, estado, fecha)
        `)
        .eq('ventas.estado', 'pagada')
        .gte('ventas.fecha', range.desde)
        .lte('ventas.fecha', range.hasta)
      if (!isAdmin && activeTienda) q = q.eq('ventas.tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawDetalle[]
    },
  })

  const { data: stockBajo = [] } = useQuery({
    queryKey: ['analytics-stock', activeTienda?.id, isAdmin],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('inventario_tienda')
        .select('stock, tienda:tiendas(nombre), variante:variantes_producto(sku, talla, color, producto:productos(nombre))')
        .lt('stock', 3)
        .order('stock')
        .limit(100)
      if (!isAdmin && activeTienda) q = q.eq('tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawInv[]
    },
  })

  const { data: compras = [] } = useQuery({
    queryKey: ['analytics-compras', activeTienda?.id, isAdmin, range.desde, range.hasta],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('compras')
        .select('fecha, total_pagado')
        .eq('estado', 'recibida')
        .gte('fecha', range.desde)
        .lte('fecha', range.hasta)
      if (!isAdmin && activeTienda) q = q.eq('tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as RawCompra[]
    },
  })

  // ── Derivaciones ───────────────────────────────────────────────

  const kpis = useMemo(() => ({
    total:     ventas.reduce((s, v) => s + v.total, 0),
    descuento: ventas.reduce((s, v) => s + v.descuento, 0),
    pares:     detalles.reduce((s, d) => s + d.cantidad, 0),
    count:     ventas.length,
  }), [ventas, detalles])

  const tendenciaData = useMemo(() =>
    groupByTime(ventas.map((v) => ({ fecha: v.fecha, total: v.total })), esAnio)
  , [ventas, esAnio])

  const comprasData = useMemo(() =>
    groupByTime(compras.map((c) => ({ fecha: c.fecha, total: c.total_pagado })), esAnio)
  , [compras, esAnio])

  const totalCompras = useMemo(() => compras.reduce((s, c) => s + c.total_pagado, 0), [compras])

  const distribucionTipo = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const v of ventas) acc[v.tipo] = (acc[v.tipo] ?? 0) + v.total
    return Object.entries(acc).map(([k, value]) => ({ name: TIPO_LABELS[k] ?? k, value }))
  }, [ventas])

  const metodosPago = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const p of pagos) acc[p.tipo_pago] = (acc[p.tipo_pago] ?? 0) + p.monto
    return Object.entries(acc).map(([k, value]) => ({ name: METODO_LABELS[k] ?? k, value }))
  }, [pagos])

  const topProductos = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const d of detalles) {
      const n = d.variante?.producto?.nombre ?? 'Desconocido'
      acc[n] = (acc[n] ?? 0) + d.subtotal
    }
    return Object.entries(acc).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, value]) => ({ name, value }))
  }, [detalles])

  const porCategoria = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const d of detalles) {
      const k = d.variante?.producto?.categoria?.nombre ?? 'Sin categoría'
      acc[k] = (acc[k] ?? 0) + d.subtotal
    }
    return Object.entries(acc).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }))
  }, [detalles])

  const porMarca = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const d of detalles) {
      const k = d.variante?.producto?.marca?.nombre ?? 'Sin marca'
      acc[k] = (acc[k] ?? 0) + d.subtotal
    }
    return Object.entries(acc).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, value]) => ({ name, value }))
  }, [detalles])

  const empleados = useMemo(() => {
    const names = new Set<string>()
    for (const v of ventas) names.add(empNombre(v.empleado))
    return [...names].sort()
  }, [ventas])

  const empleadoActivo = selectedEmpleado || empleados[0] || ''

  const empleadoResumen = useMemo(() => {
    const acc: Record<string, { total: number; count: number }> = {}
    for (const v of ventas) {
      const k = empNombre(v.empleado)
      if (!acc[k]) acc[k] = { total: 0, count: 0 }
      acc[k].total += v.total
      acc[k].count++
    }
    return Object.entries(acc)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([nombre, d]) => ({ nombre, ...d }))
  }, [ventas])

  const empleadoMensual = useMemo(() => {
    if (!empleadoActivo) return []
    return groupByTime(
      ventas
        .filter((v) => empNombre(v.empleado) === empleadoActivo)
        .map((v) => ({ fecha: v.fecha, total: v.total })),
      esAnio
    )
  }, [ventas, empleadoActivo, esAnio])

  const totalStockPages = Math.ceil(stockBajo.length / STOCK_PAGE)
  const paginatedStock  = stockBajo.slice(stockPage * STOCK_PAGE, (stockPage + 1) * STOCK_PAGE)

  const PERIODO_TABS: [Periodo, string][] = [
    ['mes',          'Este mes'],
    ['mes_anterior', 'Mes anterior'],
    ['año',          'Este año'],
    ['año_anterior', 'Año anterior'],
  ]

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* Header + period tabs */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analíticas</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">
            {isAdmin ? 'Ambas tiendas' : activeTienda?.nombre} — {range.label}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {PERIODO_TABS.map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap',
                periodo === p
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiMini label="Ingresos"       value={formatCRC(kpis.total)} />
        <KpiMini label="Ventas"         value={kpis.count.toLocaleString('es-CR')} />
        <KpiMini label="Pares vendidos" value={kpis.pares.toLocaleString('es-CR')} />
        <KpiMini label="Descuentos"     value={formatCRC(kpis.descuento)} />
      </div>

      {/* ── Ventas ── */}
      <div className="space-y-4">
        <SectionTitle title="Ventas" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title={esAnio ? 'Tendencia mensual' : 'Tendencia diaria'} full>
            {tendenciaData.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Sin ventas en este período</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tendenciaData} margin={{ right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} width={92} />
                  <Tooltip formatter={(v) => [formatCRC(Number(v)), 'Ventas']} />
                  <Line type="monotone" dataKey="total" stroke="#9333ea" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Por tipo de venta">
            {distribucionTipo.length === 0
              ? <p className="text-center text-sm text-gray-400 py-12">Sin datos</p>
              : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={distribucionTipo} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={60} outerRadius={88}>
                      {distribucionTipo.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCRC(Number(v))} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </Card>

          <Card title="Métodos de pago">
            {metodosPago.length === 0
              ? <p className="text-center text-sm text-gray-400 py-12">Sin datos</p>
              : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={metodosPago} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={60} outerRadius={88}>
                      {metodosPago.map((_, i) => <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCRC(Number(v))} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </Card>
        </div>
      </div>

      {/* ── Compras ── */}
      <div className="space-y-4">
        <SectionTitle title="Compras" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KpiMini label="Total invertido"    value={formatCRC(totalCompras)} />
          <KpiMini label="Compras recibidas"  value={compras.length} />

          <Card title={esAnio ? 'Inversión mensual' : 'Inversión diaria'} full>
            {comprasData.length === 0
              ? <p className="text-center text-sm text-gray-400 py-12">Sin compras en este período</p>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={comprasData} margin={{ right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} width={92} />
                    <Tooltip formatter={(v) => [formatCRC(Number(v)), 'Inversión']} />
                    <Bar dataKey="total" name="Inversión" fill="#c084fc" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </Card>
        </div>
      </div>

      {/* ── Productos ── */}
      <div className="space-y-4">
        <SectionTitle title="Productos" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Top 10 más vendidos (por monto)" full>
            {topProductos.length === 0
              ? <p className="text-center text-sm text-gray-400 py-12">Sin datos en este período</p>
              : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topProductos} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [formatCRC(Number(v)), 'Monto']} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {topProductos.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
          </Card>

          <Card title="Por categoría">
            {porCategoria.length === 0
              ? <p className="text-center text-sm text-gray-400 py-12">Sin datos</p>
              : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={porCategoria} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={60} outerRadius={88}>
                      {porCategoria.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCRC(Number(v))} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </Card>

          <Card title="Por marca">
            {porMarca.length === 0
              ? <p className="text-center text-sm text-gray-400 py-12">Sin datos</p>
              : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={porMarca} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [formatCRC(Number(v)), 'Monto']} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {porMarca.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
          </Card>
        </div>
      </div>

      {/* ── Empleados ── */}
      <div className="space-y-4">
        <SectionTitle title="Empleados" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Per-employee chart with selector */}
          <Card
            title={`${esAnio ? 'Ventas mensuales' : 'Ventas diarias'} — ${empleadoActivo || '—'}`}
            full
            action={
              empleados.length > 0 ? (
                <select
                  value={empleadoActivo}
                  onChange={(e) => setSelectedEmpleado(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-gray-600 bg-white"
                >
                  {empleados.map((emp) => (
                    <option key={emp} value={emp}>{emp}</option>
                  ))}
                </select>
              ) : undefined
            }
          >
            {empleadoMensual.length === 0
              ? <p className="text-center text-sm text-gray-400 py-12">Sin ventas en este período</p>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={empleadoMensual} margin={{ right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} width={92} />
                    <Tooltip formatter={(v) => [formatCRC(Number(v)), 'Ventas']} />
                    <Bar dataKey="total" fill="#9333ea" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </Card>

          {/* Summary table — click row to select employee */}
          {empleadoResumen.length > 0 && (
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Resumen del período</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-5 py-3">Empleado</th>
                    <th className="text-right px-5 py-3">Ventas</th>
                    <th className="text-right px-5 py-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {empleadoResumen.map((row) => (
                    <tr
                      key={row.nombre}
                      onClick={() => setSelectedEmpleado(row.nombre)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        row.nombre === empleadoActivo
                          ? 'bg-brand-50'
                          : 'hover:bg-gray-50'
                      )}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">{row.nombre}</td>
                      <td className="px-5 py-3 text-right text-gray-500">{row.count}</td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCRC(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Inventario ── */}
      <div className="space-y-4">
        <SectionTitle title="Inventario" />
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Stock bajo — menos de 3 unidades</p>
            {stockBajo.length > 0 && (
              <p className="text-xs text-gray-400">
                {stockBajo.length} variante{stockBajo.length !== 1 && 's'}
                {totalStockPages > 1 && ` · pág. ${stockPage + 1}/${totalStockPages}`}
              </p>
            )}
          </div>

          {stockBajo.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">
              Sin variantes con stock bajo — ¡todo en orden!
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="text-left px-5 py-3">Producto</th>
                      <th className="text-left px-5 py-3">SKU · Talla · Color</th>
                      {isAdmin && <th className="text-left px-5 py-3">Tienda</th>}
                      <th className="text-right px-5 py-3">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedStock.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {row.variante?.producto?.nombre ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                          {[row.variante?.sku, row.variante?.talla, row.variante?.color].filter(Boolean).join(' · ')}
                        </td>
                        {isAdmin && (
                          <td className="px-5 py-3 text-gray-500 text-xs">{row.tienda?.nombre ?? '—'}</td>
                        )}
                        <td className="px-5 py-3 text-right">
                          <span className={cn('font-bold text-sm', row.stock === 0 ? 'text-red-600' : 'text-amber-500')}>
                            {row.stock}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalStockPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setStockPage((p) => Math.max(0, p - 1))}
                    disabled={stockPage === 0}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </button>
                  <span className="text-xs text-gray-400">Página {stockPage + 1} de {totalStockPages}</span>
                  <button
                    onClick={() => setStockPage((p) => Math.min(totalStockPages - 1, p + 1))}
                    disabled={stockPage >= totalStockPages - 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    Siguiente
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}
