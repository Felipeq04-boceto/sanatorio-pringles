import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  empleado: any
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const TURNOS_LABEL: Record<string, string> = {
  manana: 'M', tarde: 'T', noche: 'N', franco: 'F',
  adm_manana: 'M', adm_tarde1: 'T', adm_tarde2: 'T', adm_partido: 'P',
}
const TURNOS_COLOR: Record<string, string> = {
  manana: '#0D9488', tarde: '#D97706', noche: '#4F46E5', franco: '#6B7280',
  adm_manana: '#0D9488', adm_tarde1: '#D97706', adm_tarde2: '#EA580C', adm_partido: '#7C3AED',
}
const TURNOS_FIJOS_ED: Record<string, { label: string; color: string; entrada: string; salida: string }> = {
  manana: { label: 'Mañana (06–14)', color: '#0D9488', entrada: '06:00', salida: '14:00' },
  tarde:  { label: 'Tarde (14–22)',  color: '#D97706', entrada: '14:00', salida: '22:00' },
  noche:  { label: 'Noche (22–06)', color: '#4F46E5', entrada: '22:00', salida: '06:00' },
  franco: { label: 'Franco',         color: '#6B7280', entrada: '',      salida: ''      },
}
const TURNOS_FLEX_ED: Record<string, { label: string; color: string; entrada: string; salida: string; partido?: boolean }> = {
  adm_manana:  { label: 'Mañana corrida (06:30–14:30)', color: '#0D9488', entrada: '06:30', salida: '14:30' },
  adm_tarde1:  { label: 'Tarde (15:00–19:00)',           color: '#D97706', entrada: '15:00', salida: '19:00' },
  adm_tarde2:  { label: 'Tarde (14:00–19:30)',           color: '#EA580C', entrada: '14:00', salida: '19:30' },
  adm_partido: { label: 'Partido (08–12 + vuelta flex)', color: '#7C3AED', entrada: '08:00', salida: '12:00', partido: true },
  franco:      { label: 'Franco',                        color: '#6B7280', entrada: '',      salida: ''      },
}
const ESTADOS_PUNTUALES_ED = [
  { value: 'programado', label: 'Programado' }, { value: 'presente', label: 'Presente' },
  { value: 'ausente', label: 'Ausente' }, { value: 'justificado', label: 'Justificado' },
  { value: 'licencia', label: 'Licencia' }, { value: 'feriado', label: 'Feriado' },
]
const SECTORES_FLEX_ED = ['Administración', 'Imágenes']

const TABS_SECTORES: Record<string, string[]> = {
  internacion: ['Internación'],
  quirofano:   ['Quirófano','Quirófano 1','Quirófano 2','Sala de partos','Recepción del recién nacido'],
  servicios:   ['Limpieza','Cocina','Lavadero'],
  admin:       ['Administración'],
  imagenes:    ['Imágenes'],
}

