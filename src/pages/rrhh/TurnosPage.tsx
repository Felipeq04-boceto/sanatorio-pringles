import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Modal, Input, Select, Spinner, Empty } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

// ── Configuración de sectores ─────────────────────────────────────────────────
const SECTORES_FIJOS    = ['Internación','Quirófano','Limpieza','Cocina','Lavadero']
const SECTORES_FLEXIBLES = ['Administración','Imágenes']

// Tabs del calendario
const TABS = [
  { key: 'internacion', label: 'Internación',    sectores: ['Internación'] },
  { key: 'quirofano',   label: 'Quirófano',       sectores: ['Quirófano'] },
  { key: 'servicios',   label: 'Serv. Generales', sectores: ['Limpieza','Cocina','Lavadero'] },
  { key: 'admin',       label: 'Administración',  sectores: ['Administración'] },
  { key: 'imagenes',    label: 'Imágenes',        sectores: ['Imágenes'] },
]

// ── Tipos de turno ────────────────────────────────────────────────────────────
const TURNOS_FIJOS: Record<string, { label: string; color: string; entrada: string; salida: string }> = {
  manana: { label: 'Mañana (06–14)', color: '#0D9488', entrada: '06:00', salida: '14:00' },
  tarde:  { label: 'Tarde (14–22)',  color: '#D97706', entrada: '14:00', salida: '22:00' },
  noche:  { label: 'Noche (22–06)', color: '#4F46E5', entrada: '22:00', salida: '06:00' },
  franco: { label: 'Franco',         color: '#6B7280', entrada: '',      salida: ''      },
}

const TURNOS_FLEX: Record<string, { label: string; color: string; entrada: string; salida: string; partido?: boolean }> = {
  adm_manana:  { label: 'Mañana corrida (06:30–14:30)', color: '#0D9488', entrada: '06:30', salida: '14:30' },
  adm_tarde1:  { label: 'Tarde (15:00–19:00)',           color: '#D97706', entrada: '15:00', salida: '19:00' },
  adm_tarde2:  { label: 'Tarde (14:00–19:30)',           color: '#EA580C', entrada: '14:00', salida: '19:30' },
  adm_partido: { label: 'Partido (08–12 + vuelta flex)', color: '#7C3AED', entrada: '08:00', salida: '12:00', partido: true },
  franco:      { label: 'Franco',                        color: '#6B7280', entrada: '',      salida: ''      },
}

const TODOS_TURNOS: Record<string, any> = { ...TURNOS_FIJOS, ...TURNOS_FLEX }

const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const ESTADOS_PUNTUALES = [
  { value: 'programado',  label: 'Programado' },
  { value: 'presente',    label: 'Presente' },
  { value: 'ausente',     label: 'Ausente' },
  { value: 'justificado', label: 'Justificado' },
  { value: 'licencia',    label: 'Licencia' },
  { value: 'feriado',     label: 'Feriado' },
]

function esFlex(sectorNombre: string) {
  return SECTORES_FLEXIBLES.includes(sectorNombre)
}

function getTurnosParaSector(sectorNombre: string) {
  return esFlex(sectorNombre) ? TURNOS_FLEX : TURNOS_FIJOS
}

function getTurnoInfo(tipo: string) {
  return TODOS_TURNOS[tipo] ?? { label: tipo, color: '#6B7280', entrada: '', salida: '' }
}

