import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const navRRHH = [
  { to: '/rrhh/empleados',      label: 'Empleados',      icon: '👥' },
  { to: '/rrhh/presentismo',    label: 'Presentismo',    icon: '📊' },
  { to: '/rrhh/turnos',         label: 'Turnos',         icon: '📅' },
  { to: '/rrhh/licencias',      label: 'Licencias',      icon: '🌴' },
  { to: '/rrhh/capacitaciones', label: 'Capacitaciones', icon: '🎓' },
  { to: '/rrhh/mediaciones',    label: 'Mediaciones',    icon: '⚖️' },
  { to: '/rrhh/recibos',       label: 'Recibos sueldo', icon: '📄' },
]

const navInsumos = [
  { to: '/insumos/stock',         label: 'Stock general',  icon: '📦' },
  { to: '/insumos/enfermeria',    label: 'Enfermería',     icon: '🟢' },
  { to: '/insumos/quirofano',     label: 'Quirófano',      icon: '🔵' },
  { to: '/insumos/pedidos',       label: 'Pedidos',        icon: '📋' },
  { to: '/insumos/gases',         label: 'Gases / tubos',  icon: '🫁' },
  { to: '/insumos/movimientos',   label: 'Movimientos',    icon: '↔️' },
  { to: '/insumos/proveedores',   label: 'Proveedores',    icon: '🏭' },
  { to: '/insumos/alertas',       label: 'Alertas',        icon: '🔔' },
]

const navPrestaciones = [
  { to: '/prestaciones/catalogo', label: 'Catálogo',       icon: '🏥' },
  { to: '/prestaciones/cobros',   label: 'Cobros',         icon: '💰' },
  { to: '/prestaciones/resumen',  label: 'Resumen',        icon: '📈' },
]

