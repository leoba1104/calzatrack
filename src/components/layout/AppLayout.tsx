import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAuth } from '@/hooks/useAuth'

export function AppLayout() {
  const { activeTienda, isLoading } = useAuth()

  useEffect(() => {
    const el = document.documentElement
    if (activeTienda?.prefijo) {
      el.setAttribute('data-theme', activeTienda.prefijo)
      localStorage.setItem('calzatrack_theme', activeTienda.prefijo)
    } else {
      el.removeAttribute('data-theme')
      localStorage.removeItem('calzatrack_theme')
    }
    return () => el.removeAttribute('data-theme')
  }, [activeTienda?.prefijo])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--app-bg))' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-[3px] border-brand-200 border-t-brand-600 animate-spin" />
          <p className="text-sm text-gray-400">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'rgb(var(--app-bg))' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