export function TurnosPage() {
  const { usuario } = useAuth()
  const [empleados, setEmpleados] = useState<any[]>([])
  const [sectores,  setSectores]  = useState<any[]>([])
  const [turnos,    setTurnos]    = useState<any[]>([])
  const [licencias, setLicencias] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [mes,       setMes]       = useState(() => new Date().toISOString().substring(0, 7))
  const [tabActivo, setTabActivo] = useState('internacion')

  // Modal carga masiva
  const [openMasivo,   setOpenMasivo]   = useState(false)
  const [masivo,       setMasivo]       = useState<any>({ empleado_id: '', tipo_turno: '', vuelta: '', salida_tarde: '' })
  const [savingMasivo, setSavingMasivo] = useState(false)
  const [errorMasivo,  setErrorMasivo]  = useState<string|null>(null)

  // Modal edición puntual
  const [openEdit,  setOpenEdit]  = useState(false)
  const [formEdit,  setFormEdit]  = useState<any>({})
  const [saving,    setSaving]    = useState(false)

  // Modal reemplazos
  const [openReemplazos, setOpenReemplazos] = useState(false)

  const canEdit = usuario?.rol && ['admin','rrhh'].includes(usuario.rol)

  useEffect(() => { loadAll() }, [mes])

  async function loadAll() {
    setLoading(true)
    const inicioMes = mes + '-01'
    const [y, m] = mes.split('-').map(Number)
    const finMes = new Date(y, m, 0).toISOString().split('T')[0]

    const [{ data: t, error: errT }, { data: e }, { data: s }, { data: l }] = await Promise.all([
      supabase.from('turnos')
        .select('*, empleados!turnos_empleado_id_fkey(id, nombre, apellido, legajo, sector_id, sectores(nombre))')
        .gte('fecha', inicioMes).lte('fecha', finMes)
        .order('fecha'),
      supabase.from('empleados')
        .select('id, nombre, apellido, legajo, sector_id, tipo_contrato, sectores(nombre)')
        .eq('estado', 'activo').order('apellido'),
      supabase.from('sectores').select('*').order('nombre'),
      supabase.from('licencias').select('empleado_id, fecha_inicio, fecha_fin, tipo_licencia, estado').in('estado', ['aprobada', 'archivada']),
    ])
    if (errT) { console.error('ERROR TURNOS:', errT.message, errT.code, errT.hint); setLoading(false); return }
    setTurnos(t ?? [])
    setEmpleados(e ?? [])
    setSectores(s ?? [])
    setLicencias(l ?? [])
    setLoading(false)
  }

  const [y, m] = mes.split('-').map(Number)
  const hoy = new Date().toISOString().split('T')[0]

  function diasDelMes() {
    const total = new Date(y, m, 0).getDate()
    return Array.from({ length: total }, (_, i) =>
      `${mes}-${String(i + 1).padStart(2, '0')}`)
  }
  const dias = diasDelMes()
  const primerDia = new Date(y, m - 1, 1).getDay()

  // Empleados del tab activo
  const sectoresTab = TABS.find(t => t.key === tabActivo)?.sectores ?? []
  const empTab = empleados.filter(e => sectoresTab.includes((e.sectores as any)?.nombre))

  // Licencia de un empleado en una fecha
  function getLicenciaEmp(empId: string, fecha: string) {
    return licencias.find(l => l.empleado_id === empId && l.fecha_inicio <= fecha && l.fecha_fin >= fecha)
  }

  // Turno de un empleado en una fecha
  function getTurnoEmp(empId: string, fecha: string) {
    return turnos.find(t => t.empleado_id === empId && t.fecha === fecha)
  }

  // ── Carga masiva mensual ──────────────────────────────────
  const empMasivo  = empleados.find(e => e.id === masivo.empleado_id)
  const sectorNombreMasivo = (empMasivo?.sectores as any)?.nombre ?? ''
  const turnosDisp = empMasivo ? getTurnosParaSector(sectorNombreMasivo) : {}
  const tipoSel    = TODOS_TURNOS[masivo.tipo_turno]
  const esPartido  = tipoSel?.partido === true

  function toggleDia(fecha: string) {
    setMasivo((p: any) => ({
      ...p,
      dias: (p.dias ?? []).includes(fecha)
        ? p.dias.filter((d: string) => d !== fecha)
        : [...(p.dias ?? []), fecha]
    }))
  }

  function selDias(tipo: 'laborables'|'todos'|'limpiar') {
    if (tipo === 'limpiar') { setMasivo((p: any) => ({ ...p, dias: [] })); return }
    const sel = dias.filter(d => {
      const dow = new Date(d + 'T12:00:00').getDay()
      return tipo === 'todos' || (dow >= 1 && dow <= 5)
    })
    setMasivo((p: any) => ({ ...p, dias: sel }))
  }

  async function guardarMasivo() {
    setErrorMasivo(null)
    if (!masivo.empleado_id)       { setErrorMasivo('Seleccioná un empleado'); return }
    if (!masivo.tipo_turno)        { setErrorMasivo('Seleccioná el tipo de turno'); return }
    if (!(masivo.dias?.length))    { setErrorMasivo('Seleccioná al menos un día'); return }
    if (esPartido && (!masivo.vuelta || !masivo.salida_tarde)) {
      setErrorMasivo('Completá el horario de regreso y salida'); return
    }
    setSavingMasivo(true)
    const tipo = TODOS_TURNOS[masivo.tipo_turno]
    const rows = (masivo.dias as string[]).map(fecha => ({
      empleado_id: masivo.empleado_id,
      fecha,
      tipo_turno: masivo.tipo_turno,
      hora_entrada_programada: tipo.entrada || null,
      hora_salida_programada: esPartido ? masivo.salida_tarde : (tipo.salida || null),
      observaciones: esPartido ? `Partido: 08:00–12:00 / ${masivo.vuelta}–${masivo.salida_tarde}` : null,
      estado: 'programado',
    }))
    try {
      const { error } = await supabase.from('turnos').upsert(rows, { onConflict: 'empleado_id,fecha', ignoreDuplicates: false })
      if (error) { setErrorMasivo(`Error: ${error.message}`); return }
      setOpenMasivo(false)
      setMasivo({ empleado_id: '', tipo_turno: '', vuelta: '', salida_tarde: '', dias: [] })
      loadAll()
    } finally { setSavingMasivo(false) }
  }

  // ── Edición puntual ───────────────────────────────────────
  function abrirEdicion(turno: any, empleado: any, fecha: string) {
    if (!canEdit) return
    if (turno) {
      setFormEdit({ ...turno })
    } else {
      const sect = (empleado.sectores as any)?.nombre ?? ''
      const flex = esFlex(sect)
      setFormEdit({
        empleado_id: empleado.id,
        fecha,
        tipo_turno: flex ? 'adm_manana' : 'manana',
        estado: 'programado',
        hora_entrada_programada: flex ? '06:30' : '06:00',
        hora_salida_programada: flex ? '14:30' : '14:00',
      })
    }
    setOpenEdit(true)
  }

  async function guardarEdit() {
    if (!formEdit.empleado_id || !formEdit.fecha) return
    setSaving(true)
    try {
      // Excluir campos relacionales que no van en la tabla
      const { empleados: _e, sectores: _s, ...datos } = formEdit as any
      // Para franco, asegurar que las horas sean null
      if (datos.tipo_turno === 'franco') {
        datos.hora_entrada_programada = null
        datos.hora_salida_programada = null
      }
      // Convertir strings vacíos a null
      if (datos.hora_entrada_programada === '') datos.hora_entrada_programada = null
      if (datos.hora_salida_programada === '') datos.hora_salida_programada = null
      if (datos.id) {
        await supabase.from('turnos').update(datos).eq('id', datos.id)
      } else {
        await supabase.from('turnos').upsert(datos, { onConflict: 'empleado_id,fecha', ignoreDuplicates: false })
      }
      setOpenEdit(false)
      loadAll()
    } finally { setSaving(false) }
  }

  async function eliminarTurno(id: string) {
    if (!confirm('¿Eliminar este turno?')) return
    await supabase.from('turnos').delete().eq('id', id)
    setOpenEdit(false)
    loadAll()
  }

  // Color de celda según tipo de turno
  function colorCelda(turno: any) {
    if (!turno) return 'transparent'
    const info = getTurnoInfo(turno.tipo_turno)
    return info.color + '25'
  }

  function labelCorto(turno: any) {
    if (!turno) return ''
    const info = getTurnoInfo(turno.tipo_turno)
    if (turno.tipo_turno === 'franco') return 'F'
    if (turno.tipo_turno.includes('noche')) return 'N'
    if (turno.tipo_turno.includes('tarde') || turno.tipo_turno === 'tarde') return 'T'
    if (turno.tipo_turno === 'adm_partido') return 'P'
    return 'M'
  }

  const contratadosIds = new Set(empleados.filter((e: any) => e.tipo_contrato === 'contrato').map((e: any) => e.id))
  const turnosReemplazoCount = turnos.filter((t: any) => contratadosIds.has(t.empleado_id) && t.tipo_turno !== 'franco').length

  const turnosParaEdit = formEdit.empleado_id
    ? getTurnosParaSector((empleados.find(e => e.id === formEdit.empleado_id)?.sectores as any)?.nombre ?? '')
    : TODOS_TURNOS

  return (
    <Page>
      <PageHeader
        title="Turnos y asistencia"
        subtitle={`${MESES[m-1]} ${y}`}
        action={canEdit ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setOpenReemplazos(true)}>📋 Reemplazos{turnosReemplazoCount > 0 ? ` (${turnosReemplazoCount})` : ''}</Button>
            <Button variant="secondary" onClick={() => {
              setMasivo({ empleado_id: '', tipo_turno: '', vuelta: '', salida_tarde: '', dias: [] })
              setErrorMasivo(null)
              setOpenMasivo(true)
            }}>📅 Carga mensual</Button>
          </div>
        ) : undefined}
      />

      {/* Navegación de mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <Button variant="secondary" size="sm" onClick={() => { const d = new Date(y, m-2, 1); setMes(d.toISOString().substring(0,7)) }}>◀</Button>
        <span style={{ fontWeight: 700, fontSize: '16px', minWidth: 180, textAlign: 'center' }}>{MESES[m-1]} {y}</span>
        <Button variant="secondary" size="sm" onClick={() => { const d = new Date(y, m, 1); setMes(d.toISOString().substring(0,7)) }}>▶</Button>
      </div>

      {/* Tabs de sectores */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setTabActivo(tab.key)}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tabActivo === tab.key ? 700 : 400,
              color: tabActivo === tab.key ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: tabActivo === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-2px', fontSize: '13px', transition: 'all 0.15s',
            }}>
            {tab.label}
            <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-3)' }}>
              ({empTab.filter(e => sectoresTab.includes((e.sectores as any)?.nombre)).length || empTab.length})
            </span>
          </button>
        ))}
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {(['Internación','Quirófano','Limpieza'].includes(sectoresTab[0]) ? TURNOS_FIJOS : TURNOS_FLEX) &&
          Object.entries(sectoresTab[0] && SECTORES_FLEXIBLES.includes(sectoresTab[0]) ? TURNOS_FLEX : TURNOS_FIJOS).map(([k, v]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
              <span style={{ width: 12, height: 12, borderRadius: '3px', background: v.color, display: 'inline-block' }} />
              {v.label}
            </span>
          ))
        }
        {canEdit && <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-3)' }}>Click en una celda para editar</span>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={32} /></div>
      ) : empTab.length === 0 ? (
        <Empty message="No hay empleados en este sector" />
      ) : (

        <>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', fontSize: '11px', color: 'var(--text-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#EA580C', display: 'inline-block' }}></span>
            Contratado / Reemplazo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#7C3AED', display: 'inline-block' }}></span>
            Licencia
          </div>
        </div>

        // ── GRILLA EMPLEADO × DÍA ────────────────────────────
        <Card style={{ overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--slate-50)', zIndex: 2, padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: 160, fontWeight: 700, fontSize: '12px' }}>
                  Empleado
                </th>
                {dias.map(fecha => {
                  const dow = new Date(fecha + 'T12:00:00').getDay()
                  const esFind = dow === 0 || dow === 6
                  const esHoy = fecha === hoy
                  const dia = parseInt(fecha.split('-')[2])
                  return (
                    <th key={fecha} style={{
                      padding: '4px 2px', textAlign: 'center', borderBottom: '2px solid var(--border)',
                      borderRight: '1px solid var(--border)', minWidth: 34,
                      background: esHoy ? '#335955' : esFind ? 'var(--slate-100)' : 'var(--slate-50)',
                      color: esHoy ? '#fff' : esFind ? 'var(--text-3)' : 'var(--text-2)',
                      fontWeight: esHoy ? 700 : 600,
                    }}>
                      <div>{DIAS_SEMANA[dow].charAt(0)}</div>
                      <div>{dia}</div>
                    </th>
                  )
                })}
                <th style={{ padding: '8px', background: 'var(--slate-50)', borderBottom: '2px solid var(--border)', color: 'var(--text-3)', fontSize: '11px', fontWeight: 600 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {empTab.map((emp, ei) => {
                const turnosEmp = turnos.filter(t => t.empleado_id === emp.id)
                const totalTurnos = turnosEmp.filter(t => t.tipo_turno !== 'franco').length
                return (
                  <tr key={emp.id} style={{ background: ei % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 1,
                      background: ei % 2 === 0 ? 'white' : 'var(--slate-50)',
                      padding: '6px 12px', borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)', whiteSpace: 'nowrap'
                    }}>
                      <p style={{ fontWeight: 600, fontSize: '12px' }}>{emp.apellido}, {emp.nombre}</p>
                      <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Leg. {emp.legajo}</p>
                    </td>
                    {dias.map(fecha => {
                      const turno = getTurnoEmp(emp.id, fecha)
                      const lic = getLicenciaEmp(emp.id, fecha)
                      const info = turno ? getTurnoInfo(turno.tipo_turno) : null
                      const dow = new Date(fecha + 'T12:00:00').getDay()
                      const esFind = dow === 0 || dow === 6
                      return (
                        <td key={fecha}
                          onClick={() => abrirEdicion(turno, emp, fecha)}
                          title={turno ? `${info?.label}${turno.es_reemplazo ? ' · REEMPLAZO' : ''}${turno.observaciones ? ' · ' + turno.observaciones : ''}` : 'Sin turno — click para asignar'}
                          style={{
                            padding: '2px', textAlign: 'center',
                            borderBottom: '1px solid var(--border)',
                            borderRight: '1px solid var(--border)',
                            background: lic ? '#EDE9FE' : turno ? info!.color + '30' : esFind ? 'var(--slate-100)' : 'transparent',
                            cursor: canEdit ? 'pointer' : 'default',
                            transition: 'opacity 0.1s',
                          }}
                        >
                          {lic && !turno && (
                            <span style={{
                              display: 'inline-block', width: 28, height: 22, lineHeight: '22px',
                              borderRadius: '4px', background: '#7C3AED', color: '#fff',
                              fontSize: '10px', fontWeight: 700,
                            }} title={`Licencia: ${lic?.tipo_licencia}`}>
                              L
                            </span>
                          )}
                          {turno && (
                            <span style={{
                              display: 'inline-block', width: 28, height: 22, lineHeight: '22px',
                              borderRadius: '4px',
                              background: (turno.es_reemplazo || emp.tipo_contrato === 'contrato') ? '#EA580C' : lic ? '#7C3AED' : info!.color,
                              color: '#fff',
                              fontSize: '10px', fontWeight: 700,
                            }}>
                              {lic ? 'L' : labelCorto(turno)}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--accent)', fontSize: '12px' }}>
                      {totalTurnos}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
        </>
      )}

      {/* ── Modal CARGA MENSUAL ───────────────────────────── */}
      <Modal open={openMasivo} onClose={() => setOpenMasivo(false)} title="Carga mensual de turnos" width={680}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {errorMasivo && (
            <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
              <span style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {errorMasivo}</span>
            </div>
          )}

          <Select label="Empleado *" value={masivo.empleado_id}
            onChange={e => setMasivo((p: any) => ({ ...p, empleado_id: e.target.value, tipo_turno: '', dias: [] }))}>
            <option value="">Seleccionar empleado...</option>
            {TABS.map(tab => {
              const emps = empleados.filter(e => tab.sectores.includes((e.sectores as any)?.nombre))
              if (emps.length === 0) return null
              return (
                <optgroup key={tab.key} label={tab.label}>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>)}
                </optgroup>
              )
            })}
          </Select>

          {empMasivo && (
            <>
              <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
                  Tipo de turno * — sector: <strong>{sectorNombreMasivo}</strong>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {Object.entries(turnosDisp).map(([k, v]: [string, any]) => (
                    <div key={k}
                      onClick={() => setMasivo((p: any) => ({ ...p, tipo_turno: k, vuelta: '', salida_tarde: '' }))}
                      style={{
                        padding: '10px 14px', borderRadius: 'var(--radius)', cursor: 'pointer',
                        border: masivo.tipo_turno === k ? `2px solid ${v.color}` : '1px solid var(--border)',
                        background: masivo.tipo_turno === k ? v.color + '18' : 'white',
                      }}>
                      <p style={{ fontWeight: 600, fontSize: '13px', color: v.color }}>{v.label}</p>
                      {v.entrada && !v.partido && (
                        <p style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{v.entrada} → {v.salida}</p>
                      )}
                      {v.partido && <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>08:00–12:00 · vuelta flexible</p>}
                    </div>
                  ))}
                </div>
              </div>

              {esPartido && (
                <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber-800)', marginBottom: '12px' }}>⏰ Horario de regreso</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input label="Regresa a las *" type="time" value={masivo.vuelta}
                      onChange={e => setMasivo((p: any) => ({ ...p, vuelta: e.target.value }))} />
                    <Input label="Sale a las *" type="time" value={masivo.salida_tarde}
                      onChange={e => setMasivo((p: any) => ({ ...p, salida_tarde: e.target.value }))} />
                  </div>
                  {masivo.vuelta && masivo.salida_tarde && (
                    <p style={{ fontSize: '12px', color: 'var(--amber-700)', marginTop: '8px', fontWeight: 500 }}>
                      Turno completo: 08:00–12:00 / {masivo.vuelta}–{masivo.salida_tarde}
                    </p>
                  )}
                </div>
              )}

              {masivo.tipo_turno && (
                <>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)' }}>Seleccionar días:</span>
                    <Button size="sm" variant="secondary" onClick={() => selDias('laborables')}>Lun–Vie</Button>
                    <Button size="sm" variant="secondary" onClick={() => selDias('todos')}>Todos</Button>
                    <Button size="sm" variant="ghost" onClick={() => selDias('limpiar')}>Limpiar</Button>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--slate-50)' }}>
                      {DIAS_SEMANA.map(d => <div key={d} style={{ padding: '6px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)' }}>{d}</div>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                      {Array.from({ length: primerDia }).map((_, i) => (
                        <div key={`em${i}`} style={{ height: 36, borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)', background: 'var(--slate-50)' }} />
                      ))}
                      {dias.map(fecha => {
                        const sel = (masivo.dias ?? []).includes(fecha)
                        const dow = new Date(fecha + 'T12:00:00').getDay()
                        const esFind = dow === 0 || dow === 6
                        const color = tipoSel?.color ?? '#335955'
                        return (
                          <div key={fecha} onClick={() => toggleDia(fecha)}
                            style={{
                              height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                              cursor: 'pointer', fontSize: '12px', fontWeight: sel ? 700 : 400,
                              background: sel ? color : esFind ? '#FAFAFA' : 'white',
                              color: sel ? '#fff' : esFind ? 'var(--text-3)' : 'var(--text)',
                            }}>
                            {parseInt(fecha.split('-')[2])}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {(masivo.dias?.length ?? 0) > 0 && (
                    <div style={{ background: 'var(--accent-2)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                        {masivo.dias.length} días seleccionados — {tipoSel?.label}
                        {esPartido && masivo.vuelta && masivo.salida_tarde ? ` · 08:00–12:00 / ${masivo.vuelta}–${masivo.salida_tarde}` : ''}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenMasivo(false)}>Cancelar</Button>
          <Button onClick={guardarMasivo} loading={savingMasivo}
            disabled={!masivo.empleado_id || !masivo.tipo_turno || !(masivo.dias?.length)}>
            Guardar {masivo.dias?.length > 0 ? `${masivo.dias.length} turnos` : ''}
          </Button>
        </div>
      </Modal>

      {/* ── Modal EDICIÓN PUNTUAL ─────────────────────────── */}
      <Modal open={openEdit} onClose={() => setOpenEdit(false)} title="Editar turno" width={460}>
        {formEdit.empleado_id && (() => {
          const emp = empleados.find(e => e.id === formEdit.empleado_id)
          const sect = (emp?.sectores as any)?.nombre ?? ''
          const flex = esFlex(sect)
          const turnosEd = flex ? TURNOS_FLEX : TURNOS_FIJOS
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <p style={{ fontWeight: 600 }}>{emp?.apellido}, {emp?.nombre}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  {sect} · {new Date(formEdit.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>Tipo de turno</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {Object.entries(turnosEd).map(([k, v]: [string, any]) => (
                    <div key={k}
                      onClick={() => setFormEdit((p: any) => ({
                        ...p, tipo_turno: k,
                        hora_entrada_programada: v.entrada,
                        hora_salida_programada: v.partido ? '' : v.salida,
                      }))}
                      style={{
                        padding: '8px 12px', borderRadius: 'var(--radius)', cursor: 'pointer',
                        border: formEdit.tipo_turno === k ? `2px solid ${v.color}` : '1px solid var(--border)',
                        background: formEdit.tipo_turno === k ? v.color + '18' : 'white',
                      }}>
                      <p style={{ fontWeight: 600, fontSize: '12px', color: v.color }}>{v.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Hora entrada" type="time" value={formEdit.hora_entrada_programada ?? ''}
                  onChange={e => setFormEdit((p: any) => ({ ...p, hora_entrada_programada: e.target.value }))} />
                <Input label="Hora salida" type="time" value={formEdit.hora_salida_programada ?? ''}
                  onChange={e => setFormEdit((p: any) => ({ ...p, hora_salida_programada: e.target.value }))} />
              </div>

              <Select label="Estado" value={formEdit.estado ?? 'programado'}
                onChange={e => setFormEdit((p: any) => ({ ...p, estado: e.target.value }))}>
                {ESTADOS_PUNTUALES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>

              {/* Reemplazo por licencia */}
              <div style={{ background: formEdit.es_reemplazo ? '#FFF7ED' : 'var(--slate-50)', border: `1px solid ${formEdit.es_reemplazo ? '#FED7AA' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: formEdit.es_reemplazo ? '12px' : '0' }}>
                  <input
                    type="checkbox"
                    checked={!!formEdit.es_reemplazo}
                    onChange={e => setFormEdit((p: any) => ({ ...p, es_reemplazo: e.target.checked, reemplaza_empleado_id: e.target.checked ? p.reemplaza_empleado_id : null }))}
                    style={{ width: 16, height: 16, accentColor: '#EA580C' }}
                  />
                  <span style={{ fontWeight: 600, fontSize: '13px', color: formEdit.es_reemplazo ? '#EA580C' : 'var(--text-2)' }}>
                    🔄 Es reemplazo por licencia
                  </span>
                </label>
                {formEdit.es_reemplazo && (
                  <Select
                    label="Empleado que reemplaza (ausente por licencia)"
                    value={formEdit.reemplaza_empleado_id ?? ''}
                    onChange={e => setFormEdit((p: any) => ({ ...p, reemplaza_empleado_id: e.target.value || null }))}>
                    <option value="">Seleccionar empleado ausente...</option>
                    {empleados
                      .filter(e => e.id !== formEdit.empleado_id)
                      .map(e => {
                        const lic = getLicenciaEmp(e.id, formEdit.fecha)
                        return (
                          <option key={e.id} value={e.id}>
                            {e.apellido}, {e.nombre} — Leg. {e.legajo}{lic ? ` 🟣 en licencia (${lic.tipo_licencia})` : ''}
                          </option>
                        )
                      })}
                  </Select>
                )}
              </div>

              <Input label="Observaciones" value={formEdit.observaciones ?? ''}
                onChange={e => setFormEdit((p: any) => ({ ...p, observaciones: e.target.value }))}
                placeholder="Franco médico, licencia, etc." />
            </div>
          )
        })()}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
          <div>
            {formEdit.id && canEdit && (
              <Button variant="danger" onClick={() => eliminarTurno(formEdit.id)}>Eliminar</Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>Cancelar</Button>
            <Button onClick={guardarEdit} loading={saving}>Guardar</Button>
          </div>
        </div>
      </Modal>
      <Modal open={openReemplazos} onClose={() => setOpenReemplazos(false)} title={`Reemplazos — ${MESES[m-1]} ${y}`} width={600}>
        {(() => {
          const contratados = empleados.filter(e => e.tipo_contrato === 'contrato')
          const turnosReemplazo = turnos.filter(t =>
            contratados.some(c => c.id === t.empleado_id) && t.tipo_turno !== 'franco'
          )

          if (turnosReemplazo.length === 0) return (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>🔄</p>
              <p>No hay turnos de reemplazo en {MESES[m-1]}</p>
            </div>
          )

          // Agrupar por contratado

    const motivos: Record<string, number> = { vacaciones: 0, enfermedad: 0, otra: 0, sin_motivo: 0 }
    turnosReemplazo.forEach((t: any) => {
      const emp = empleados.find((e: any) => e.id === t.empleado_id)
      const lic = licencias.find((l: any) => {
        const otroEmp = empleados.find((e2: any) => e2.id === l.empleado_id)
        return otroEmp && emp && otroEmp.sector_id === emp.sector_id && l.fecha_inicio <= t.fecha && l.fecha_fin >= t.fecha
      })
      if (lic) {
        motivos[lic.tipo_licencia] = (motivos[lic.tipo_licencia] || 0) + 1
      } else {
        motivos.sin_motivo++
      }
    })

          const porContratado: Record<string, { emp: any; cantidad: number }> = {}
          turnosReemplazo.forEach(t => {
            if (!porContratado[t.empleado_id]) {
              porContratado[t.empleado_id] = {
                emp: contratados.find(c => c.id === t.empleado_id),
                cantidad: 0
              }
            }
            porContratado[t.empleado_id].cantidad++
          })

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Resumen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius)', padding: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '24px', fontWeight: 700, color: '#EA580C' }}>{turnosReemplazo.length}</p>
                  <p style={{ fontSize: '11px', color: '#9A3412' }}>Turnos de reemplazo</p>
                </div>
                <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{contratados.length}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>Enfermeros contratados</p>
                </div>
                <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{turnosReemplazo.length * 8}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>Horas a liquidar</p>
                </div>
              </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px' }}>
          <span style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius)', padding: '4px 10px' }}>🏖️ Vacaciones: <strong>{motivos.vacaciones}</strong></span>
          <span style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius)', padding: '4px 10px' }}>🤒 Enfermedad: <strong>{motivos.enfermedad}</strong></span>
          <span style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 10px' }}>📋 Otra: <strong>{motivos.otra}</strong></span>
          <span style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 10px' }}>Sin motivo asociado: <strong>{motivos.sin_motivo}</strong></span>
        </div>

              {/* Detalle por contratado */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {Object.values(porContratado).sort((a, b) => b.cantidad - a.cantidad).map(({ emp, cantidad }) => {
                  const fechas = turnosReemplazo
                    .filter(t => t.empleado_id === emp?.id)
                    .map(t => new Date(t.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }))
                  return (
                    <div key={emp?.id} style={{ border: '1px solid #FED7AA', borderRadius: 'var(--radius)', padding: '12px 14px', background: '#FFFBF5' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: '13px', color: '#EA580C' }}>
                            🔄 {emp?.apellido}, {emp?.nombre}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>Leg. {emp?.legajo}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: 700, fontSize: '20px', color: '#EA580C' }}>{cantidad}</p>
                          <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>turnos · {cantidad * 8}hs</p>
                        </div>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{fechas.join(' · ')}</p>
                    </div>
                  )
                })}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-3)' }}>
                💡 Turnos de 8 horas (06:00–14:00). Total mes: <strong style={{ color: 'var(--text)' }}>{turnosReemplazo.length} turnos · {turnosReemplazo.length * 8} horas</strong>
              </div>
            </div>
          )
        })()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button variant="secondary" onClick={() => setOpenReemplazos(false)}>Cerrar</Button>
        </div>
      </Modal>

    </Page>
  )
}
