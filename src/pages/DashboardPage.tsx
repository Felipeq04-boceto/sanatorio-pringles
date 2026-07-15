import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Card, StatCard, Badge, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

type Stats = {
  empleados_activos: number
  licencias_pendientes: number
  alertas_activas: number
  tubos_por_vencer: number
  certif_por_vencer: number
  mediaciones_abiertas: number
}

type AlertaRow = { id: string; mensaje: string; tipo_alerta: string; insumos: { nombre: string } | null }
type TuboRow   = { numero_serie: string; tipo_gas: string; fecha_vencimiento: string; dias_restantes: number }

export function DashboardPage() {
  const { usuario } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [alertas, setAlertas] = useState<AlertaRow[]>([])
  const [mediacionesAbiertas, setMediacionesAbiertas] = useState<any[]>([])
  const [tubos, setTubos] = useState<TuboRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    try {
      const [
        { count: empCount },
        { count: licCount },
        { count: alertCount },
        { data: tubosData },
        { count: certifCount },
        { data: alertasData },
        { count: medCount },
        { data: medData },
      ] = await Promise.all([
        supabase.from('empleados').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
        supabase.from('licencias').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
        supabase.from('alertas_stock').select('*', { count: 'exact', head: true }).eq('resuelta', false),
        supabase.from('v_tubos_por_vencer').select('numero_serie, tipo_gas, fecha_vencimiento, dias_restantes').limit(5),
        supabase.from('v_certificaciones_por_vencer').select('*', { count: 'exact', head: true }),
        supabase.from('alertas_stock').select('id, mensaje, tipo_alerta, insumos(nombre)').eq('resuelta', false).limit(5),
        supabase.from('mediaciones').select('*', { count: 'exact', head: true }).eq('estado', 'abierto'),
        supabase.from('mediaciones').select('id, tipo_conflicto, origen, fecha, empleados(nombre, apellido)').eq('estado', 'abierto').order('fecha', { ascending: false }).limit(5),
      ])

      setStats({
        empleados_activos:  empCount ?? 0,
        licencias_pendientes: licCount ?? 0,
        alertas_activas:    alertCount ?? 0,
        tubos_por_vencer:   tubosData?.length ?? 0,
        certif_por_vencer:  certifCount ?? 0,
        mediaciones_abiertas: medCount ?? 0,
      })
      setTubos((tubosData ?? []) as unknown as TuboRow[])
      setAlertas((alertasData ?? []) as unknown as AlertaRow[])
      setMediacionesAbiertas(medData ?? [])
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <Page>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}>
        <Spinner size={32} />
      </div>
    </Page>
  )

  const tipoGasLabel: Record<string, string> = {
    oxigeno: 'Oxígeno', co2: 'CO₂', oxido_nitroso: 'N₂O',
    aire_medicinal: 'Aire med.', nitrogeno: 'N₂', mezcla: 'Mezcla'
  }

  const alertaBadge = (tipo: string) => {
    if (tipo === 'stock_cero') return 'red'
    if (tipo === 'stock_minimo') return 'amber'
    return 'blue'
  }

  return (
    <Page>
      <PageHeader
        title={`Buen día, ${usuario?.nombre}`}
        subtitle="Resumen del sistema · Sanatorio Pringles"
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        <StatCard label="Empleados activos"    value={stats?.empleados_activos ?? 0}   color="var(--blue-600)" />
        <StatCard label="Licencias pendientes" value={stats?.licencias_pendientes ?? 0} color="var(--amber-600)" sub="Requieren aprobación" />
        <StatCard label="Alertas de stock"     value={stats?.alertas_activas ?? 0}      color={stats?.alertas_activas ? 'var(--red-600)' : 'var(--green-600)'} />
        <StatCard label="Tubos por vencer"     value={stats?.tubos_por_vencer ?? 0}     color="var(--amber-600)" sub="En próximos 60 días" />
        <StatCard label="Certif. por vencer"   value={stats?.certif_por_vencer ?? 0}    color="var(--teal-600)" sub="En próximos 90 días" />
        <StatCard label="Mediaciones abiertas" value={stats?.mediaciones_abiertas ?? 0}  color={stats?.mediaciones_abiertas ? 'var(--red-600)' : 'var(--green-600)'} sub="Requieren atención" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Alertas de stock */}
        <Card>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 600, fontSize: '14px' }}>Alertas de stock activas</h3>
            {stats?.alertas_activas ? <Badge variant="red">{stats.alertas_activas}</Badge> : <Badge variant="green">OK</Badge>}
          </div>
          {alertas.length === 0 ? (
            <p style={{ padding: '24px 20px', color: 'var(--text-3)', fontSize: '13px' }}>Sin alertas activas ✓</p>
          ) : (
            <div>
              {alertas.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 20px', borderBottom: '1px solid var(--border)'
                }}>
                  <Badge variant={alertaBadge(a.tipo_alerta) as any}>{a.tipo_alerta.replace(/_/g, ' ')}</Badge>
                  <span style={{ fontSize: '12px', color: 'var(--text-2)', flex: 1 }}>{a.mensaje}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Tubos por vencer */}
        <Card>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontWeight: 600, fontSize: '14px' }}>Tubos próximos a vencer</h3>
          </div>
          {tubos.length === 0 ? (
            <p style={{ padding: '24px 20px', color: 'var(--text-3)', fontSize: '13px' }}>Sin tubos por vencer en 60 días ✓</p>
          ) : (
            <div>
              {tubos.map(t => (
                <div key={t.numero_serie} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 20px', borderBottom: '1px solid var(--border)'
                }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500 }}>{t.numero_serie}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{tipoGasLabel[t.tipo_gas] ?? t.tipo_gas}</p>
                  </div>
                  <Badge variant={t.dias_restantes <= 15 ? 'red' : 'amber'}>
                    {t.dias_restantes}d restantes
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Mediaciones abiertas */}
      {mediacionesAbiertas.length > 0 && (
        <Card style={{ marginTop: '20px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 600, fontSize: '14px' }}>⚖️ Mediaciones abiertas</h3>
            <Badge variant="red">{mediacionesAbiertas.length}</Badge>
          </div>
          {mediacionesAbiertas.map((med: any) => {
            const TIPO: Record<string, string> = { laboral: 'Conflicto laboral', interpersonal: 'Conflicto interpersonal', disciplinario: 'Disciplinario', reclamo: 'Reclamo', evento_adverso: 'Evento adverso', disconformidad: 'Disconformidad', otro: 'Otro' }
            const ORIGEN: Record<string, string> = { portal_empleado: '📱 Portal', interno: '🏥 Interno', externo: '👤 Externo' }
            return (
              <div key={med.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: 500, fontSize: '13px' }}>{TIPO[med.tipo_conflicto] ?? med.tipo_conflicto}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    {med.empleados ? `${med.empleados.apellido}, ${med.empleados.nombre}` : '—'} · {ORIGEN[med.origen] ?? med.origen} · {new Date(med.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                  </p>
                </div>
                <a href="/rrhh/mediaciones" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Ver →</a>
              </div>
            )
          })}
        </Card>
      )}
    </Page>
  )
}
