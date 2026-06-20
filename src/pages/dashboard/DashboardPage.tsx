import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, ShoppingBag, Tag, Package, AlertTriangle, Wallet, StickyNote, Plus, X } from 'lucide-react'
import {
  startOfDay, endOfDay,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  addDays, differenceInDays,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCRC, cn } from '@/lib/utils'

type Periodo = 'hoy' | 'mes' | 'año'

function periodoRange(p: Periodo) {
  const now = new Date()
  if (p === 'hoy') return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
  if (p === 'mes') return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
  return { from: startOfYear(now).toISOString(), to: endOfYear(now).toISOString() }
}

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
}

function KpiCard({ label, value, sub, icon: Icon, iconColor, iconBg }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider leading-tight">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export function DashboardPage() {
  const { activeTienda, user } = useAuth()
  const qc = useQueryClient()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [newNota, setNewNota] = useState('')
  const [addingNota, setAddingNota] = useState(false)
  const newNotaRef = useRef<HTMLTextAreaElement>(null)

  const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'] as const
  type NoteColor = typeof NOTE_COLORS[number]
  const [newColor, setNewColor] = useState<NoteColor>('yellow')

  const COLOR_STYLES: Record<NoteColor, string> = {
    yellow: 'bg-yellow-50 border-yellow-200',
    pink:   'bg-pink-50   border-pink-200',
    blue:   'bg-blue-50   border-blue-200',
    green:  'bg-green-50  border-green-200',
    purple: 'bg-purple-50 border-purple-200',
  }
  const COLOR_DOT: Record<NoteColor, string> = {
    yellow: 'bg-yellow-400',
    pink:   'bg-pink-400',
    blue:   'bg-blue-400',
    green:  'bg-green-500',
    purple: 'bg-purple-400',
  }

  type Nota = { id: string; contenido: string; color: NoteColor; created_at: string }

  const { data: notas = [] } = useQuery<Nota[]>({
    queryKey: ['notas-tienda', activeTienda?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('notas_tienda')
        .select('id, contenido, color, created_at')
        .eq('tienda_id', activeTienda!.id)
        .order('created_at', { ascending: false })
      return (data ?? []) as Nota[]
    },
    enabled: !!activeTienda,
  })

  const addMutation = useMutation({
    mutationFn: async ({ contenido, color }: { contenido: string; color: NoteColor }) => {
      const { error } = await supabase.from('notas_tienda').insert({
        tienda_id: activeTienda!.id, contenido, color, created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-tienda', activeTienda?.id] })
      setNewNota('')
      setAddingNota(false)
      setNewColor('yellow')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notas_tienda').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notas-tienda', activeTienda?.id] }),
  })

  function handleAddNota() {
    const text = newNota.trim()
    if (!text) return
    addMutation.mutate({ contenido: text, color: newColor })
  }

  const range = periodoRange(periodo)

  const { data: ventasData, isLoading: loadingVentas } = useQuery({
    queryKey: ['dashboard-ventas', activeTienda?.id, periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('total, items:detalle_ventas(cantidad)')
        .eq('tienda_id', activeTienda!.id)
        .eq('estado', 'pagada')
        .gte('fecha', range.from)
        .lte('fecha', range.to)
      if (error) throw error
      return data as { total: number; items: { cantidad: number }[] }[]
    },
    enabled: !!activeTienda,
  })

  const { data: apartadosData, isLoading: loadingApartados } = useQuery({
    queryKey: ['dashboard-apartados', activeTienda?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, created_at,
          contacto_nombre, contacto_apellido,
          cliente:clientes(nombre, apellido)
        `)
        .eq('tienda_id', activeTienda!.id)
        .eq('tipo', 'apartado')
        .eq('estado', 'pendiente')
      if (error) throw error
      return data as unknown as {
        id: string
        created_at: string
        contacto_nombre: string | null
        contacto_apellido: string | null
        cliente: { nombre: string; apellido: string | null } | null
      }[]
    },
    enabled: !!activeTienda,
  })

  const { data: inventarioData, isLoading: loadingInventario } = useQuery({
    queryKey: ['dashboard-inventario', activeTienda?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventario_tienda')
        .select('stock, variante:variantes_producto!inner(precio)')
        .eq('tienda_id', activeTienda!.id)
        .gt('stock', 0)
      if (error) throw error
      return data as unknown as { stock: number; variante: { precio: number } }[]
    },
    enabled: !!activeTienda,
  })

  const totalVentas   = ventasData?.reduce((s, v) => s + v.total, 0) ?? 0
  const paresVendidos = ventasData?.reduce(
    (s, v) => s + v.items.reduce((si, i) => si + i.cantidad, 0), 0
  ) ?? 0

  const now       = new Date()
  const apartados = apartadosData ?? []

  const vencidos = apartados.filter((a) => differenceInDays(addDays(new Date(a.created_at), 60), now) < 0)
  const proximos = apartados.filter((a) => {
    const dias = differenceInDays(addDays(new Date(a.created_at), 60), now)
    return dias >= 0 && dias <= 7
  })

  const totalPares      = inventarioData?.reduce((s, i) => s + i.stock, 0) ?? 0
  const valorInventario = inventarioData?.reduce((s, i) => s + i.stock * i.variante.precio, 0) ?? 0

  const periodoLabel = { hoy: 'hoy', mes: 'este mes', año: 'este año' }[periodo]

  const alertas = [
    ...vencidos.map((a) => ({ ...a, tipo: 'vencido' as const })),
    ...proximos.map((a) => ({ ...a, tipo: 'proximo' as const })),
  ]

  return (
    <div className="space-y-6">

      {/* Header + period filter */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{activeTienda?.nombre ?? 'CalzaTrack'}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {(['hoy', 'mes', 'año'] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize',
                periodo === p
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {p === 'hoy' ? 'Hoy' : p === 'mes' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={`Ventas — ${periodoLabel}`}
          value={loadingVentas ? '…' : formatCRC(totalVentas)}
          icon={TrendingUp}
          iconColor="text-brand-600"
          iconBg="bg-brand-50"
        />
        <KpiCard
          label={`Pares vendidos — ${periodoLabel}`}
          value={loadingVentas ? '…' : paresVendidos}
          sub={paresVendidos === 1 ? '1 par' : `${paresVendidos} pares`}
          icon={ShoppingBag}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KpiCard
          label="Apartados activos"
          value={loadingApartados ? '…' : apartados.length}
          sub={apartados.length === 1 ? '1 apartado pendiente' : `${apartados.length} apartados pendientes`}
          icon={Tag}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
        />
        <KpiCard
          label="Stock total"
          value={loadingInventario ? '…' : totalPares}
          sub={`${totalPares.toLocaleString('es-CR')} pares en bodega`}
          icon={Package}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Apartados en alerta */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Apartados en alerta</p>
              <p className="text-xs text-gray-400">Límite de 60 días por apartado</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{vencidos.length}</p>
              <p className="text-xs text-red-500 font-medium mt-0.5">Vencidos</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{proximos.length}</p>
              <p className="text-xs text-amber-600 font-medium mt-0.5">Próximos a vencer</p>
            </div>
          </div>

          {alertas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">Todos los apartados están al día</p>
          ) : (
            <div className="space-y-1.5">
              {alertas.slice(0, 4).map((a) => {
                const dias  = differenceInDays(addDays(new Date(a.created_at), 60), now)
                const nombre = a.contacto_nombre
                  ? `${a.contacto_apellido ?? ''} ${a.contacto_nombre}`.trim()
                  : a.cliente
                  ? `${a.cliente.apellido ?? ''} ${a.cliente.nombre}`.trim()
                  : 'Sin contacto'
                return (
                  <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm">
                    <span className="text-gray-700 truncate">{nombre}</span>
                    <span className={cn(
                      'text-xs font-semibold ml-3 shrink-0',
                      a.tipo === 'vencido' ? 'text-red-600' : 'text-amber-600'
                    )}>
                      {a.tipo === 'vencido'
                        ? `Venció hace ${Math.abs(dias)}d`
                        : dias === 0 ? 'Vence hoy' : `${dias}d restantes`}
                    </span>
                  </div>
                )
              })}
              {alertas.length > 4 && (
                <p className="text-xs text-gray-400 text-center pt-1">
                  +{alertas.length - 4} más en Apartados
                </p>
              )}
            </div>
          )}
        </div>

        {/* Valor del inventario */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Valor del inventario</p>
              <p className="text-xs text-gray-400">Al precio de venta actual</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {loadingInventario ? '…' : formatCRC(valorInventario)}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {totalPares.toLocaleString('es-CR')} pares · {activeTienda?.nombre ?? 'la tienda'}
          </p>
        </div>

      </div>

      {/* Sticky notes */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center shrink-0">
              <StickyNote className="w-4 h-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Notas</p>
              <p className="text-xs text-gray-400">Compartidas con el equipo de la tienda</p>
            </div>
          </div>
          <button
            onClick={() => { setAddingNota(true); setTimeout(() => newNotaRef.current?.focus(), 50) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 border border-brand-200 rounded-xl hover:bg-brand-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva nota
          </button>
        </div>

        {/* Add form */}
        {addingNota && (
          <div className={cn('rounded-xl border p-3 mb-3 space-y-2', COLOR_STYLES[newColor])}>
            <textarea
              ref={newNotaRef}
              value={newNota}
              onChange={(e) => setNewNota(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNota() }}
              placeholder="Escribe la nota..."
              rows={3}
              className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-gray-400"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={cn('w-5 h-5 rounded-full transition-all', COLOR_DOT[c], newColor === c ? 'ring-2 ring-offset-1 ring-gray-400' : '')}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setAddingNota(false); setNewNota('') }} className="text-xs text-gray-400 hover:text-gray-600">
                  Cancelar
                </button>
                <button
                  onClick={handleAddNota}
                  disabled={!newNota.trim() || addMutation.isPending}
                  className="px-3 py-1 text-xs font-semibold bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes grid */}
        {notas.length === 0 && !addingNota ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Sin notas — agrega recordatorios o mensajes para el equipo
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {notas.map((nota) => (
              <div key={nota.id} className={cn('relative rounded-xl border p-3 group', COLOR_STYLES[nota.color as NoteColor] ?? COLOR_STYLES.yellow)}>
                <button
                  onClick={() => deleteMutation.mutate(nota.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-white/60 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <p className="text-sm text-gray-800 whitespace-pre-wrap pr-4 leading-snug">{nota.contenido}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
