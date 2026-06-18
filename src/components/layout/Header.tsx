import { useState } from 'react'
import { ChevronDown, Store } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import type { Tienda } from '@/types'

export function Header() {
  const { profile, activeTienda, isAdmin, setActiveTienda } = useAuth()
  const [storeOpen, setStoreOpen] = useState(false)

  const { data: tiendas } = useQuery({
    queryKey: ['tiendas'],
    queryFn: async () => {
      const { data } = await supabase.from('tiendas').select('*').order('nombre')
      return (data ?? []) as Tienda[]
    },
    enabled: isAdmin,
  })

  const firstName = profile?.nombre ?? 'Usuario'

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
      <div />

      {isAdmin && tiendas && tiendas.length > 1 && (
        <div className="relative">
          <button
            onClick={() => setStoreOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <Store className="w-4 h-4 text-brand-600" />
            {activeTienda?.nombre ?? 'Seleccionar tienda'}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {storeOpen && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
              {tiendas.map((tienda) => (
                <button
                  key={tienda.id}
                  onClick={() => { setActiveTienda(tienda); setStoreOpen(false) }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 transition-colors',
                    activeTienda?.id === tienda.id
                      ? 'text-brand-700 font-semibold bg-brand-50'
                      : 'text-gray-700'
                  )}
                >
                  {tienda.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  )
}
