import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { Spinner } from '@/components/ui'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { EmpleadoPortalPage } from '@/pages/EmpleadoPortalPage'
import { EmpleadosPage } from '@/pages/rrhh/EmpleadosPage'
import { TurnosPage } from '@/pages/rrhh/TurnosPage'
import { LicenciasPage } from '@/pages/rrhh/LicenciasPage'
import { MediacionesPage } from '@/pages/rrhh/MediacionesPage'
import { GasesPage } from '@/pages/insumos/GasesPage'
import { StockPage } from '@/pages/insumos/StockPage'
import { AlertasPage } from '@/pages/insumos/AlertasPage'
import { ProveedoresPage } from '@/pages/insumos/ProveedoresPage'
import { MovimientosPage } from '@/pages/insumos/MovimientosPage'
import { CapacitacionesPage } from '@/pages/rrhh/CapacitacionesPage'
import { PresentismoPage } from '@/pages/rrhh/PresentismoPage'
import { CatalogoPrestacionesPage } from '@/pages/prestaciones/CatalogoPrestacionesPage'
import { CobrosPrestacionesPage } from '@/pages/prestaciones/CobrosPrestacionesPage'
import { ResumenPrestacionesPage } from '@/pages/prestaciones/ResumenPrestacionesPage'

// Roles que usan el portal
const ROLES_PORTAL = ['empleado','administrativo','enfermeria','instrumentadora','referente_empleados','referente_enfermeria','referente_instrumentadores','mediador']
// Roles que acceden al panel admin RRHH completo
const ROLES_ADMIN = ['admin','rrhh']
// Roles que acceden a insumos/gases en panel admin
const ROLES_INSUMOS = ['admin','referente_enfermeria','referente_instrumentadores']
// Roles que acceden a prestaciones en panel admin
const ROLES_PRESTACIONES = ['admin','rrhh','administrativo','enfermeria','instrumentadora','referente_enfermeria','referente_instrumentadores']

function useAuthGuard() {
  const { usuario, loading } = useAuth()
  return { usuario, loading }
}

function Loader() {
  return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={36} /></div>
}

// Rutas admin/rrhh — dashboard, empleados, turnos, licencias etc.
function Protected({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuthGuard()
  if (loading) return <Loader />
  if (!usuario) return <Navigate to="/login" replace />
  if (ROLES_PORTAL.includes(usuario.rol)) return <Navigate to="/mi-portal" replace />
  if (!ROLES_ADMIN.includes(usuario.rol)) return <Navigate to="/" replace />
  return <AppLayout>{children}</AppLayout>
}

// Rutas insumos — solo admin y referentes
function InsumoProtected({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuthGuard()
  if (loading) return <Loader />
  if (!usuario) return <Navigate to="/login" replace />
  if (ROLES_PORTAL.includes(usuario.rol)) return <Navigate to="/mi-portal" replace />
  if (!ROLES_INSUMOS.includes(usuario.rol)) return <Navigate to="/" replace />
  return <AppLayout>{children}</AppLayout>
}

// Rutas prestaciones
function PrestacionesProtected({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuthGuard()
  if (loading) return <Loader />
  if (!usuario) return <Navigate to="/login" replace />
  if (ROLES_PORTAL.includes(usuario.rol)) return <Navigate to="/mi-portal" replace />
  if (!ROLES_PRESTACIONES.includes(usuario.rol)) return <Navigate to="/" replace />
  return <AppLayout>{children}</AppLayout>
}

// Portal — para todos los roles de portal
function PortalProtected({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuthGuard()
  if (loading) return <Loader />
  if (!usuario) return <Navigate to="/login" replace />
  return <AppLayout>{children}</AppLayout>
}

// Dashboard — para admin/rrhh, resto va a su lugar
function DashboardProtected({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuthGuard()
  if (loading) return <Loader />
  if (!usuario) return <Navigate to="/login" replace />
  if (ROLES_PORTAL.includes(usuario.rol)) return <Navigate to="/mi-portal" replace />
  if (ROLES_PRESTACIONES.includes(usuario.rol) && !ROLES_ADMIN.includes(usuario.rol)) return <Navigate to="/prestaciones/cobros" replace />
  return <AppLayout>{children}</AppLayout>
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardProtected><DashboardPage /></DashboardProtected>} />
        <Route path="/mi-portal" element={<PortalProtected><EmpleadoPortalPage /></PortalProtected>} />
        <Route path="/rrhh/empleados" element={<Protected><EmpleadosPage /></Protected>} />
        <Route path="/rrhh/turnos" element={<Protected><TurnosPage /></Protected>} />
        <Route path="/rrhh/licencias" element={<Protected><LicenciasPage /></Protected>} />
        <Route path="/rrhh/capacitaciones" element={<Protected><CapacitacionesPage /></Protected>} />
        <Route path="/rrhh/mediaciones" element={<Protected><MediacionesPage /></Protected>} />
        <Route path="/rrhh/presentismo" element={<Protected><PresentismoPage /></Protected>} />
        <Route path="/insumos/stock" element={<InsumoProtected><StockPage /></InsumoProtected>} />
        <Route path="/insumos/gases" element={<InsumoProtected><GasesPage /></InsumoProtected>} />
        <Route path="/insumos/movimientos" element={<InsumoProtected><MovimientosPage /></InsumoProtected>} />
        <Route path="/insumos/proveedores" element={<InsumoProtected><ProveedoresPage /></InsumoProtected>} />
        <Route path="/insumos/alertas" element={<InsumoProtected><AlertasPage /></InsumoProtected>} />
        <Route path="/prestaciones/catalogo" element={<PrestacionesProtected><CatalogoPrestacionesPage /></PrestacionesProtected>} />
        <Route path="/prestaciones/cobros" element={<PrestacionesProtected><CobrosPrestacionesPage /></PrestacionesProtected>} />
        <Route path="/prestaciones/resumen" element={<PrestacionesProtected><ResumenPrestacionesPage /></PrestacionesProtected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
