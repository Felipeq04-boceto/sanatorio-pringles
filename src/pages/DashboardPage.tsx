import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Page, PageHeader } from '@/components/layout/AppLayout'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPI {
  label: string
  value: number | string
  icon: string
  color: string
  bg: string
  link?: string
  sub?: string
}

interface InsumoAlerta {
  id: string
  nombre: string
  area: string
  stock_actual: number
  stock_minimo: number
}

interface LicenciaProxima {
  id: string
  tipo: string
  fecha_fin: string
  empleados: { nombre: string; apellido: string } | null
}

interface PedidoReciente {
  id: string
  numero: string | null
  proveedor: string | null
  estado: string
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diasRestantes(fecha: string) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fin = new Date(fecha + 'T00:00:00')
  return Math.ceil((fin.getTime() - hoy.getTime()) / 86400000)
}

function formatFecha(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
}

const ESTADO_PEDIDO: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#d97706', bg: '#fffbeb' },
  aprobado:   { label: 'Aprobado',   color: '#16a34a', bg: '#f0fdf4' },
  recibido:   { label: 'Recibido',   color: '#335955', bg: '#f0fdf4' },
  cancelado:  { label: 'Cancelado',  color: '#6b7280', bg: '#f9fafb' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ kpi, onClick }: { kpi: KPI; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && onClick ? '#f8faf9' : 'white',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        borderLeft: `4px solid ${kpi.color}`,
        flex: '1 1 180px', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {kpi.label}
        </span>
        <div style={{
          width: 32, height: 32, borderRadius: '8px',
          background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>
          {kpi.icon}
        </div>
      </div>
      <p style={{ fontSize: '28px', fontWeight: 700, color: kpi.color, lineHeight: 1 }}>
        {kpi.value}
      </p>
      {kpi.sub && (
        <p style={{ fontSize: '11px', color: '#94a3b8' }}>{kpi.sub}</p>
      )}
    </div>
  )
}

function SectionCard({ title, icon, children, action }: {
  title: string; icon: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{
      background: 'white', borderRadius: '12px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>{icon}</span>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{title}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
      ✅ {msg}
    </div>
  )
}

function LinkBtn({ to, children, navigate }: { to: string; children: React.ReactNode; navigate: (p: string) => void }) {
  return (
    <button
      onClick={() => navigate(to)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: '11px', color: '#335955', fontWeight: 600, padding: 0,
      }}
    >
      {children} →
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [kpis, setKpis] = useState<{
    empleados: number
    licenciasHoy: number
    pedidosPendientes: number
    sinStock: number
    stockBajo: number
  } | null>(null)

  const [sinStock,     setSinStock]     = useState<InsumoAlerta[]>([])
  const [stockBajo,    setStockBajo]    = useState<InsumoAlerta[]>([])
  const [licencias,    setLicencias]    = useState<LicenciaProxima[]>([])
  const [pedidos,      setPedidos]      = useState<PedidoReciente[]>([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const hoy  = new Date().toISOString().split('T')[0]
    const en7  = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

    const [
      { count: empCount },
      { count: licCount },
      { count: pedCount },
      { data: insumosData },
      { data: licData },
      { data: pedData },
    ] = await Promise.all([
      supabase.from('empleados').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
      supabase.from('licencias').select('*', { count: 'exact', head: true }).eq('estado', 'aprobada').lte('fecha_inicio', hoy).gte('fecha_fin', hoy),
      supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('insumos').select('id,nombre,area,stock_actual,stock_minimo').eq('estado', 'activo'),
      supabase.from('licencias').select('id,tipo,fecha_fin,empleados(nombre,apellido)').eq('estado', 'aprobada').gte('fecha_fin', hoy).lte('fecha_fin', en7).order('fecha_fin').limit(8),
      supabase.from('pedidos').select('id,numero,proveedor,estado,created_at').order('created_at', { ascending: false }).limit(6),
    ])

    const insumos = insumosData ?? []
    const sinStockList  = insumos.filter(i => i.stock_actual === 0)
    const stockBajoList = insumos.filter(i => i.stock_actual > 0 && i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo)

    setKpis({
      empleados:        empCount ?? 0,
      licenciasHoy:     licCount ?? 0,
      pedidosPendientes: pedCount ?? 0,
      sinStock:         sinStockList.length,
      stockBajo:        stockBajoList.length,
    })
    setSinStock(sinStockList)
    setStockBajo(stockBajoList)
    setLicencias((licData ?? []) as LicenciaProxima[])
    setPedidos(pedData ?? [])
    setLoading(false)
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const hoyStr = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  const kpiList: KPI[] = kpis ? [
    {
      label: 'Empleados activos',
      value: kpis.empleados,
      icon: '👥', color: '#335955', bg: '#f0fdf4',
      link: '/rrhh/empleados',
      sub: 'en planilla',
    },
    {
      label: 'De licencia hoy',
      value: kpis.licenciasHoy,
      icon: '🌴', color: '#7c3aed', bg: '#f5f3ff',
      link: '/rrhh/licencias',
      sub: kpis.licenciasHoy === 1 ? 'empleado ausente' : 'empleados ausentes',
    },
    {
      label: 'Pedidos pendientes',
      value: kpis.pedidosPendientes,
      icon: '📋', color: '#2563eb', bg: '#eff6ff',
      link: '/insumos/pedidos',
      sub: 'sin confirmar',
    },
    {
      label: 'Insumos críticos',
      value: kpis.sinStock + kpis.stockBajo,
      icon: kpis.sinStock > 0 ? '🔴' : '🟡',
      color: kpis.sinStock > 0 ? '#dc2626' : kpis.stockBajo > 0 ? '#d97706' : '#16a34a',
      bg: kpis.sinStock > 0 ? '#fef2f2' : kpis.stockBajo > 0 ? '#fffbeb' : '#f0fdf4',
      link: '/insumos/alertas',
      sub: kpis.sinStock > 0 ? `${kpis.sinStock} sin stock · ${kpis.stockBajo} bajo mínimo` : kpis.stockBajo > 0 ? `${kpis.stockBajo} bajo mínimo` : 'todo en orden',
    },
  ] : []

  if (loading) {
    return (
      <Page>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8', fontSize: '14px' }}>
          Cargando…
        </div>
      </Page>
    )
  }

  const isMobile = window.innerWidth < 768

  return (
    <Page>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'capitalize', marginBottom: '4px' }}>{hoyStr}</p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
          {saludo}, {usuario?.nombre} 👋
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
          Resumen del día — Sanatorio Integral de la Comunidad
        </p>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px',
      }}>
        {kpiList.map(k => (
          <KPICard key={k.label} kpi={k} onClick={k.link ? () => navigate(k.link!) : undefined} />
        ))}
      </div>

      {/* Grid de secciones */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '16px',
        marginBottom: '16px',
      }}>

        {/* Insumos sin stock */}
        <SectionCard
          title="Sin stock"
          icon="🔴"
          action={<LinkBtn to="/insumos/alertas" navigate={navigate}>Ver alertas</LinkBtn>}
        >
          {sinStock.length === 0 ? (
            <EmptyState msg="Ningún insumo sin stock" />
          ) : (
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {sinStock.map((ins, i) => (
                <div key={ins.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 18px',
                  borderBottom: i < sinStock.length - 1 ? '1px solid #f8fafc' : 'none',
                }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{ins.nombre}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>{ins.area}</p>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, color: '#dc2626',
                    background: '#fef2f2', padding: '3px 8px', borderRadius: '20px',
                  }}>SIN STOCK</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Stock bajo */}
        <SectionCard
          title="Stock bajo mínimo"
          icon="🟡"
          action={<LinkBtn to="/insumos/alertas" navigate={navigate}>Ver alertas</LinkBtn>}
        >
          {stockBajo.length === 0 ? (
            <EmptyState msg="Todo el stock dentro del mínimo" />
          ) : (
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {stockBajo.map((ins, i) => (
                <div key={ins.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 18px',
                  borderBottom: i < stockBajo.length - 1 ? '1px solid #f8fafc' : 'none',
                }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{ins.nombre}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>{ins.area}</p>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: '#d97706',
                    background: '#fffbeb', padding: '3px 8px', borderRadius: '20px',
                  }}>{ins.stock_actual} / {ins.stock_minimo}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Licencias próximas */}
        <SectionCard
          title="Licencias próximas a vencer (7 días)"
          icon="🌴"
          action={<LinkBtn to="/rrhh/licencias" navigate={navigate}>Ver todas</LinkBtn>}
        >
          {licencias.length === 0 ? (
            <EmptyState msg="Sin licencias próximas a vencer" />
          ) : (
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {licencias.map((lic, i) => {
                const dias = diasRestantes(lic.fecha_fin)
                const nombre = lic.empleados ? `${lic.empleados.nombre} ${lic.empleados.apellido}` : '—'
                return (
                  <div key={lic.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 18px',
                    borderBottom: i < licencias.length - 1 ? '1px solid #f8fafc' : 'none',
                  }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{nombre}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>
                        {lic.tipo} · vence {formatFecha(lic.fecha_fin)}
                      </p>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      color: dias <= 2 ? '#dc2626' : dias <= 5 ? '#d97706' : '#16a34a',
                      background: dias <= 2 ? '#fef2f2' : dias <= 5 ? '#fffbeb' : '#f0fdf4',
                      padding: '3px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
                    }}>
                      {dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `${dias}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Pedidos recientes */}
        <SectionCard
          title="Pedidos recientes"
          icon="📋"
          action={<LinkBtn to="/insumos/pedidos" navigate={navigate}>Ver todos</LinkBtn>}
        >
          {pedidos.length === 0 ? (
            <EmptyState msg="Sin pedidos registrados" />
          ) : (
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {pedidos.map((p, i) => {
                const cfg = ESTADO_PEDIDO[p.estado] ?? { label: p.estado, color: '#64748b', bg: '#f1f5f9' }
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 18px',
                    borderBottom: i < pedidos.length - 1 ? '1px solid #f8fafc' : 'none',
                  }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>
                        {p.numero ? `#${p.numero}` : `Pedido`}{p.proveedor ? ` · ${p.proveedor}` : ''}
                      </p>
                      <p style={{ fontSize: '11px', color: '#94a3b8' }}>{formatFechaHora(p.created_at)}</p>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: cfg.color, background: cfg.bg,
                      padding: '3px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
                    }}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

      </div>
    </Page>
  )
}
