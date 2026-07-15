import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Card, Spinner, Empty, Select, Input, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

function minutosDesde(hora: string): number {
  if (!hora) return 0
  const [h, m] = hora.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}

function diffMinutos(real: string, programada: string): number {
  return minutosDesde(real) - minutosDesde(programada)
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function PresentismoPage() {
  const { usuario } = useAuth()
  const [empleados,   setEmpleados]   = useState<any[]>([])
  const [sectores,    setSectores]    = useState<any[]>([])
  const [marcaciones, setMarcaciones] = useState<any[]>([])
  const [turnos,      setTurnos]      = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [vista,       setVista]       = useState<'diaria'|'mensual'>('diaria')
  const [fecha,       setFecha]       = useState(() => new Date().toISOString().split('T')[0])
  const [mes,         setMes]         = useState(() => new Date().toISOString().substring(0, 7))
  const [filtroSector,setFiltroSector]= useState('')
  const [filtroEmp,   setFiltroEmp]   = useState('')

  useEffect(() => { loadAll() }, [vista, fecha, mes])

  async function loadAll() {
    setLoading(true)
    const { data: emp } = await supabase.from('empleados')
      .select('id, nombre, apellido, legajo, sector_id, sectores(nombre)')
      .eq('estado', 'activo').order('apellido')
    const { data: sec } = await supabase.from('sectores').select('*').order('nombre')

    if (vista === 'diaria') {
      const [{ data: marc }, { data: turn }] = await Promise.all([
        supabase.from('marcaciones').select('*').eq('fecha', fecha).order('hora'),
        supabase.from('turnos').select('*').eq('fecha', fecha),
      ])
      setMarcaciones(marc ?? [])
      setTurnos(turn ?? [])
    } else {
      const inicioMes = mes + '-01'
      const [y, m] = mes.split('-').map(Number)
      const finMes = new Date(y, m, 0).toISOString().split('T')[0]
      const [{ data: marc }, { data: turn }] = await Promise.all([
        supabase.from('marcaciones').select('*').gte('fecha', inicioMes).lte('fecha', finMes).order('hora'),
        supabase.from('turnos').select('*').gte('fecha', inicioMes).lte('fecha', finMes),
      ])
      setMarcaciones(marc ?? [])
      setTurnos(turn ?? [])
    }

    setEmpleados(emp ?? [])
    setSectores(sec ?? [])
    setLoading(false)
  }

  function getMarcEmp(empId: string, f: string) {
    const m = marcaciones.filter(m => m.empleado_id === empId && m.fecha === f)
    return {
      entrada: m.find(x => x.tipo === 'entrada'),
      salida:  m.find(x => x.tipo === 'salida'),
    }
  }

  function getTurnoEmp(empId: string, f: string) {
    return turnos.find(t => t.empleado_id === empId && t.fecha === f)
  }

  function estadoAsistencia(empId: string, f: string) {
    const { entrada, salida } = getMarcEmp(empId, f)
    const turno = getTurnoEmp(empId, f)

    if (turno?.tipo_turno === 'franco') return { tipo: 'franco', label: 'Franco', color: '#6B7280', badge: 'slate' as const }

    if (!entrada) {
      if (turno) return { tipo: 'ausente', label: 'Ausente', color: '#DC2626', badge: 'red' as const }
      return { tipo: 'sin_turno', label: 'Sin turno', color: '#94A3B8', badge: 'slate' as const }
    }

    // Verificar tardanza (> 15 min)
    let tardanza = false
    if (turno?.hora_entrada_programada && entrada) {
      const diff = diffMinutos(entrada.hora?.substring(11, 16) ?? '', turno.hora_entrada_programada.substring(0, 5))
      if (diff > 15) tardanza = true
    }

    if (!salida) return { tipo: tardanza ? 'tarde_sin_salida' : 'sin_salida', label: tardanza ? 'Tarde / sin salida' : 'Sin salida', color: '#D97706', badge: 'amber' as const }
    if (tardanza) return { tipo: 'tardanza', label: 'Tardanza', color: '#EA580C', badge: 'amber' as const }
    return { tipo: 'presente', label: 'Presente', color: '#16A34A', badge: 'green' as const }
  }

  const empFiltrados = empleados.filter(e => {
    const matchSec = !filtroSector || e.sector_id === filtroSector
    const q = filtroEmp.toLowerCase()
    const matchEmp = !q || `${e.apellido} ${e.nombre} ${e.legajo}`.toLowerCase().includes(q)
    return matchSec && matchEmp
  })

  // Stats diarias
  const hoy = fecha
  const statsHoy = {
    presentes:  empFiltrados.filter(e => ['presente','tardanza'].includes(estadoAsistencia(e.id, hoy).tipo)).length,
    ausentes:   empFiltrados.filter(e => estadoAsistencia(e.id, hoy).tipo === 'ausente').length,
    tardanzas:  empFiltrados.filter(e => estadoAsistencia(e.id, hoy).tipo === 'tardanza').length,
    sin_salida: empFiltrados.filter(e => ['sin_salida','tarde_sin_salida'].includes(estadoAsistencia(e.id, hoy).tipo)).length,
    franco:     empFiltrados.filter(e => estadoAsistencia(e.id, hoy).tipo === 'franco').length,
  }

  // Días del mes
  const [y, m] = mes.split('-').map(Number)
  const diasMes = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) =>
    `${mes}-${String(i + 1).padStart(2, '0')}`)

  return (
    <Page>
      <PageHeader
        title="Control de presentismo"
        subtitle={vista === 'diaria'
          ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
          : `${MESES[m-1]} ${y}`}
      />

      {/* Controles */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button variant={vista === 'diaria' ? 'primary' : 'secondary'} size="sm" onClick={() => setVista('diaria')}>📋 Vista diaria</Button>
          <Button variant={vista === 'mensual' ? 'primary' : 'secondary'} size="sm" onClick={() => setVista('mensual')}>📅 Vista mensual</Button>
        </div>

        {vista === 'diaria' ? (
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: 180 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => { const d = new Date(y, m-2, 1); setMes(d.toISOString().substring(0,7)) }}>◀</Button>
            <span style={{ fontWeight: 700, minWidth: 140, textAlign: 'center' }}>{MESES[m-1]} {y}</span>
            <Button variant="secondary" size="sm" onClick={() => { const d = new Date(y, m, 1); setMes(d.toISOString().substring(0,7)) }}>▶</Button>
          </div>
        )}

        <Select value={filtroSector} onChange={e => setFiltroSector(e.target.value)} style={{ width: 200 }}>
          <option value="">Todos los sectores</option>
          {sectores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </Select>

        <Input placeholder="Buscar empleado..." value={filtroEmp} onChange={e => setFiltroEmp(e.target.value)} style={{ width: 220 }} />
      </div>

      {/* Stats diarias */}
      {vista === 'diaria' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Presentes',   value: statsHoy.presentes,  color: '#16A34A', bg: '#F0FDF4' },
            { label: 'Ausentes',    value: statsHoy.ausentes,   color: '#DC2626', bg: '#FEF2F2' },
            { label: 'Tardanzas',   value: statsHoy.tardanzas,  color: '#EA580C', bg: '#FFF7ED' },
            { label: 'Sin salida',  value: statsHoy.sin_salida, color: '#D97706', bg: '#FFFBEB' },
            { label: 'Francos',     value: statsHoy.franco,     color: '#6B7280', bg: '#F8FAFC' },
          ].map(s => (
            <Card key={s.label} style={{ padding: '14px 16px', background: s.bg, border: `1px solid ${s.color}30` }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '4px' }}>{s.label.toUpperCase()}</p>
              <p style={{ fontSize: '26px', fontWeight: 700, color: s.color }}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={32} /></div>
      ) : empFiltrados.length === 0 ? (
        <Empty message="No hay empleados" />
      ) : vista === 'diaria' ? (

        // ── VISTA DIARIA ─────────────────────────────────────
        <Card>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['Empleado','Sector','Turno prog.','Entrada','Salida','Estado','Alertas'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', background: 'var(--slate-50)', borderBottom: '2px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empFiltrados.map((emp, i) => {
                const { entrada, salida } = getMarcEmp(emp.id, fecha)
                const turno = getTurnoEmp(emp.id, fecha)
                const estado = estadoAsistencia(emp.id, fecha)
                const alertas: string[] = []

                if (estado.tipo === 'ausente') alertas.push('⚠️ Falta sin justificar')
                if (estado.tipo === 'tardanza' || estado.tipo === 'tarde_sin_salida') {
                  if (turno?.hora_entrada_programada && entrada) {
                    const diff = diffMinutos(entrada.hora?.substring(11,16) ?? '', turno.hora_entrada_programada.substring(0,5))
                    if (diff > 15) alertas.push(`🕐 ${diff} min tarde`)
                  }
                }
                if (estado.tipo === 'sin_salida' || estado.tipo === 'tarde_sin_salida') alertas.push('🚪 Sin marcar salida')
                if (entrada && !entrada.dentro_del_area) alertas.push(`📍 Fuera de área (${Math.round(entrada.distancia_metros ?? 0)}m)`)

                return (
                  <tr key={emp.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--slate-50)', borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <p style={{ fontWeight: 600 }}>{emp.apellido}, {emp.nombre}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>Leg. {emp.legajo}</p>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-2)' }}>{(emp.sectores as any)?.nombre ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-2)' }}>
                      {turno?.tipo_turno === 'franco' ? 'Franco'
                        : turno?.hora_entrada_programada
                          ? `${turno.hora_entrada_programada.substring(0,5)} — ${turno.hora_salida_programada?.substring(0,5) ?? '?'}`
                          : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {entrada ? (
                        <div>
                          <p style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#16A34A' }}>{formatHora(entrada.hora)}</p>
                          <p style={{ fontSize: '10px', color: entrada.dentro_del_area ? 'var(--text-3)' : '#D97706' }}>
                            {entrada.dentro_del_area ? '✓ En sanatorio' : `⚠️ ${Math.round(entrada.distancia_metros ?? 0)}m`}
                          </p>
                        </div>
                      ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {salida ? (
                        <p style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#DC2626' }}>{formatHora(salida.hora)}</p>
                      ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge variant={estado.badge}>{estado.label}</Badge>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '11px' }}>
                      {alertas.length > 0
                        ? <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{alertas.map((a, i) => <span key={i} style={{ color: '#D97706' }}>{a}</span>)}</div>
                        : <span style={{ color: 'var(--green-600)' }}>✓ OK</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

      ) : (

        // ── VISTA MENSUAL ─────────────────────────────────────
        <Card style={{ overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--slate-50)', zIndex: 2, padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: 160, fontWeight: 700 }}>Empleado</th>
                {diasMes.map(d => {
                  const dow = new Date(d + 'T12:00:00').getDay()
                  const esFind = dow === 0 || dow === 6
                  const esHoy = d === new Date().toISOString().split('T')[0]
                  return (
                    <th key={d} style={{ padding: '4px 2px', textAlign: 'center', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: 30,
                      background: esHoy ? '#335955' : esFind ? 'var(--slate-100)' : 'var(--slate-50)',
                      color: esHoy ? '#fff' : esFind ? 'var(--text-3)' : 'var(--text-2)', fontWeight: esHoy ? 700 : 500 }}>
                      <div style={{ fontSize: '9px' }}>{DIAS_SEMANA[dow].charAt(0)}</div>
                      <div>{parseInt(d.split('-')[2])}</div>
                    </th>
                  )
                })}
                <th style={{ padding: '8px', background: 'var(--slate-50)', borderBottom: '2px solid var(--border)', minWidth: 60, fontWeight: 700, fontSize: '10px', color: 'var(--text-3)' }}>Resumen</th>
              </tr>
            </thead>
            <tbody>
              {empFiltrados.map((emp, ei) => {
                let presentes = 0, ausentes = 0, tardanzas = 0
                return (
                  <tr key={emp.id} style={{ background: ei % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: ei % 2 === 0 ? 'white' : 'var(--slate-50)',
                      padding: '6px 12px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <p style={{ fontWeight: 600, fontSize: '11px' }}>{emp.apellido}, {emp.nombre}</p>
                      <p style={{ fontSize: '9px', color: 'var(--text-3)' }}>{(emp.sectores as any)?.nombre}</p>
                    </td>
                    {diasMes.map(d => {
                      const estado = estadoAsistencia(emp.id, d)
                      const dow = new Date(d + 'T12:00:00').getDay()
                      const esFind = dow === 0 || dow === 6
                      if (estado.tipo === 'presente') presentes++
                      if (estado.tipo === 'ausente') ausentes++
                      if (estado.tipo === 'tardanza') { presentes++; tardanzas++ }

                      const CELDA: Record<string, { bg: string; text: string; label: string }> = {
                        presente:        { bg: '#D1FAE5', text: '#065F46', label: 'P' },
                        ausente:         { bg: '#FEE2E2', text: '#991B1B', label: 'A' },
                        tardanza:        { bg: '#FFEDD5', text: '#9A3412', label: 'T' },
                        sin_salida:      { bg: '#FEF3C7', text: '#92400E', label: 'S' },
                        tarde_sin_salida:{ bg: '#FFEDD5', text: '#9A3412', label: 'TS'},
                        franco:          { bg: '#F1F5F9', text: '#64748B', label: 'F' },
                        sin_turno:       { bg: 'transparent', text: 'var(--text-3)', label: '' },
                      }
                      const c = CELDA[estado.tipo] ?? { bg: 'transparent', text: 'var(--text-3)', label: '' }

                      return (
                        <td key={d} title={`${emp.apellido} — ${d} — ${estado.label}`}
                          style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                            background: esFind && estado.tipo === 'sin_turno' ? 'var(--slate-100)' : c.bg }}>
                          {c.label && (
                            <span style={{ display: 'inline-block', width: 22, height: 18, lineHeight: '18px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, color: c.text }}>
                              {c.label}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                      <p style={{ color: '#16A34A', fontWeight: 600 }}>✓ {presentes}</p>
                      {ausentes > 0 && <p style={{ color: '#DC2626', fontWeight: 600 }}>✗ {ausentes}</p>}
                      {tardanzas > 0 && <p style={{ color: '#EA580C' }}>⏰ {tardanzas}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Leyenda */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {[
              { label: 'P - Presente', bg: '#D1FAE5', text: '#065F46' },
              { label: 'A - Ausente',  bg: '#FEE2E2', text: '#991B1B' },
              { label: 'T - Tardanza', bg: '#FFEDD5', text: '#9A3412' },
              { label: 'S - Sin salida', bg: '#FEF3C7', text: '#92400E' },
              { label: 'F - Franco',   bg: '#F1F5F9', text: '#64748B' },
            ].map(l => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                <span style={{ width: 22, height: 18, borderRadius: '3px', background: l.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: l.text }}>
                  {l.label.charAt(0)}
                </span>
                {l.label}
              </span>
            ))}
          </div>
        </Card>
      )}
    </Page>
  )
}
