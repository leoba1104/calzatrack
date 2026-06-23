import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAuth } from '@/hooks/useAuth'

export function AppLayout() {
  const { activeTienda } = useAuth()

  useEffect(() => {
    const el = document.documentElement
    if (activeTienda?.prefijo) {
      el.setAttribute('data-theme', activeTienda.prefijo)
    } else {
      el.removeAttribute('data-theme')
    }
    return () => el.removeAttribute('data-theme')
  }, [activeTienda?.prefijo])

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
