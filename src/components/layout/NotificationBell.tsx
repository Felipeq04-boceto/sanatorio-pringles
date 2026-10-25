import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Notif {
  id: string
  tipo: 'sin_stock' | 'stock_bajo' | 'pedido_pendiente' | 'licencia_por_vencer'
  titulo: string
  detalle: string
  link: string
}

const TIPO_CONFIG: Record<Notif['tipo'], { icon: string; color: string; bg: string }> = {
  sin_stock:           { icon: '🔴', color: '#dc2626', bg: '#fef2f2' },
  stock_bajo:          { icon: '🟡', color: '#d97706', bg: '#fffbeb' },
  pedido_pendiente:    { icon: '📋', color: '#2563eb', bg: '#eff6ff' },
  licencia_por_vencer: { icon: '🌴', color: '#7c3aed', bg: '#f5f3ff' },
}

export function NotificationBell({ canSee }: { canSee: boolean }) {
  const [open,    setOpen]    = useState(false)
  const [notifs,  setNotifs]  = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Cargar al montar y cada 5 minutos
  useEffect(() => {
    if (!canSee) return
    loadNotifs()
    const interval = setInterval(loadNotifs, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [canSee])

  async function loadNotifs() {
    if (!canSee) return
    setLoading(true)
    const hoy   = new Date().toISOString().split('T')[0]
    const en7   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

    const [{ data: insumos }, { data: pedidos }, { data: licencias }] = await Promise.all([
      supabase
        .from('insumos')
        .select('id, nombre, area, stock_actual, stock_minimo')
        .eq('estado', 'activo')
        .or('stock_actual.eq.0,and(stock_actual.gt.0,stock_minimo.gt.0)'),
      supabase
        .from('pedidos')
        .select('id, numero, proveedor')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('licencias')
        .select('id, empleado_id, tipo, fecha_fin, empleados(nombre, apellido)')
        .eq('estado', 'aprobada')
        .gte('fecha_fin', hoy)
        .lte('fecha_fin', en7)
        .order('fecha_fin'),
    ])

    const result: Notif[] = []

    // Sin stock
    const sinStock = (insumos ?? []).filter(i => i.stock_actual === 0)
    if (sinStock.length > 0) {
      result.push({
        id: 'sin_stock',
        tipo: 'sin_stock',
        titulo: `${sinStock.length} insumo${sinStock.length !== 1 ? 's' : ''} sin stock`,
        detalle: sinStock.slice(0, 3).map(i => i.nombre).join(', ') + (sinStock.length > 3 ? '…' : ''),
        link: '/insumos/alertas',
      })
    }

    // Stock bajo
    const stockBajo = (insumos ?? []).filter(i =>
      i.stock_actual > 0 && i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo
    )
    if (stockBajo.length > 0) {
      result.push({
        id: 'stock_bajo',
        tipo: 'stock_bajo',
        titulo: `${stockBajo.length} insumo${stockBajo.length !== 1 ? 's' : ''} con stock bajo`,
        detalle: stockBajo.slice(0, 3).map(i => i.nombre).join(', ') + (stockBajo.length > 3 ? '…' : ''),
        link: '/insumos/alertas',
      })
    }

    // Pedidos pendientes
    if ((pedidos ?? []).length > 0) {
      result.push({
        id: 'pedidos',
        tipo: 'pedido_pendiente',
        titulo: `${pedidos!.length} pedido${pedidos!.length !== 1 ? 's' : ''} pendiente${pedidos!.length !== 1 ? 's' : ''}`,
        detalle: pedidos!.slice(0, 2).map(p => `#${p.numero ?? p.id.slice(0,6)}${p.proveedor ? ` · ${p.proveedor}` : ''}`).join(', '),
        link: '/insumos/pedidos',
      })
    }

    // Licencias por vencer
    if ((licencias ?? []).length > 0) {
      result.push({
        id: 'licencias',
        tipo: 'licencia_por_vencer',
        titulo: `${licencias!.length} licencia${licencias!.length !== 1 ? 's' : ''} vence${licencias!.length === 1 ? '' : 'n'} pronto`,
        detalle: licencias!.slice(0, 2).map((l: any) => `${l.empleados?.nombre ?? ''} ${l.empleados?.apellido ?? ''} (${l.tipo})`).join(', '),
        link: '/rrhh/licencias',
      })
    }

    setNotifs(result)
    setLoading(false)
  }

  if (!canSee) return null

  const total = notifs.length

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) loadNotifs() }}
        title="Notificaciones"
        style={{
          position: 'relative',
          background: open ? 'rgba(255,255,255,0.15)' : 'none',
          border: 'none',
          color: total > 0 ? '#fbbf24' : 'rgba(174,196,180,0.7)',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          fontSize: '18px',
          lineHeight: 1,
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        🔔
        {total > 0 && (
          <span style={{
            position: 'absolute',
            top: 2, right: 2,
            minWidth: '16px', height: '16px',
            background: '#ef4444',
            color: 'white',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
          }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: '44px',
          left: 0,
          width: '300px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <p style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>Notificaciones</p>
            {!loading && (
              <button
                onClick={loadNotifs}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}
              >
                ↻ Actualizar
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              Cargando…
            </div>
          ) : notifs.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: '22px', marginBottom: '6px' }}>✅</p>
              <p style={{ fontSize: '13px', color: '#64748b' }}>Todo en orden, sin alertas</p>
            </div>
          ) : (
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {notifs.map((n, idx) => {
                const cfg = TIPO_CONFIG[n.tipo]
                return (
                  <a
                    key={n.id}
                    href={n.link}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      padding: '12px 16px',
                      borderBottom: idx < notifs.length - 1 ? '1px solid #f8fafc' : 'none',
                      textDecoration: 'none',
                      background: 'white',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '8px',
                      background: cfg.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '15px', flexShrink: 0,
                    }}>
                      {cfg.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: cfg.color, marginBottom: '2px' }}>
                        {n.titulo}
                      </p>
                      <p style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.detalle}
                      </p>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
