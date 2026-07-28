import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Card, Select, Spinner } from '@/components/ui'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function ResumenPrestacionesPage() {
  const [cobros, setCobros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())

  useEffect(() => {
    async function load() {
      setLoading(true)
      const desde = `${anio}-${String(mes).padStart(2,'0')}-01`
      const hasta = `${anio}-${String(mes).padStart(2,'0')}-31`
      const { data } = await supabase.from('cobros_prestaciones')
        .select('*, prestaciones(nombre, area)')
        .gte('fecha', desde).lte('fecha', hasta)
        .neq('estado', 'anulado')
      setCobros(data ?? [])
      setLoading(false)
    }
    load()
  }, [mes, anio])

  // Totales generales
  const totalFacturado = cobros.reduce((acc, c) => acc + (c.monto_facturado ?? 0), 0)
  const totalCobrado   = cobros.reduce((acc, c) => acc + (c.monto_cobrado ?? 0), 0)
  const totalPendiente = cobros.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + (c.monto_facturado ?? 0), 0)

  // Por área
  const porArea: Record<string, { cantidad: number; facturado: number; cobrado: number }> = {}
  cobros.forEach(c => {
    const a = c.prestaciones?.area ?? 'Sin área'
    if (!porArea[a]) porArea[a] = { cantidad: 0, facturado: 0, cobrado: 0 }
    porArea[a].cantidad++
    porArea[a].facturado += c.monto_facturado ?? 0
    porArea[a].cobrado += c.monto_cobrado ?? 0
  })

  // Por cobertura
  const porCobertura: Record<string, { cantidad: number; facturado: number; cobrado: number }> = {}
  cobros.forEach(c => {
    const cob = c.cobertura === 'obra_social' ? 'Obra social' : c.cobertura === 'mutual' ? 'Mutual' : 'Particular'
    if (!porCobertura[cob]) porCobertura[cob] = { cantidad: 0, facturado: 0, cobrado: 0 }
    porCobertura[cob].cantidad++
    porCobertura[cob].facturado += c.monto_facturado ?? 0
    porCobertura[cob].cobrado += c.monto_cobrado ?? 0
  })

  // Por obra social
  const porOS: Record<string, { cantidad: number; facturado: number; cobrado: number }> = {}
  cobros.filter(c => c.obra_social_nombre).forEach(c => {
    const os = c.obra_social_nombre
    if (!porOS[os]) porOS[os] = { cantidad: 0, facturado: 0, cobrado: 0 }
    porOS[os].cantidad++
    porOS[os].facturado += c.monto_facturado ?? 0
    porOS[os].cobrado += c.monto_cobrado ?? 0
  })

  return (
    <Page>
      <PageHeader
        title="Resumen Económico"
        subtitle="Facturación y cobros por período"
      />

      {/* Selector de período */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', alignItems: 'center' }}>
        <Select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ width: 150 }}>
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </Select>
        <Select value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ width: 100 }}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={36} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Totales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Total facturado', valor: totalFacturado, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
              { label: 'Total cobrado',   valor: totalCobrado,   color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
              { label: 'Pendiente cobro', valor: totalPendiente, color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
              { label: 'Prestaciones',    valor: cobros.length,  color: '#335955', bg: 'var(--slate-50)', border: 'var(--border)', esNumero: true },
            ].map(t => (
              <div key={t.label} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 'var(--radius)', padding: '16px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: t.color, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</p>
                <p style={{ fontSize: '24px', fontWeight: 700, color: t.color }}>
                  {t.esNumero ? t.valor : `$${t.valor.toLocaleString('es-AR')}`}
                </p>
              </div>
            ))}
          </div>

          {/* Por área */}
          <Card>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#335955' }}>📊 Por área</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Área','Prestaciones','Facturado','Cobrado','% cobrado'].map(h => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: 'left', background: 'var(--slate-50)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(porArea).sort((a,b) => b[1].facturado - a[1].facturado).map(([area, d], i) => (
                  <tr key={area} style={{ background: i % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{area}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-2)' }}>{d.cantidad}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>${d.facturado.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#16A34A' }}>${d.cobrado.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${d.facturado > 0 ? (d.cobrado/d.facturado*100) : 0}%`, height: '100%', background: '#16A34A', borderRadius: '99px' }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', minWidth: '36px' }}>
                          {d.facturado > 0 ? Math.round(d.cobrado/d.facturado*100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Por cobertura */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Card>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#335955' }}>💳 Por cobertura</h3>
              </div>
              <div style={{ padding: '12px' }}>
                {Object.entries(porCobertura).map(([cob, d]) => (
                  <div key={cob} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '13px' }}>{cob}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{d.cantidad} prestaciones</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 600, fontSize: '13px' }}>${d.facturado.toLocaleString('es-AR')}</p>
                      <p style={{ fontSize: '11px', color: '#16A34A' }}>Cobrado: ${d.cobrado.toLocaleString('es-AR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Por obra social */}
            <Card>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#335955' }}>🏥 Por obra social</h3>
              </div>
              <div style={{ padding: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                {Object.keys(porOS).length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-3)', padding: '8px 4px' }}>Sin datos de obra social este mes</p>
                ) : (
                  Object.entries(porOS).sort((a,b) => b[1].facturado - a[1].facturado).map(([os, d]) => (
                    <div key={os} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '13px' }}>{os}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{d.cantidad} prestaciones</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 600, fontSize: '13px' }}>${d.facturado.toLocaleString('es-AR')}</p>
                        <p style={{ fontSize: '11px', color: '#16A34A' }}>Cobrado: ${d.cobrado.toLocaleString('es-AR')}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </Page>
  )
}
