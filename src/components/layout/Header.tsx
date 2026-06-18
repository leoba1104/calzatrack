import { useAuth } from '@/hooks/useAuth'

export function Header() {
  const { profile } = useAuth()

  const displayName = profile
    ? [profile.nombre, profile.apellido].filter(Boolean).join(' ')
    : null

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-end px-6 shrink-0">
      {displayName && (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700">{displayName}</span>
        </div>
      )}
    </header>
  )
}
