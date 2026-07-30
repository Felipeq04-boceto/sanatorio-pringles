import React from 'react'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Modal, Input, Spinner, Empty, Select } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const TIPO_MEDIACION: Record<string, string> = {
  laboral: 'Conflicto laboral',
  interpersonal: 'Conflicto interpersonal',
  disciplinario: 'Disciplinario',
  reclamo: 'Reclamo',
  evento_adverso: 'Evento adverso',
  disconformidad: 'Disconformidad',
  otro: 'Otro',
}

const RELACION_OPCIONES = ['Paciente', 'Familiar directo', 'Familiar', 'Acompañante', 'Representante legal', 'Otro']

const ESTADO_BADGE: Record<string, any> = {
  abierto: 'amber', en_proceso: 'blue', cerrado: 'green', derivado: 'slate',
}
const ESTADO_LABEL: Record<string, string> = {
  abierto: 'Abierto', en_proceso: 'En proceso', cerrado: 'Cerrado', derivado: 'Derivado',
}
const ORIGEN_LABEL: Record<string, string> = {
  portal_empleado: '📱 Portal empleado',
  interno: '🏥 Interno',
  externo: '👤 Externo',
  rrhh: '🏥 RRHH',
}

interface MensajeIA {
  rol: 'user' | 'assistant'
  contenido: string
}