// Roles que van al portal
const ROLES_PORTAL = ['empleado','administrativo','enfermeria','instrumentadora','referente_empleados','referente_enfermeria','referente_instrumentadores','mediador']
// Roles que pueden ver prestaciones en sidebar
const ROLES_PRESTACIONES = ['admin','rrhh','administrativo','enfermeria','instrumentadora','referente_enfermeria','referente_instrumentadores']
// Roles que pueden ver insumos/gases en sidebar
const ROLES_INSUMOS = ['admin','referente_enfermeria','referente_instrumentadores']
// Roles que pueden ver RRHH completo en sidebar
const ROLES_RRHH = ['admin','rrhh']

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [location.pathname, isMobile])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const rol = usuario?.rol ?? ''
  const canRRHH        = ROLES_RRHH.includes(rol)
  const canInsumos     = ROLES_INSUMOS.includes(rol)
  const canPrestaciones = ROLES_PRESTACIONES.includes(rol)
  const esPortal       = ROLES_PORTAL.includes(rol)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' }}>

      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      )}

      <aside style={{
        width: 'var(--sidebar-w)', flexShrink: 0,
        background: '#335955',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        overflow: 'auto',
        position: isMobile ? 'fixed' : 'relative',
        top: 0, left: 0, bottom: 0,
        zIndex: 50,
        transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: 'transform 0.25s ease',
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <div style={{
            flex: 1,
            background: 'white',
            borderRadius: '10px',
            padding: '6px 10px',
            display: 'flex', alignItems: 'center',
          }}>
            <img
              src="/logo.jpg"
              alt="Sanatorio Integral de la Comunidad"
              style={{ height: '38px', objectFit: 'contain', display: 'block' }}
            />
          </div>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} style={{
              background: 'none', border: 'none', color: 'rgba(174,196,180,0.8)',
              cursor: 'pointer', fontSize: '20px', padding: '4px', flexShrink: 0
            }}>✕</button>
          )}
        </div>

        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {esPortal && (
            <NavLink to="/mi-portal" style={navItemStyle}>
              {({ isActive }) => <span style={navInnerStyle(isActive)}><span>👤</span> Mi portal</span>}
            </NavLink>
          )}
          {!esPortal && (
            <NavLink to="/" end style={navItemStyle}>
              {({ isActive }) => <span style={navInnerStyle(isActive)}><span>🏠</span> Dashboard</span>}
            </NavLink>
          )}
          {canRRHH && (
            <>
              <SectionLabel>Recursos humanos</SectionLabel>
              {navRRHH.map(n => (
                <NavLink key={n.to} to={n.to} style={navItemStyle}>
                  {({ isActive }) => <span style={navInnerStyle(isActive)}><span>{n.icon}</span> {n.label}</span>}
                </NavLink>
              ))}
            </>
          )}
          {canRRHH && (
            <>
              <SectionLabel>Calidad</SectionLabel>
              <NavLink to="/encuestas" style={navItemStyle}>
                {({ isActive }) => <span style={navInnerStyle(isActive)}><span>💬</span> Encuestas</span>}
              </NavLink>
            </>
          )}
          {canInsumos && (
            <>
              <SectionLabel>Insumos</SectionLabel>
              {navInsumos
                .filter(n => {
                  if (rol === 'admin') return true
                  if (n.to === '/insumos/stock') return false // stock general solo admin
                  if (n.to === '/insumos/enfermeria') return rol === 'referente_enfermeria'
                  if (n.to === '/insumos/quirofano') return rol === 'referente_instrumentadores'
                  return true
                })
                .map(n => (
                  <NavLink key={n.to} to={n.to} style={navItemStyle}>
                    {({ isActive }) => <span style={navInnerStyle(isActive)}><span>{n.icon}</span> {n.label}</span>}
                  </NavLink>
                ))}
            </>
          )}
          {canPrestaciones && !esPortal && (
            <>
              <SectionLabel>Prestaciones</SectionLabel>
              {navPrestaciones.map(n => (
                <NavLink key={n.to} to={n.to} style={navItemStyle}>
                  {({ isActive }) => <span style={navInnerStyle(isActive)}><span>{n.icon}</span> {n.label}</span>}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div style={{
          padding: '12px', borderTop: '1px solid rgba(255,255,255,0.10)',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#AEC4B4', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: '#335955'
          }}>
            {usuario ? (usuario.nombre[0] + usuario.apellido[0]).toUpperCase() : '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#F4F0E7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {usuario?.nombre} {usuario?.apellido}
            </p>
            <p style={{ fontSize: '10px', color: 'rgba(174,196,180,0.8)', textTransform: 'capitalize' }}>{usuario?.rol?.replace(/_/g,' ')}</p>
          </div>
          <button onClick={handleLogout} title="Cerrar sesion" style={{
            background: 'none', border: 'none', color: 'rgba(174,196,180,0.7)',
            cursor: 'pointer', padding: '4px', fontSize: '16px'
          }}>⏻</button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px', background: '#335955',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            position: 'sticky', top: 0, zIndex: 30
          }}>
            <button onClick={() => setSidebarOpen(true)} style={{
              background: 'none', border: 'none', color: '#F4F0E7',
              cursor: 'pointer', fontSize: '22px', padding: '2px', lineHeight: 1
            }}>☰</button>
            <div style={{ background: 'white', borderRadius: '8px', padding: '3px 8px', display: 'flex', alignItems: 'center' }}>
              <img src="/logo.jpg" alt="Sanatorio Integral" style={{ height: '28px', objectFit: 'contain', display: 'block' }} />
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em',
      color: 'rgba(174,196,180,0.6)', padding: '16px 10px 5px',
      textTransform: 'uppercase'
    }}>{children as string}</p>
  )
}

function navItemStyle() {
  return { display: 'block', textDecoration: 'none', marginBottom: '1px' }
}

function navInnerStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '9px',
    padding: '8px 10px', borderRadius: '8px', fontSize: '13px',
    color: isActive ? '#F4F0E7' : 'rgba(174,196,180,0.75)',
    background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
    fontWeight: isActive ? 600 : 400,
    transition: 'all 0.1s',
    borderLeft: isActive ? '3px solid #AEC4B4' : '3px solid transparent',
  }
}

export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: '24px', gap: '16px', flexWrap: 'wrap'
    }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, lineHeight: 1.2, color: '#335955' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '4px' }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function Page({ children }: { children: React.ReactNode }) {
  const isMobile = window.innerWidth < 768
  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px', flex: 1 }}>
      {children}
    </div>
  )
}
