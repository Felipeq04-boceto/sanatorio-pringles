import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Input, Select, Modal, Spinner, Empty, Textarea, StatCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

type TipoCapacitacion = 'obligatoria' | 'optativa' | 'certificacion' | 'recertificacion'
type EstadoCertif = 'vigente' | 'por_vencer' | 'vencida' | 'pendiente'

const TIPO_BADGE: Record<string, any> = { obligatoria:'red', optativa:'blue', certificacion:'teal', recertificacion:'amber' }
const TIPO_LABEL: Record<string, string> = { obligatoria:'Obligatoria', optativa:'Optativa', certificacion:'Certificación', recertificacion:'Recertificación' }
const ESTADO_BADGE: Record<string, any> = { vigente:'green', por_vencer:'amber', vencida:'red', pendiente:'slate' }

function calcEstado(fechaVenc: string | null): EstadoCertif {
  if (!fechaVenc) return 'pendiente'
  const dias = Math.ceil((new Date(fechaVenc).getTime() - new Date().getTime()) / 86400000)
  if (dias < 0) return 'vencida'
  if (dias <= 60) return 'por_vencer'
  return 'vigente'
}

export function CapacitacionesPage() {
  const { usuario } = useAuth()
  const [tab, setTab] = useState<'certificaciones'|'cursos'>('certificaciones')
  const [certifs, setCertifs] = useState<any[]>([])
  const [capacits, setCapacits] = useState<any[]>([])
  const [empleados, setEmpleados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchCert, setSearchCert] = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [searchCurso, setSearchCurso] = useState('')
  const [filtroTipoCurso, setFiltroTipoCurso] = useState('')
  const [openCertif, setOpenCertif] = useState(false)
  const [openCurso, setOpenCurso] = useState(false)
  const [editCertif, setEditCertif] = useState<any>(null)
  const [editCurso, setEditCurso] = useState<any>(null)
  const [formCertif, setFormCertif] = useState<any>({})
  const [formCurso, setFormCurso] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const canEdit = usuario?.rol && ['admin','rrhh'].includes(usuario.rol)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: c }, { data: cap }, { data: e }] = await Promise.all([
      supabase.from('certificaciones').select('*, capacitaciones(nombre,tipo,horas,institucion), empleados(nombre,apellido,legajo)').order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
      supabase.from('capacitaciones').select('*').order('nombre'),
      supabase.from('empleados').select('id,nombre,apellido,legajo').eq('estado','activo').order('apellido'),
    ])
    setCertifs((c ?? []).map((cert: any) => ({ ...cert, estado: calcEstado(cert.fecha_vencimiento) })))
    setCapacits(cap ?? [])
    setEmpleados(e ?? [])
    setLoading(false)
  }

  async function guardarCertif() {
    if (!formCertif.empleado_id || !formCertif.capacitacion_id || !formCertif.fecha_realizacion) return
    setSaving(true)
    try {
      if (editCertif) { await supabase.from('certificaciones').update(formCertif).eq('id', editCertif.id) }
      else { await supabase.from('certificaciones').insert(formCertif) }
      setOpenCertif(false); loadAll()
    } finally { setSaving(false) }
  }

  async function eliminarCertif(id: string) {
    if (!confirm('¿Eliminar esta certificación?')) return
    await supabase.from('certificaciones').delete().eq('id', id); loadAll()
  }

  async function guardarCurso() {
    if (!formCurso.nombre) return
    setSaving(true)
    try {
      if (editCurso) { await supabase.from('capacitaciones').update(formCurso).eq('id', editCurso.id) }
      else { await supabase.from('capacitaciones').insert(formCurso) }
      setOpenCurso(false); loadAll()
    } finally { setSaving(false) }
  }

  async function eliminarCurso(id: string) {
    if (!confirm('¿Eliminar este curso?')) return
    await supabase.from('capacitaciones').delete().eq('id', id); loadAll()
  }

  const certifsFiltradas = certifs.filter(c => {
    const emp = c.empleados as any
    const q = searchCert.toLowerCase()
    return (!q || [emp?.nombre,emp?.apellido,emp?.legajo,c.capacitaciones?.nombre].some((v:any) => v?.toLowerCase().includes(q)))
      && (!filtroEst || c.estado === filtroEst)
      && (!filtroTipo || c.capacitaciones?.tipo === filtroTipo)
  })

  const cursosFiltrados = capacits.filter(c =>
    (!searchCurso || [c.nombre,c.institucion].some((v:any) => v?.toLowerCase().includes(searchCurso.toLowerCase())))
    && (!filtroTipoCurso || c.tipo === filtroTipoCurso)
  )

  const vencidas = certifs.filter(c => c.estado === 'vencida').length
  const porVencer = certifs.filter(c => c.estado === 'por_vencer').length
  const vigentes = certifs.filter(c => c.estado === 'vigente').length
  const pendientes = certifs.filter(c => c.estado === 'pendiente').length

  function diasRestantes(fecha: string | null) {
    if (!fecha) return null
    return Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / 86400000)
  }

  return (
    <Page>
      <PageHeader
        title="Capacitaciones"
        subtitle="Registro de cursos, certificaciones y vencimientos"
        action={canEdit ? (
          <div style={{ display:'flex', gap:'8px' }}>
            {tab === 'certificaciones'
              ? <Button onClick={() => { setEditCertif(null); setFormCertif({ fecha_realizacion: new Date().toISOString().split('T')[0] }); setOpenCertif(true) }}>+ Nueva certificación</Button>
              : <Button onClick={() => { setEditCurso(null); setFormCurso({ tipo:'optativa' }); setOpenCurso(true) }}>+ Nuevo curso</Button>}
          </div>
        ) : undefined}
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'14px', marginBottom:'24px' }}>
        <StatCard label="Vigentes"    value={vigentes}        color="var(--green-600)" />
        <StatCard label="Por vencer"  value={porVencer}       color="var(--amber-600)" sub="Próximos 60 días" />
        <StatCard label="Vencidas"    value={vencidas}        color="var(--red-600)" />
        <StatCard label="Sin venc."   value={pendientes}      color="var(--slate-500)" />
        <StatCard label="Cursos reg." value={capacits.length} color="var(--blue-600)" />
      </div>

      <div style={{ display:'flex', gap:'4px', marginBottom:'20px', borderBottom:'1px solid var(--border)' }}>
        {(['certificaciones','cursos'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:'8px 18px', fontSize:'13px', fontWeight:500, border:'none', background:'none', cursor:'pointer', color: tab===t ? 'var(--accent)' : 'var(--text-2)', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent', marginBottom:'-1px' }}>
            {t === 'certificaciones' ? '🎓 Certificaciones' : '📚 Cursos y talleres'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'60px' }}><Spinner /></div>
      ) : tab === 'certificaciones' ? (
        <>
          {(vencidas > 0 || porVencer > 0) && (
            <div style={{ background: vencidas>0 ? 'var(--red-50)' : 'var(--amber-50)', border:`1px solid ${vencidas>0 ? '#fca5a5' : '#fcd34d'}`, borderRadius:'var(--radius-lg)', padding:'12px 20px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'18px' }}>⚠️</span>
              <p style={{ fontSize:'13px', fontWeight:500, color: vencidas>0 ? 'var(--red-600)' : 'var(--amber-600)' }}>
                {vencidas>0 && `${vencidas} certificación${vencidas>1?'es':''} vencida${vencidas>1?'s':''}. `}
                {porVencer>0 && `${porVencer} por vencer en los próximos 60 días.`}
              </p>
            </div>
          )}
          <div style={{ display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap' }}>
            <Input placeholder="Buscar empleado o curso..." value={searchCert} onChange={e => setSearchCert(e.target.value)} style={{ maxWidth:280 }} />
            <Select value={filtroEst} onChange={e => setFiltroEst(e.target.value)} style={{ width:160 }}>
              <option value="">Todos los estados</option>
              <option value="vigente">Vigente</option>
              <option value="por_vencer">Por vencer</option>
              <option value="vencida">Vencida</option>
              <option value="pendiente">Sin vencimiento</option>
            </Select>
            <Select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width:180 }}>
              <option value="">Todos los tipos</option>
              {Object.entries(TIPO_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <Card>
            {certifsFiltradas.length === 0 ? <Empty message="No se encontraron certificaciones" /> : (
              <Table>
                <thead><tr>
                  <Th>Empleado</Th><Th>Curso</Th><Th>Tipo</Th><Th>Realización</Th><Th>Vencimiento</Th><Th>Estado</Th><Th>Calificación</Th>
                  {canEdit && <Th />}
                </tr></thead>
                <tbody>
                  {certifsFiltradas.map((c: any) => {
                    const emp = c.empleados as any
                    const cap = c.capacitaciones as any
                    const dias = diasRestantes(c.fecha_vencimiento)
                    return (
                      <tr key={c.id}>
                        <Td><p style={{ fontWeight:500 }}>{emp?.apellido}, {emp?.nombre}</p><p style={{ fontSize:'11px', color:'var(--text-3)' }}>Leg. {emp?.legajo}</p></Td>
                        <Td><p style={{ fontWeight:500 }}>{cap?.nombre ?? '—'}</p>{cap?.institucion && <p style={{ fontSize:'11px', color:'var(--text-3)' }}>{cap.institucion}</p>}</Td>
                        <Td>{cap?.tipo && <Badge variant={TIPO_BADGE[cap.tipo]}>{TIPO_LABEL[cap.tipo]}</Badge>}</Td>
                        <Td style={{ fontFamily:'var(--font-mono)', fontSize:'12px' }}>{new Date(c.fecha_realizacion+'T12:00:00').toLocaleDateString('es-AR')}</Td>
                        <Td>
                          {c.fecha_vencimiento ? (
                            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                              <span style={{ fontFamily:'var(--font-mono)', fontSize:'12px' }}>{new Date(c.fecha_vencimiento+'T12:00:00').toLocaleDateString('es-AR')}</span>
                              {dias !== null && dias <= 60 && <Badge variant={dias<0?'red':'amber'}>{dias<0?`${Math.abs(dias)}d vencida`:`${dias}d`}</Badge>}
                            </div>
                          ) : <span style={{ color:'var(--text-3)', fontSize:'12px' }}>Sin vencimiento</span>}
                        </Td>
                        <Td><Badge variant={ESTADO_BADGE[c.estado]}>{c.estado==='vigente'?'Vigente':c.estado==='por_vencer'?'Por vencer':c.estado==='vencida'?'Vencida':'Sin venc.'}</Badge></Td>
                        <Td style={{ fontSize:'12px', color:'var(--text-2)' }}>{c.calificacion ?? '—'}</Td>
                        {canEdit && <Td><div style={{ display:'flex', gap:'4px' }}>
                          <Button variant="ghost" size="sm" onClick={() => { setEditCertif(c); setFormCertif({...c}); setOpenCertif(true) }}>Editar</Button>
                          <Button variant="ghost" size="sm" style={{ color:'var(--red-600)' }} onClick={() => eliminarCertif(c.id)}>🗑</Button>
                        </div></Td>}
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      ) : (
        <>
          <div style={{ display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap' }}>
            <Input placeholder="Buscar curso..." value={searchCurso} onChange={e => setSearchCurso(e.target.value)} style={{ maxWidth:280 }} />
            <Select value={filtroTipoCurso} onChange={e => setFiltroTipoCurso(e.target.value)} style={{ width:200 }}>
              <option value="">Todos los tipos</option>
              {Object.entries(TIPO_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <Card>
            {cursosFiltrados.length === 0 ? <Empty message="No se encontraron cursos" /> : (
              <Table>
                <thead><tr><Th>Nombre</Th><Th>Tipo</Th><Th>Institución</Th><Th>Horas</Th><Th>Descripción</Th><Th>Empleados</Th>{canEdit && <Th />}</tr></thead>
                <tbody>
                  {cursosFiltrados.map((c: any) => (
                    <tr key={c.id}>
                      <Td><p style={{ fontWeight:600 }}>{c.nombre}</p></Td>
                      <Td>{c.tipo && <Badge variant={TIPO_BADGE[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge>}</Td>
                      <Td style={{ fontSize:'13px', color:'var(--text-2)' }}>{c.institucion ?? '—'}</Td>
                      <Td style={{ fontFamily:'var(--font-mono)', fontSize:'13px' }}>{c.horas ? `${c.horas}hs` : '—'}</Td>
                      <Td style={{ fontSize:'12px', color:'var(--text-2)', maxWidth:260 }}>{c.descripcion ?? '—'}</Td>
                      <Td><Badge variant="blue">{certifs.filter(cert => cert.capacitacion_id===c.id).length} empleados</Badge></Td>
                      {canEdit && <Td><div style={{ display:'flex', gap:'4px' }}>
                        <Button variant="ghost" size="sm" onClick={() => { setEditCurso(c); setFormCurso({...c}); setOpenCurso(true) }}>Editar</Button>
                        <Button variant="ghost" size="sm" style={{ color:'var(--red-600)' }} onClick={() => eliminarCurso(c.id)}>🗑</Button>
                      </div></Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      <Modal open={openCertif} onClose={() => setOpenCertif(false)} title={editCertif ? 'Editar certificación' : 'Nueva certificación'} width={540}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
          <div style={{ gridColumn:'1 / -1' }}>
            <Select label="Empleado *" value={formCertif.empleado_id ?? ''} onChange={e => setFormCertif((p:any) => ({ ...p, empleado_id:e.target.value }))}>
              <option value="">Seleccionar...</option>
              {empleados.map((e:any) => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre} — Leg. {e.legajo}</option>)}
            </Select>
          </div>
          <div style={{ gridColumn:'1 / -1' }}>
            <Select label="Curso *" value={formCertif.capacitacion_id ?? ''} onChange={e => setFormCertif((p:any) => ({ ...p, capacitacion_id:e.target.value }))}>
              <option value="">Seleccionar...</option>
              {capacits.map((c:any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </div>
          <Input label="Fecha realización *" type="date" value={formCertif.fecha_realizacion ?? ''} onChange={e => setFormCertif((p:any) => ({ ...p, fecha_realizacion:e.target.value }))} />
          <Input label="Fecha vencimiento"   type="date" value={formCertif.fecha_vencimiento ?? ''} onChange={e => setFormCertif((p:any) => ({ ...p, fecha_vencimiento:e.target.value }))} />
          <Input label="Calificación" value={formCertif.calificacion ?? ''} onChange={e => setFormCertif((p:any) => ({ ...p, calificacion:e.target.value }))} placeholder="Aprobado, 8/10..." />
          <Input label="URL certificado" value={formCertif.certificado_url ?? ''} onChange={e => setFormCertif((p:any) => ({ ...p, certificado_url:e.target.value }))} />
          <div style={{ gridColumn:'1 / -1' }}>
            <Textarea label="Observaciones" value={formCertif.observaciones ?? ''} onChange={e => setFormCertif((p:any) => ({ ...p, observaciones:e.target.value }))} style={{ minHeight:60 }} />
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', marginTop:'24px' }}>
          <Button variant="secondary" onClick={() => setOpenCertif(false)}>Cancelar</Button>
          <Button onClick={guardarCertif} loading={saving}>Guardar</Button>
        </div>
      </Modal>

      <Modal open={openCurso} onClose={() => setOpenCurso(false)} title={editCurso ? 'Editar curso' : 'Nuevo curso'} width={520}>
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          <Input label="Nombre *" value={formCurso.nombre ?? ''} onChange={e => setFormCurso((p:any) => ({ ...p, nombre:e.target.value }))} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <Select label="Tipo *" value={formCurso.tipo ?? 'optativa'} onChange={e => setFormCurso((p:any) => ({ ...p, tipo:e.target.value }))}>
              {Object.entries(TIPO_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Input label="Horas" type="number" min="1" value={formCurso.horas ?? ''} onChange={e => setFormCurso((p:any) => ({ ...p, horas: e.target.value ? parseInt(e.target.value) : null }))} />
          </div>
          <Input label="Institución" value={formCurso.institucion ?? ''} onChange={e => setFormCurso((p:any) => ({ ...p, institucion:e.target.value }))} />
          <Textarea label="Descripción" value={formCurso.descripcion ?? ''} onChange={e => setFormCurso((p:any) => ({ ...p, descripcion:e.target.value }))} style={{ minHeight:70 }} />
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', marginTop:'24px' }}>
          <Button variant="secondary" onClick={() => setOpenCurso(false)}>Cancelar</Button>
          <Button onClick={guardarCurso} loading={saving}>Guardar</Button>
        </div>
      </Modal>
    </Page>
  )
}
