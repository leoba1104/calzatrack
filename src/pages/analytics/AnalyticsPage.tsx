import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC } from '@/lib/utils'

const YEAR       = new Date().getFullYear()
const YEAR_START = `${YEAR}-01-01`

const PALETTE = ['#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6']

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE',
  transferencia: 'Transferencia', otro: 'Otro',
}
const TIPO_LABELS: Record<string, string> = {
  contado: 'Contado', apartado: 'Apartado', credito: 'Crédito',
}

// ── Raw Supabase types ─────────────────────────────────────────
type RawVenta = {
  fecha: string; total: number; descuento: number; tipo: string
  tienda:   { nombre: string } | null
  empleado: { nombre: string; apellido: string | null } | null
}
type RawPago = { monto: number; tipo_pago: string }
type RawDetalle = {
  subtotal: number
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

// ── Section / Card wrappers ────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}
function Card({ title, full, children }: { title: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-5${full ? ' md:col-span-2' : ''}`}>
      <p className="text-sm font-semibold text-gray-700 mb-4">{title}</p>
      {children}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export function AnalyticsPage() {
  const { activeTienda, isAdmin } = useAuth()
  const enabled = isAdmin || !!activeTienda

  // 1. Ventas pagadas del año
  const { data: ventas = [] } = useQuery({
    queryKey: ['analytics-ventas', activeTienda?.id, isAdmin, YEAR],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('fecha, total, descuento, tipo, tienda:tiendas(nombre), empleado:empleados(nombre, apellido)')
        .eq('estado', 'pagada')
        .gte('fecha', YEAR_START)
        .order('fecha')
      if (!isAdmin && activeTienda) q = q.eq('tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawVenta[]
    },
  })

  // 2. Pagos del año (para métodos de pago)
  const { data: pagos = [] } = useQuery({
    queryKey: ['analytics-pagos', activeTienda?.id, isAdmin, YEAR],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('pagos_venta')
        .select('monto, tipo_pago, venta:ventas!inner(tienda_id, estado, fecha)')
        .eq('ventas.estado', 'pagada')
        .gte('ventas.fecha', YEAR_START)
      if (!isAdmin && activeTienda) q = q.eq('ventas.tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawPago[]
    },
  })

  // 3. Detalle ventas — productos, categorías, marcas
  const { data: detalles = [] } = useQuery({
    queryKey: ['analytics-detalles', activeTienda?.id, isAdmin, YEAR],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('detalle_ventas')
        .select(`
          subtotal,
          variante:variantes_producto(
            producto:productos(nombre, categoria:categorias(nombre), marca:marcas(nombre))
          ),
          venta:ventas!inner(tienda_id, estado, fecha)
        `)
        .eq('ventas.estado', 'pagada')
        .gte('ventas.fecha', YEAR_START)
      if (!isAdmin && activeTienda) q = q.eq('ventas.tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawDetalle[]
    },
  })

  // 4. Inventario bajo
  const { data: stockBajo = [] } = useQuery({
    queryKey: ['analytics-stock', activeTienda?.id, isAdmin],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('inventario_tienda')
        .select('stock, tienda:tiendas(nombre), variante:variantes_producto(sku, talla, color, producto:productos(nombre))')
        .lt('stock', 3)
        .order('stock')
        .limit(50)
      if (!isAdmin && activeTienda) q = q.eq('tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as unknown as RawInv[]
    },
  })

  // 5. Compras del año
  const { data: compras = [] } = useQuery({
    queryKey: ['analytics-compras', activeTienda?.id, isAdmin, YEAR],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('compras')
        .select('fecha, total_pagado')
        .eq('estado', 'recibida')
        .gte('fecha', YEAR_START)
      if (!isAdmin && activeTienda) q = q.eq('tienda_id', activeTienda.id)
      const { data } = await q
      return (data ?? []) as RawCompra[]
    },
  })

  // ── Derivaciones ───────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total     = ventas.reduce((s, v) => s + v.total, 0)
    const descuento = ventas.reduce((s, v) => s + v.descuento, 0)
    return { total, descuento, ticket: ventas.length ? total / ventas.length : 0, count: ventas.length }
  }, [ventas])

  const { ventasMensuales, tiendaNombres } = useMemo(() => {
    const byMonth: Record<string, Record<string, number>> = {}
    const names = new Set<string>()
    for (const v of ventas) {
      const m = new Date(v.fecha).toLocaleString('es-CR', { month: 'short' })
      if (!byMonth[m]) byMonth[m] = {}
      const n = v.tienda?.nombre ?? 'Tienda'
      names.add(n)
      byMonth[m][n] = (byMonth[m][n] ?? 0) + v.total
    }
    return {
      ventasMensuales: Object.entries(byMonth).map(([mes, vals]) => ({ mes, ...vals })),
      tiendaNombres: [...names],
    }
  }, [ventas])

  const ventasDiarias = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    const byDay: Record<string, number> = {}
    for (const v of ventas) {
      if (new Date(v.fecha) < cutoff) continue
      const d = v.fecha.slice(0, 10)
      byDay[d] = (byDay[d] ?? 0) + v.total
    }
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, total]) => ({
        fecha: new Date(fecha + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }),
        total,
      }))
  }, [ventas])

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

  const comprasVsVentas = useMemo(() => {
    const acc: Record<string, { ventas: number; compras: number }> = {}
    for (const v of ventas) {
      const m = new Date(v.fecha).toLocaleString('es-CR', { month: 'short' })
      if (!acc[m]) acc[m] = { ventas: 0, compras: 0 }
      acc[m].ventas += v.total
    }
    for (const c of compras) {
      const m = new Date(c.fecha).toLocaleString('es-CR', { month: 'short' })
      if (!acc[m]) acc[m] = { ventas: 0, compras: 0 }
      acc[m].compras += c.total_pagado
    }
    return Object.entries(acc).map(([mes, v]) => ({ mes, ...v }))
  }, [ventas, compras])

  const porEmpleado = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const v of ventas) {
      const k = v.empleado
        ? `${v.empleado.nombre}${v.empleado.apellido ? ' ' + v.empleado.apellido : ''}`.trim()
        : 'Sin asignar'
      acc[k] = (acc[k] ?? 0) + v.total
    }
    return Object.entries(acc).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, value]) => ({ name, value }))
  }, [ventas])

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analíticas</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? 'Ambas tiendas' : activeTienda?.nombre} — {YEAR}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Ingresos del año',   value: formatCRC(kpis.total)   },
          { label: 'Número de ventas',   value: kpis.count.toLocaleString('es-CR') },
          { label: 'Ticket promedio',    value: formatCRC(kpis.ticket)  },
          { label: 'Descuentos totales', value: formatCRC(kpis.descuento) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
            <p className="mt-1 text-xl font-bold text-gray-900 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Ventas ── */}
      <Section title="Ventas">
        <Card title="Tendencia últimos 30 días">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ventasDiarias} margin={{ right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} width={92} />
              <Tooltip formatter={(v) => [formatCRC(Number(v)), 'Ventas']} />
              <Line type="monotone" dataKey="total" stroke="#9333ea" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title={`Ventas mensuales ${YEAR}`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ventasMensuales} margin={{ right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} width={92} />
              <Tooltip formatter={(v) => formatCRC(Number(v))} />
              <Legend iconSize={8} />
              {tiendaNombres.map((n, i) => (
                <Bar key={n} dataKey={n} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Distribución por tipo de venta">
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
        </Card>

        <Card title="Métodos de pago">
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
        </Card>
      </Section>

      {/* ── Productos ── */}
      <Section title="Productos">
        <Card title="Top 10 más vendidos (por monto)" full>
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
        </Card>

        <Card title="Por categoría">
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
        </Card>

        <Card title="Por marca">
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
        </Card>
      </Section>

      {/* ── Inventario ── */}
      <Section title="Inventario">
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Variantes con stock bajo (menos de 3 unidades)</p>
          </div>
          {stockBajo.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">Sin variantes con stock bajo — ¡todo en orden!</p>
          ) : (
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
                  {stockBajo.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{row.variante?.producto?.nombre ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                        {[row.variante?.sku, row.variante?.talla, row.variante?.color].filter(Boolean).join(' · ')}
                      </td>
                      {isAdmin && <td className="px-5 py-3 text-gray-500 text-xs">{row.tienda?.nombre ?? '—'}</td>}
                      <td className="px-5 py-3 text-right">
                        <span className={`font-bold text-sm ${row.stock === 0 ? 'text-red-600' : 'text-amber-500'}`}>
                          {row.stock}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ── Compras vs Ventas ── */}
      <Section title="Compras vs Ventas">
        <Card title={`Inversión vs ingresos por mes — ${YEAR}`} full>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comprasVsVentas} margin={{ right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} width={92} />
              <Tooltip formatter={(v) => formatCRC(Number(v))} />
              <Legend iconSize={8} />
              <Bar dataKey="ventas"  name="Ingresos"  fill="#9333ea" radius={[4, 4, 0, 0]} />
              <Bar dataKey="compras" name="Inversión" fill="#c084fc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Section>

      {/* ── Empleados ── */}
      <Section title="Empleados">
        <Card title="Ventas por empleado" full>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porEmpleado} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatCRC(v)} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [formatCRC(Number(v)), 'Total ventas']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {porEmpleado.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Section>
    </div>
  )
}
