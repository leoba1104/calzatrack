import { useAuth } from '@/hooks/useAuth'

const rolLabel: Record<string, string> = {
  admin:    'Administrador',
  owner:    'Dueño',
  employee: 'Empleado',
}

export function Header() {
  const { profile } = useAuth()

  const displayName = profile
    ? [profile.nombre, profile.apellido].filter(Boolean).join(' ')
    : null

  if (!displayName) return <div className="h-14 shrink-0" />

  const rolText = profile?.rol ? (rolLabel[profile.rol] ?? profile.rol) : ''

  return (
    <header className="h-14 flex items-center justify-end px-6 shrink-0">
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
