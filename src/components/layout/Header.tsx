import { useState } from 'react'
import { ChevronDown, LogOut, Store } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import type { Tienda } from '@/types'

export function Header() {
  const { profile, activeTienda, isAdmin, signOut, setActiveTienda } = useAuth()
  const [storeOpen, setStoreOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const { data: tiendas } = useQuery({
    queryKey: ['tiendas'],
    queryFn: async () => {
      const { data } = await supabase.from('tiendas').select('*').order('nombre')
      return (data ?? []) as Tienda[]
    },
    enabled: isAdmin,
  })

  const displayName = profile
    ? [profile.nombre, profile.apellido].filter(Boolean).join(' ')
    : 'Usuario'

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        {isAdmin && tiendas && tiendas.length > 1 ? (
          <div className="relative">
            <button
              onClick={() => setStoreOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Store className="w-4 h-4 text-gray-500" />
              {activeTienda?.nombre ?? 'Seleccionar tienda'}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {storeOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {tiendas.map((tienda) => (
                  <button
                    key={tienda.id}
                    onClick={() => { setActiveTienda(tienda); setStoreOpen(false) }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
                      activeTienda?.id === tienda.id ? 'text-brand-700 font-medium' : 'text-gray-700'
                    )}
                  >
                    {tienda.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm font-medium text-gray-700">{activeTienda?.nombre}</span>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setUserOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700">{displayName}</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
        {userOpen && (
          <div className="absolute top-full right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 capitalize">{profile?.rol}</p>
            </div>
            <button
              onClick={signOut}
              className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
