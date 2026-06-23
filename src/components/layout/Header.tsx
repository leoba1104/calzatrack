import { Printer } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePrinter } from '@/hooks/usePrinter'
import { cn } from '@/lib/utils'

const rolLabel: Record<string, string> = {
  admin:    'Administrador',
  owner:    'Dueño',
  employee: 'Empleado',
}

export function Header() {
  const { profile } = useAuth()
  const { isConnected, isConnecting, connect, disconnect } = usePrinter()

  const displayName = profile
    ? [profile.nombre, profile.apellido].filter(Boolean).join(' ')
    : null

  if (!displayName) return <div className="h-14 shrink-0" />

  const rolText = profile?.rol ? (rolLabel[profile.rol] ?? profile.rol) : ''

  return (
    <header className="h-14 flex items-center justify-end px-6 shrink-0 gap-3">

      {/* Printer status button */}
      <button
        onClick={isConnected ? disconnect : connect}
        disabled={isConnecting}
        title={isConnected ? 'Impresora conectada — clic para desconectar' : 'Conectar impresora térmica'}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        <Printer className={cn('w-5 h-5', isConnected ? 'text-green-600' : 'text-gray-400')} />
        <span className={cn(
          'absolute top-1 right-1 w-2 h-2 rounded-full border-2 border-white',
          isConnected ? 'bg-green-500' : 'bg-gray-300'
        )} />
      </button>

      {/* User info */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{displayName}</p>
          {rolText && <p className="text-xs text-gray-500 leading-tight">{rolText}</p>}
        </div>
        <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