export function SeccionTurnos({ empleado }: Props) {
  const { usuario } = useAuth()
  const puedeEditarTurnos = ['referente_empleados','referente_enfermeria','referente_instrumentadores','rrhh','admin'].includes(usuario?.rol ?? '')

  const [mesPortal,       setMesPortal]       = useState(() => new Date().toISOString().substring(0, 7))
  const [tabSector,       setTabSector]       = useState('internacion')
  const [turnosGeneral,   setTurnosGeneral]   = useState<any[]>([])
  const [empleadosTodos,  setEmpleadosTodos]  = useState<any[]>([])
  const [openEditTurno,   setOpenEditTurno]   = useState(false)
  const [formEditTurno,   setFormEditTurno]   = useState<any>({})
  const [savingEditTurno, setSavingEditTurno] = useState(false)

  // Carga inicial de empleados
  useEffect(() => {
    supabase.from('empleados')
      .select('id, nombre, apellido, legajo, sectores(nombre)')
      .eq('estado', 'activo').order('apellido')
      .then(({ data }) => setEmpleadosTodos(data ?? []))
  }, [])

  // Carga de turnos del mes seleccionado
  useEffect(() => {
    if (!mesPortal) return
    const inicioMes = mesPortal + '-01'
    const [y, m] = mesPortal.split('-').map(Number)
    const finMes = new Date(y, m, 0).toISOString().split('T')[0]
    supabase.from('turnos')
      .select('id, empleado_id, fecha, tipo_turno, estado, hora_entrada_programada, hora_salida_programada, observaciones, es_reemplazo')
      .gte('fecha', inicioMes).lte('fecha', finMes)
      .then(({ data }) => setTurnosGeneral(data ?? []))
  }, [mesPortal])

  async function recargarTurnosMes() {
    const inicioMes = mesPortal + '-01'
    const [yy, mm] = mesPortal.split('-').map(Number)
    const finMes = new Date(yy, mm, 0).toISOString().split('T')[0]
    const { data } = await supabase.from('turnos')
      .select('id, empleado_id, fecha, tipo_turno, estado, hora_entrada_programada, hora_salida_programada, observaciones, es_reemplazo')
      .gte('fecha', inicioMes).lte('fecha', finMes)
    setTurnosGeneral(data ?? [])
  }

  function abrirEdicionTurno(turno: any, emp: any, fecha: string) {
    if (!puedeEditarTurnos) return
    const sect = (emp.sectores as any)?.nombre ?? ''
    const flex = SECTORES_FLEX_ED.includes(sect)
    if (turno) {
      setFormEditTurno({ ...turno, _emp: emp })
    } else {
      setFormEditTurno({
        empleado_id: emp.id, fecha,
        tipo_turno: flex ? 'adm_manana' : 'manana',
        hora_entrada_programada: flex ? '06:30' : '06:00',
        hora_salida_programada: flex ? '14:30' : '14:00',
        estado: 'programado', _emp: emp,
      })
    }
    setOpenEditTurno(true)
  }

  async function guardarEditTurno() {
    if (!formEditTurno.empleado_id || !formEditTurno.fecha) return
    setSavingEditTurno(true)
    try {
      const { _emp, empleados: _e, sectores: _s, ...datos } = formEditTurno
      if (datos.tipo_turno === 'franco') { datos.hora_entrada_programada = null; datos.hora_salida_programada = null }
      if (datos.hora_entrada_programada === '') datos.hora_entrada_programada = null
      if (datos.hora_salida_programada === '') datos.hora_salida_programada = null
      if (datos.id) {
        await supabase.from('turnos').update(datos).eq('id', datos.id)
      } else {
        await supabase.from('turnos').upsert(datos, { onConflict: 'empleado_id,fecha', ignoreDuplicates: false })
      }
      setOpenEditTurno(false)
      await recargarTurnosMes()
    } finally { setSavingEditTurno(false) }
  }

  async function eliminarTurnoPortal(id: string) {
    if (!confirm('¿Eliminar este turno?')) return
    await supabase.from('turnos').delete().eq('id', id)
    setOpenEditTurno(false)
    await recargarTurnosMes()
  }

  const [y, m] = mesPortal.split('-').map(Number)
  const totalDias = new Date(y, m, 0).getDate()
  const dias = Array.from({ length: totalDias }, (_, i) => `${mesPortal}-${String(i + 1).padStart(2, '0')}`)
  const sectoresActivos = TABS_SECTORES[tabSector] ?? []
  const empsFiltrados = empleadosTodos.filter((emp: any) => sectoresActivos.includes((emp.sectores as any)?.nombre))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Nav mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => { const d = new Date(y, m - 2, 1); setMesPortal(d.toISOString().substring(0, 7)) }}
          style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer' }}>◀</button>
        <span style={{ fontWeight: 700, fontSize: '15px', minWidth: 160, textAlign: 'center' }}>{MESES[m - 1]} {y}</span>
        <button onClick={() => { const d = new Date(y, m, 1); setMesPortal(d.toISOString().substring(0, 7)) }}
          style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer' }}>▶</button>
      </div>

      {/* Tabs de sectores */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border)', marginBottom: '16px' }}>
        {[
          { key: 'internacion', label: 'Internación' },
          { key: 'quirofano',   label: 'Quirófano' },
          { key: 'servicios',   label: 'Serv. Generales' },
          { key: 'admin',       label: 'Administración' },
          { key: 'imagenes',    label: 'Imágenes' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setTabSector(tab.key)}
            style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tabSector === tab.key ? 700 : 400,
              color: tabSector === tab.key ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: tabSector === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-2px', fontSize: '12px' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {puedeEditarTurnos && (
        <p style={{ fontSize: '11px', color: 'var(--text-3)', textAlign: 'right', marginBottom: '4px' }}>Click en una celda para editar</p>
      )}

      <Card style={{ overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--slate-50)', zIndex: 2, padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: 140, fontWeight: 700 }}>Empleado</th>
              {dias.map(fecha => {
                const dow = new Date(fecha + 'T12:00:00').getDay()
                const esFind = dow === 0 || dow === 6
                const esHoy = fecha === new Date().toISOString().split('T')[0]
                return (
                  <th key={fecha} style={{ padding: '4px 2px', textAlign: 'center', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: 28,
                    background: esHoy ? '#335955' : esFind ? 'var(--slate-100)' : 'var(--slate-50)',
                    color: esHoy ? '#fff' : esFind ? 'var(--text-3)' : 'var(--text-2)', fontWeight: esHoy ? 700 : 600 }}>
                    <div style={{ fontSize: '9px' }}>{'DLMXJVS'[dow]}</div>
                    <div>{parseInt(fecha.split('-')[2])}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {empsFiltrados.map((emp: any, ei: number) => (
              <tr key={emp.id} style={{ background: ei % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: ei % 2 === 0 ? 'white' : 'var(--slate-50)',
                  padding: '4px 12px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  <p style={{ fontWeight: emp.id === empleado?.id ? 700 : 400, fontSize: '11px', color: emp.id === empleado?.id ? 'var(--accent)' : 'var(--text)' }}>
                    {emp.apellido}, {emp.nombre}
                  </p>
                  <p style={{ fontSize: '9px', color: 'var(--text-3)' }}>{(emp.sectores as any)?.nombre}</p>
                </td>
                {dias.map(fecha => {
                  const turno = turnosGeneral.find((t: any) => t.empleado_id === emp.id && t.fecha === fecha)
                  const color = turno ? (TURNOS_COLOR[turno.tipo_turno] ?? '#6B7280') : null
                  const label = turno ? (TURNOS_LABEL[turno.tipo_turno] ?? '?') : null
                  const dow = new Date(fecha + 'T12:00:00').getDay()
                  const esFind = dow === 0 || dow === 6
                  return (
                    <td key={fecha}
                      onClick={() => puedeEditarTurnos && abrirEdicionTurno(turno ?? null, emp, fecha)}
                      style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                        background: turno ? color + '25' : esFind ? 'var(--slate-100)' : 'transparent',
                        cursor: puedeEditarTurnos ? 'pointer' : 'default' }}>
                      {turno && (
                        <span style={{ display: 'inline-block', width: 22, height: 18, lineHeight: '18px', borderRadius: '3px',
                          background: color!, color: '#fff', fontSize: '9px', fontWeight: 700 }}>
                          {label}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[['#0D9488','M - Mañana'],['#D97706','T - Tarde'],['#4F46E5','N - Noche'],['#7C3AED','P - Partido'],['#6B7280','F - Franco']].map(([c,l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
            <span style={{ width: 12, height: 12, borderRadius: '2px', background: c, display: 'inline-block' }} />{l}
          </span>
        ))}
      </div>

      {/* Modal edición puntual de turno */}
      {openEditTurno && formEditTurno.empleado_id && (() => {
        const empEd = formEditTurno._emp ?? empleadosTodos.find((e: any) => e.id === formEditTurno.empleado_id)
        const sect = (empEd?.sectores as any)?.nombre ?? ''
        const flex = SECTORES_FLEX_ED.includes(sect)
        const turnosEd = flex ? TURNOS_FLEX_ED : TURNOS_FIJOS_ED
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontWeight: 700 }}>Editar turno</h3>
                <button onClick={() => setOpenEditTurno(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-3)' }}>✕</button>
              </div>
              <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <p style={{ fontWeight: 600, fontSize: '13px' }}>{empEd?.apellido}, {empEd?.nombre}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  {sect} · {new Date(formEditTurno.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>Tipo de turno</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {Object.entries(turnosEd).map(([k, v]: [string, any]) => (
                    <div key={k}
                      onClick={() => setFormEditTurno((p: any) => ({ ...p, tipo_turno: k, hora_entrada_programada: v.entrada, hora_salida_programada: v.partido ? '' : v.salida }))}
                      style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        border: formEditTurno.tipo_turno === k ? `2px solid ${v.color}` : '1px solid var(--border)',
                        background: formEditTurno.tipo_turno === k ? v.color + '18' : 'white' }}>
                      <p style={{ fontWeight: 600, fontSize: '12px', color: v.color }}>{v.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Hora entrada</label>
                  <input type="time" value={formEditTurno.hora_entrada_programada ?? ''}
                    onChange={e => setFormEditTurno((p: any) => ({ ...p, hora_entrada_programada: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' as any }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Hora salida</label>
                  <input type="time" value={formEditTurno.hora_salida_programada ?? ''}
                    onChange={e => setFormEditTurno((p: any) => ({ ...p, hora_salida_programada: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' as any }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Estado</label>
                <select value={formEditTurno.estado ?? 'programado'}
                  onChange={e => setFormEditTurno((p: any) => ({ ...p, estado: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px' }}>
                  {ESTADOS_PUNTUALES_ED.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Observaciones</label>
                <input value={formEditTurno.observaciones ?? ''} onChange={e => setFormEditTurno((p: any) => ({ ...p, observaciones: e.target.value }))}
                  placeholder="Franco médico, licencia, etc."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' as any }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <div>
                  {formEditTurno.id && (
                    <button onClick={() => eliminarTurnoPortal(formEditTurno.id)}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                      Eliminar
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setOpenEditTurno(false)}
                    style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={guardarEditTurno} disabled={savingEditTurno}
                    style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                    {savingEditTurno ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