export function MediacionesPage() {
  const { usuario } = useAuth()
  const [mediaciones,    setMediaciones]    = useState<any[]>([])
  const [empleados,      setEmpleados]      = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [casoActivo,     setCasoActivo]     = useState<any>(null)
  const [filtroEst,      setFiltroEst]      = useState('')
  const [filtroOrigen,   setFiltroOrigen]   = useState('')
  const [resolucion,     setResolucion]     = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string|null>(null)
  const [openNuevo,      setOpenNuevo]      = useState(false)
  const [tipoNuevo,      setTipoNuevo]      = useState<'interno'|'externo'>('interno')
  const [nuevoForm,      setNuevoForm]      = useState<any>({})
  const [savingNuevo,    setSavingNuevo]    = useState(false)
  const [errorNuevo,     setErrorNuevo]     = useState<string|null>(null)

  // Chat IA
  const [mensajesIA,     setMensajesIA]     = useState<MensajeIA[]>([])
  const [inputIA,        setInputIA]        = useState('')
  const [loadingIA,      setLoadingIA]      = useState(false)
  const [tabActivo,      setTabActivo]      = useState<'caso'|'ia'>('caso')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const canInicio = usuario?.rol && ['admin','mediador'].includes(usuario.rol)
  const canEdit   = usuario?.rol && ['admin','mediador','rrhh'].includes(usuario.rol)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajesIA])

  async function loadAll() {
    setLoading(true)
    const [{ data: med }, { data: emp }] = await Promise.all([
      supabase.from('mediaciones')
        .select('*, empleados(id, nombre, apellido, legajo, sectores(nombre))')
        .order('created_at', { ascending: false }),
      supabase.from('empleados')
        .select('id, nombre, apellido, legajo, sector_id, sectores(nombre)')
        .eq('estado', 'activo').order('apellido'),
    ])
    setMediaciones(med ?? [])
    setEmpleados(emp ?? [])
    setLoading(false)
  }

  function abrirCaso(med: any) {
    setCasoActivo(med)
    setResolucion(med.resolucion ?? '')
    setError(null)
    setMensajesIA([])
    setInputIA('')
    setTabActivo('caso')
  }

  function parsearIntervinientes(med: any) {
    try { return med.intervinientes ? JSON.parse(med.intervinientes) : null } catch { return null }
  }

  // ── Agente de IA ─────────────────────────────────────────
  function buildSystemPrompt(caso: any): string {
    const emp = caso.empleados
    const interv = parsearIntervinientes(caso)
    const tipo = TIPO_MEDIACION[caso.tipo_conflicto] ?? caso.tipo_conflicto
    const origen = ORIGEN_LABEL[caso.origen] ?? caso.origen

    let contexto = `Sos un asistente especializado en mediación laboral y resolución de conflictos en instituciones de salud.

CASO DE MEDIACIÓN:
- Tipo: ${tipo}
- Origen: ${origen}
- Fecha: ${caso.fecha}
- Estado: ${ESTADO_LABEL[caso.estado]}
`
    if (emp) {
      contexto += `
EMPLEADO INVOLUCRADO:
- Nombre: ${emp.apellido}, ${emp.nombre}
- Legajo: ${emp.legajo}
- Sector: ${emp.sectores?.nombre ?? 'Sin sector'}
`
    }

    if (interv?.presentante) {
      contexto += `
PRESENTANTE DEL CASO:
- Nombre: ${interv.presentante.nombre}
- Relación: ${interv.presentante.relacion}
- Teléfono: ${interv.presentante.telefono}
`
      if (interv.paciente?.nombre) {
        contexto += `- Paciente involucrado: ${interv.paciente.apellido ?? ''}, ${interv.paciente.nombre}\n`
      }
    }

    contexto += `
DESCRIPCIÓN DEL CASO:
${caso.descripcion}

Tu rol es asistir al mediador (no al empleado). Analizá el caso, sugerí estrategias de mediación, posibles resoluciones, y marco normativo aplicable si corresponde. Sé claro, conciso y profesional. Esta conversación es estrictamente confidencial y el empleado nunca la verá.`

    return contexto
  }

  async function enviarMensajeIA() {
    if (!inputIA.trim() || !casoActivo || loadingIA) return
    const msgUsuario = inputIA.trim()
    setInputIA('')
    setLoadingIA(true)

    const nuevosMensajes: MensajeIA[] = [...mensajesIA, { rol: 'user', contenido: msgUsuario }]
    setMensajesIA(nuevosMensajes)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: buildSystemPrompt(casoActivo),
          messages: nuevosMensajes.map(m => ({
            role: m.rol,
            content: m.contenido,
          })),
        }),
      })

      const data = await response.json()
      const respuesta = data.content?.[0]?.text ?? 'No se pudo obtener respuesta.'
      setMensajesIA([...nuevosMensajes, { rol: 'assistant', contenido: respuesta }])
    } catch (_e) {
      setMensajesIA([...nuevosMensajes, { rol: 'assistant', contenido: '⚠️ Error al conectar con el asistente. Intentá de nuevo.' }])
    } finally {
      setLoadingIA(false)
    }
  }

  async function eliminarCaso(id: string) {
    if (!confirm('¿Eliminar este caso? Esta acción no se puede deshacer.')) return
    const { error } = await supabase.from('mediaciones').delete().eq('id', id)
    if (error) { setError(`Error: ${error.message}`); return }
    setCasoActivo(null)
    loadAll()
  }

  async function cambiarEstado(id: string, estado: string) {
    setError(null)
    const { error: err } = await supabase.from('mediaciones').update({ estado }).eq('id', id)
    if (err) { setError(`Error: ${err.message}`); return }
    setCasoActivo((p: any) => p ? { ...p, estado } : p)
    loadAll()
  }

  async function guardarResolucion() {
    if (!casoActivo || !resolucion.trim()) return
    setError(null)
    setSaving(true)
    try {
      const { error: err } = await supabase.from('mediaciones').update({
        resolucion: resolucion.trim(),
        estado: 'cerrado',
        fecha_resolucion: new Date().toISOString().split('T')[0],
        mediador_id: usuario?.id,
      }).eq('id', casoActivo.id)
      if (err) { setError(`Error: ${err.message}`); return }
      setCasoActivo((p: any) => p ? { ...p, resolucion: resolucion.trim(), estado: 'cerrado' } : p)
      loadAll()
    } finally { setSaving(false) }
  }

  async function crearCaso() {
    setErrorNuevo(null)
    if (!nuevoForm.tipo_conflicto) { setErrorNuevo('Seleccioná el tipo de caso'); return }
    if (!nuevoForm.descripcion || nuevoForm.descripcion.trim().length < 10) { setErrorNuevo('Describí el caso con más detalle'); return }
    if (tipoNuevo === 'interno' && !nuevoForm.empleado_id) { setErrorNuevo('Seleccioná el empleado involucrado'); return }
    if (tipoNuevo === 'externo' && (!nuevoForm.contacto_nombre || !nuevoForm.contacto_telefono)) { setErrorNuevo('Completá nombre y teléfono del presentante'); return }
    setSavingNuevo(true)
    try {
      const row: any = {
        tipo_conflicto: nuevoForm.tipo_conflicto,
        descripcion: nuevoForm.descripcion,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'abierto',
        confidencial: true,
        origen: tipoNuevo,
        mediador_id: usuario?.id,
      }
      if (tipoNuevo === 'interno') {
        row.empleado_id = nuevoForm.empleado_id
      } else {
        row.intervinientes = JSON.stringify({
          presentante: { nombre: nuevoForm.contacto_nombre, telefono: nuevoForm.contacto_telefono, email: nuevoForm.contacto_email ?? '', relacion: nuevoForm.contacto_relacion ?? '' },
          paciente: { nombre: nuevoForm.paciente_nombre ?? '', apellido: nuevoForm.paciente_apellido ?? '' },
        })
      }
      const { error: err } = await supabase.from('mediaciones').insert(row)
      if (err) { setErrorNuevo(`Error: ${err.message}`); return }
      setOpenNuevo(false)
      setNuevoForm({})
      loadAll()
    } finally { setSavingNuevo(false) }
  }

  const filtradas = mediaciones.filter(m => {
    const matchEst = !filtroEst || m.estado === filtroEst
    const matchOr  = !filtroOrigen || m.origen === filtroOrigen
    return matchEst && matchOr
  })

  const stats = {
    abiertos:   mediaciones.filter(m => m.estado === 'abierto').length,
    en_proceso: mediaciones.filter(m => m.estado === 'en_proceso').length,
    cerrados:   mediaciones.filter(m => m.estado === 'cerrado').length,
  }

  return (
    <Page>
      <PageHeader
        title="Mediaciones"
        subtitle={`${mediaciones.length} casos totales`}
        action={canInicio ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => { setTipoNuevo('externo'); setNuevoForm({}); setErrorNuevo(null); setOpenNuevo(true) }}>+ Caso externo</Button>
            <Button onClick={() => { setTipoNuevo('interno'); setNuevoForm({}); setErrorNuevo(null); setOpenNuevo(true) }}>+ Caso interno</Button>
          </div>
        ) : undefined}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Abiertos',   value: stats.abiertos,   color: '#D97706', bg: '#FFFBEB', key: 'abierto' },
          { label: 'En proceso', value: stats.en_proceso, color: '#2563EB', bg: '#EFF6FF', key: 'en_proceso' },
          { label: 'Cerrados',   value: stats.cerrados,   color: '#059669', bg: '#ECFDF5', key: 'cerrado' },
        ].map(s => (
          <Card key={s.key}
            style={{ padding: '16px 20px', cursor: 'pointer', border: filtroEst === s.key ? `2px solid ${s.color}` : '1px solid var(--border)', background: filtroEst === s.key ? s.bg : 'white' }}
            onClick={() => setFiltroEst(filtroEst === s.key ? '' : s.key)}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>{s.label.toUpperCase()}</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Filtros origen */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['', 'portal_empleado', 'interno', 'externo'].map(o => (
          <Button key={o} size="sm" variant={filtroOrigen === o ? 'primary' : 'secondary'} onClick={() => setFiltroOrigen(o)}>
            {o === '' ? 'Todos los orígenes' : ORIGEN_LABEL[o]}
          </Button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={32} /></div>
      ) : filtradas.length === 0 ? (
        <Empty message="No hay casos de mediación" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtradas.map(med => {
            const emp = med.empleados
            const interv = parsearIntervinientes(med)
            return (
              <Card key={med.id} style={{ cursor: 'pointer' }} onClick={() => abrirCaso(med)}>
                <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <Badge variant={ESTADO_BADGE[med.estado]}>{ESTADO_LABEL[med.estado]}</Badge>
                      <Badge variant="slate">{ORIGEN_LABEL[med.origen] ?? med.origen}</Badge>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{TIPO_MEDIACION[med.tipo_conflicto] ?? med.tipo_conflicto}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{med.descripcion}</p>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      {emp && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>👤 {emp.apellido}, {emp.nombre} — Leg. {emp.legajo}{emp.sectores?.nombre ? ` · ${emp.sectores.nombre}` : ''}</span>}
                      {interv?.presentante && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>👤 {interv.presentante.nombre} ({interv.presentante.relacion})</span>}
                      <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{new Date(med.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                    </div>
                  </div>
                  {med.resolucion && <span style={{ fontSize: '11px', color: 'var(--green-600)', fontWeight: 600, whiteSpace: 'nowrap' }}>✅ Resuelto</span>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Modal CASO + IA ───────────────────────────────── */}
      <Modal open={!!casoActivo} onClose={() => setCasoActivo(null)} title="Caso de mediación" width={700}>
        {casoActivo && (() => {
          const emp = casoActivo.empleados
          const interv = parsearIntervinientes(casoActivo)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid var(--border)' }}>
                {[
                  { key: 'caso', label: '📋 Detalle del caso' },
                  { key: 'ia',   label: '🤖 Asistente de mediación' },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setTabActivo(tab.key as any)}
                    style={{
                      padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
                      fontWeight: tabActivo === tab.key ? 700 : 400,
                      color: tabActivo === tab.key ? 'var(--accent)' : 'var(--text-2)',
                      borderBottom: tabActivo === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: '-2px', fontSize: '13px',
                    }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── TAB CASO ── */}
              {tabActivo === 'caso' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {error && (
                    <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                      <p style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {error}</p>
                    </div>
                  )}

                  <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '3px' }}>TIPO</p>
                      <p style={{ fontWeight: 600, fontSize: '13px' }}>{TIPO_MEDIACION[casoActivo.tipo_conflicto]}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '3px' }}>FECHA</p>
                      <p style={{ fontWeight: 500, fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
                        {new Date(casoActivo.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                      <Badge variant={ESTADO_BADGE[casoActivo.estado]}>{ESTADO_LABEL[casoActivo.estado]}</Badge>
                      <Badge variant="slate">{ORIGEN_LABEL[casoActivo.origen] ?? casoActivo.origen}</Badge>
                    </div>
                  </div>

                  {emp && (
                    <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--blue-700)', marginBottom: '4px' }}>EMPLEADO INVOLUCRADO</p>
                      <p style={{ fontWeight: 600, fontSize: '13px' }}>{emp.apellido}, {emp.nombre}</p>
                      <p style={{ fontSize: '11px', color: 'var(--blue-600)' }}>Leg. {emp.legajo} · {emp.sectores?.nombre}</p>
                    </div>
                  )}

                  {interv && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>PRESENTANTE</p>
                        <p style={{ fontWeight: 600, fontSize: '13px' }}>{interv.presentante?.nombre}</p>
                        <p style={{ fontSize: '12px', color: 'var(--text-2)' }}>{interv.presentante?.relacion}</p>
                        <p style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{interv.presentante?.telefono}</p>
                        {interv.presentante?.email && <p style={{ fontSize: '12px', color: 'var(--text-2)' }}>{interv.presentante.email}</p>}
                      </div>
                      <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>PACIENTE INVOLUCRADO</p>
                        <p style={{ fontWeight: 600, fontSize: '13px' }}>{interv.paciente?.apellido}, {interv.paciente?.nombre}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '8px' }}>DESCRIPCIÓN</p>
                    <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', fontSize: '13px', lineHeight: 1.7, maxHeight: 140, overflowY: 'auto' }}>
                      {casoActivo.descripcion}
                    </div>
                  </div>

                  {canEdit && casoActivo.estado !== 'cerrado' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)' }}>Estado:</span>
                      {casoActivo.estado === 'abierto' && <Button size="sm" variant="secondary" onClick={() => cambiarEstado(casoActivo.id, 'en_proceso')}>→ Poner en proceso</Button>}
                      {casoActivo.estado === 'en_proceso' && <Button size="sm" variant="secondary" onClick={() => cambiarEstado(casoActivo.id, 'abierto')}>← Volver a abierto</Button>}
                    </div>
                  )}

                  {canEdit && (
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '8px' }}>
                        {casoActivo.resolucion ? 'RESOLUCIÓN CARGADA' : 'CARGAR RESOLUCIÓN / PROPUESTA'}
                      </p>
                      {casoActivo.estado === 'cerrado' && casoActivo.resolucion ? (
                        <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius-sm)', padding: '14px 16px' }}>
                          <p style={{ fontSize: '13px', color: 'var(--green-900)', lineHeight: 1.7 }}>{casoActivo.resolucion}</p>
                          <p style={{ fontSize: '11px', color: 'var(--green-600)', marginTop: '8px' }}>✅ Publicada — el empleado puede verla en su portal</p>
                        </div>
                      ) : (
                        <>
                          <textarea
                            value={resolucion}
                            onChange={e => setResolucion(e.target.value)}
                            placeholder="Escribí la resolución o propuesta. Al guardar el caso se cierra y el empleado la verá en su portal."
                            rows={4}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '13px', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
                            <Button onClick={guardarResolucion} loading={saving} disabled={!resolucion.trim()}>
                              ✅ Guardar resolución y cerrar caso
                            </Button>
                            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>El empleado verá la resolución en su portal</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB IA ── */}
              {tabActivo === 'ia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--blue-800)', lineHeight: 1.5 }}>
                      🤖 <strong>Asistente confidencial de mediación.</strong> La IA tiene contexto completo del caso. Esta conversación no es visible para el empleado.
                    </p>
                  </div>

                  {/* Chat */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <div style={{ height: 320, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--slate-50)' }}>
                      {mensajesIA.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', marginTop: '40px' }}>
                          <p style={{ fontSize: '28px', marginBottom: '8px' }}>🤖</p>
                          <p>Preguntale al asistente sobre este caso.</p>
                          <p style={{ marginTop: '8px', fontSize: '12px' }}>Ejemplos: "¿Cómo abordar este conflicto?", "¿Qué resolución sugerís?", "¿Qué dice la normativa laboral?"</p>
                        </div>
                      )}
                      {mensajesIA.map((msg, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: msg.rol === 'user' ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            maxWidth: '85%', padding: '10px 14px', borderRadius: msg.rol === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                            background: msg.rol === 'user' ? 'var(--accent)' : 'white',
                            color: msg.rol === 'user' ? '#fff' : 'var(--text)',
                            fontSize: '13px', lineHeight: 1.6,
                            border: msg.rol === 'assistant' ? '1px solid var(--border)' : 'none',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {msg.contenido}
                          </div>
                        </div>
                      ))}
                      {loadingIA && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                          <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 4px', background: 'white', border: '1px solid var(--border)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animation: 'pulse 1s infinite' }} />
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animation: 'pulse 1s infinite 0.2s' }} />
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animation: 'pulse 1s infinite 0.4s' }} />
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div style={{ padding: '12px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', background: 'white' }}>
                      <input
                        value={inputIA}
                        onChange={e => setInputIA(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensajeIA() } }}
                        placeholder="Consultá sobre el caso... (Enter para enviar)"
                        disabled={loadingIA}
                        style={{ flex: 1, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }}
                      />
                      <Button onClick={enviarMensajeIA} loading={loadingIA} disabled={!inputIA.trim()}>
                        Enviar
                      </Button>
                    </div>
                  </div>

                  <p style={{ fontSize: '11px', color: 'var(--text-3)', textAlign: 'center' }}>
                    💡 Podés copiar sugerencias de la IA y pegarlas en la resolución del caso
                  </p>
                </div>
              )}
            {/* Botón eliminar */}
            {canInicio && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-start' }}>
                <Button variant="danger" size="sm" onClick={() => eliminarCaso(casoActivo.id)}>
                  🗑️ Eliminar caso
                </Button>
              </div>
            )}
            </div>
          )
        })()}
      </Modal>

      {/* ── Modal NUEVO CASO ─────────────────────────────── */}
      <Modal open={openNuevo} onClose={() => setOpenNuevo(false)} title={tipoNuevo === 'interno' ? '🏥 Nuevo caso interno' : '👤 Nuevo caso externo'} width={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorNuevo && (
            <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
              <p style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {errorNuevo}</p>
            </div>
          )}
          <Select label="Tipo de caso *" value={nuevoForm.tipo_conflicto ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, tipo_conflicto: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {Object.entries(TIPO_MEDIACION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          {tipoNuevo === 'interno' && (
            <Select label="Empleado involucrado *" value={nuevoForm.empleado_id ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, empleado_id: e.target.value }))}>
              <option value="">Seleccionar empleado...</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre} — Leg. {e.legajo} · {(e.sectores as any)?.nombre}</option>)}
            </Select>
          )}
          {tipoNuevo === 'externo' && (
            <>
              <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-2)' }}>QUIEN PRESENTA EL CASO</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <Input label="Nombre y apellido *" value={nuevoForm.contacto_nombre ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, contacto_nombre: e.target.value }))} />
                  <Select label="Relación" value={nuevoForm.contacto_relacion ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, contacto_relacion: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {RELACION_OPCIONES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <Input label="Teléfono *" type="tel" value={nuevoForm.contacto_telefono ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, contacto_telefono: e.target.value }))} />
                  <Input label="Email" type="email" value={nuevoForm.contacto_email ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, contacto_email: e.target.value }))} />
                </div>
              </div>
              <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-2)' }}>PACIENTE INVOLUCRADO</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <Input label="Nombre" value={nuevoForm.paciente_nombre ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, paciente_nombre: e.target.value }))} />
                  <Input label="Apellido" value={nuevoForm.paciente_apellido ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, paciente_apellido: e.target.value }))} />
                </div>
              </div>
            </>
          )}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Descripción del caso *</label>
            <textarea value={nuevoForm.descripcion ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, descripcion: e.target.value }))}
              placeholder="Describí con detalle qué sucedió, cuándo, y cómo afectó a las partes involucradas."
              rows={5}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '13px', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
          <Button onClick={crearCaso} loading={savingNuevo}>Crear caso</Button>
        </div>
      </Modal>
    </Page>
  )
}
