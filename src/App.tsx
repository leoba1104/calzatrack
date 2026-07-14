import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'

// Cada página se carga bajo demanda para no inflar el bundle inicial
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const SalesPage     = lazy(() => import('@/pages/sales/SalesPage').then((m) => ({ default: m.SalesPage })))
const ClientsPage   = lazy(() => import('@/pages/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })))
const AnalyticsPage = lazy(() => import('@/pages/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const EmployeesPage = lazy(() => import('@/pages/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })))
const SuppliersPage = lazy(() => import('@/pages/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const LayawaysPage  = lazy(() => import('@/pages/layaways/LayawaysPage').then((m) => ({ default: m.LayawaysPage })))
const CreditsPage   = lazy(() => import('@/pages/credits/CreditsPage').then((m) => ({ default: m.CreditsPage })))
const PurchasesPage = lazy(() => import('@/pages/purchases/PurchasesPage').then((m) => ({ default: m.PurchasesPage })))
const ReportsPage   = lazy(() => import('@/pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

// La UI oculta estas secciones a los empleados, pero el guard evita que
// entren por URL directa. RLS sigue siendo la frontera de seguridad real.
function ManageGuard({ children }: { children: React.ReactNode }) {
  const { canManage, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!canManage) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestGuard>
                  <LoginPage />
                </GuestGuard>
              }
            />
            <Route
              path="/"
              element={
                <AuthGuard>
                  <AppLayout />
                </AuthGuard>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="sales" element={<SalesPage />} />
              <Route path="layaways" element={<LayawaysPage />} />
              <Route path="credits"  element={<CreditsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="employees" element={<ManageGuard><EmployeesPage /></ManageGuard>} />
              <Route path="suppliers" element={<ManageGuard><SuppliersPage /></ManageGuard>} />
              <Route path="purchases" element={<ManageGuard><PurchasesPage /></ManageGuard>} />
              <Route path="analytics" element={<ManageGuard><AnalyticsPage /></ManageGuard>} />
              <Route path="reports"   element={<ReportsPage />} />
              {/* Backward compat redirect */}
              <Route path="facturas" element={<Navigate to="/sales" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { fontFamily: 'Inter, system-ui, sans-serif' },
        }}
      />
    </QueryClientProvider>
  )
}
