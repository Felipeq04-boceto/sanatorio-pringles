import React from 'react'
import { useEffect, useState } from 'react'
import { supabase, type Licencia, type Empleado } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Input, Select, Modal, Spinner, Empty, Textarea, StatCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const TIPO_LABEL: Record<string, string> = {
  vacaciones:  'Vacaciones',
  enfermedad:  'Enfermedad',
  maternidad:  'Maternidad',
  paternidad:  'Paternidad',
  estudio:     'Estudio',
  duelo:       'Duelo',
  sin_goce:    'Sin goce de sueldo',
  otra:        'Otra',
}

const ESTADO_BADGE: Record<string, any> = {
  pendiente:  'amber',
  aprobada:   'green',
  rechazada:  'red',
  cancelada:  'slate',
  archivada:  'slate',
}

// Días de vacaciones según años de antigüedad (régimen general argentina)
function diasSegunAntiguedad(fechaIngreso: string): number {
  const ingreso = new Date(fechaIngreso)
  const hoy = new Date()
  const anios = (hoy.getTime() - ingreso.getTime()) / (365.25 * 24 * 3600 * 1000)
  if (anios < 5)  return 14
  if (anios < 10) return 21
  if (anios < 20) return 28
  return 35
}

function calcAnios(fechaIngreso: string): number {
  const ingreso = new Date(fechaIngreso)
  const hoy = new Date()
  return Math.floor((hoy.getTime() - ingreso.getTime()) / (365.25 * 24 * 3600 * 1000))
}

function calcDiasEntreFechas(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0
  const diff = new Date(hasta).getTime() - new Date(desde).getTime()
  return Math.max(0, Math.ceil(diff / 86400000) + 1)
}

type Form = Partial<Omit<Licencia, 'id' | 'dias_tomados' | 'created_at' | 'empleados'>>

export function LicenciasPage() {
  const { usuario } = useAuth()
  const [licencias,  setLicencias]  = useState<Licencia[]>([])
  const [empleados,  setEmpleados]  = useState<any[]>([])
  const [saldos,     setSaldos]     = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)
  const [filtroEst,  setFiltroEst]  = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [search,     setSearch]     = useState('')
  const [open,       setOpen]       = useState(false)
  const [detalle,    setDetalle]    = useState<Licencia | null>(null)
  const [form,       setForm]       = useState<Form>({})
  const [saving,     setSaving]     = useState(false)
  const [openSaldos, setOpenSaldos] = useState(false)

  const [mostrarArchivadas, setMostrarArchivadas] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<Licencia | null>(null)

  const canEdit = usuario?.rol && ['admin', 'rrhh'].includes(usuario.rol)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: l }, { data: e }] = await Promise.all([
      supabase.from('licencias')
        .select('*, empleados(id, nombre, apellido, legajo, fecha_ingreso)')
        .order('created_at', { ascending: false }),
      supabase.from('empleados')
        .select('id, nombre, apellido, legajo, fecha_ingreso')
        .eq('estado', 'activo').order('apellido'),
    ])
    const lic = (l ?? []) as any[]
    const emp = (e ?? []) as any[]
    setLicencias(lic as unknown as Licencia[])
    setEmpleados(emp)

    // Calcular saldos: días correspondientes - días aprobados (solo vacaciones)
    const s: Record<string, number> = {}
    emp.forEach(em => {
      if (!em.fecha_ingreso) return
      const correspondientes = diasSegunAntiguedad(em.fecha_ingreso)
      const tomados = lic
        .filter(li => li.empleado_id === em.id && li.tipo_licencia === 'vacaciones' && ['aprobada', 'archivada'].includes(li.estado))
        .reduce((acc: number, li: any) => acc + (li.dias_tomados ?? 0), 0)
      s[em.id] = correspondientes - tomados
    })
    setSaldos(s)
    setLoading(false)
  }

  function openNueva() {
    setForm({
      estado: 'pendiente',
      fecha_inicio: new Date().toISOString().split('T')[0],
      fecha_fin: new Date().toISOString().split('T')[0],
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.empleado_id || !form.tipo_licencia || !form.fecha_inicio || !form.fecha_fin) return
    setSaving(true)
    try {
      const dias = calcDiasEntreFechas(form.fecha_inicio!, form.fecha_fin!)
      const { error: errIns } = await supabase.from('licencias').insert({ ...form, dias_tomados: dias })
      if (errIns) { alert(`Error al guardar: ${errIns.message}`); return }
      setOpen(false)
      loadAll()
    } finally { setSaving(false) }
  }

  async function cambiarEstado(id: string, estado: string) {
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('licencias').update({
      estado,
      aprobado_por: estado === 'aprobada' ? user?.id : null
    }).eq('id', id)
    setDetalle(null)
    loadAll()
  }

  async function archivarLicencia(lic: Licencia) {
    // Archiva: queda en el legajo para el cálculo de saldos pero no aparece en la lista
    await supabase.from('licencias').update({ estado: 'archivada' }).eq('id', lic.id)
    setDetalle(null)
    loadAll()
  }

  async function eliminarLicencia(lic: Licencia) {
    // Elimina físicamente solo si es pendiente o rechazada (error de carga)
    await supabase.from('licencias').delete().eq('id', lic.id)
    setConfirmEliminar(null)
    setDetalle(null)
    loadAll()
  }

  const filtered = licencias.filter(l => {
    if (!mostrarArchivadas && l.estado === 'archivada') return false
    const q = search.toLowerCase()
    const emp = l.empleados as any
    const matchSearch = !q || [emp?.nombre, emp?.apellido, emp?.legajo].some((v: string) => v?.toLowerCase().includes(q))
    const matchEst  = !filtroEst  || l.estado === filtroEst
    const matchTipo = !filtroTipo || l.tipo_licencia === filtroTipo
    return matchSearch && matchEst && matchTipo
  })

  const pendientes = licencias.filter(l => l.estado === 'pendiente').length
  const aprobadas  = licencias.filter(l => l.estado === 'aprobada').length
  const rechazadas = licencias.filter(l => l.estado === 'rechazada').length
  const totalDias  = licencias.filter(l => l.estado === 'aprobada').reduce((acc, l) => acc + (l.dias_tomados ?? 0), 0)

  function f(k: keyof Form) { return (form[k] ?? '') as string }
  function set(k: keyof Form, v: string) { setForm(p => ({ ...p, [k]: v || null })) }

  const diasSolicitud = calcDiasEntreFechas(f('fecha_inicio'), f('fecha_fin'))
  const empSeleccionado = empleados.find(e => e.id === f('empleado_id'))
  const diasCorrespondientes = empSeleccionado?.fecha_ingreso ? diasSegunAntiguedad(empSeleccionado.fecha_ingreso) : 0
  const saldoEmpSeleccionado = empSeleccionado ? (saldos[empSeleccionado.id] ?? diasCorrespondientes) : 0

  return (
    <Page>
      <PageHeader
        title="Licencias y vacaciones"
        subtitle={`${filtered.length} registros`}
        action={canEdit ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setOpenSaldos(true)}>📊 Saldos</Button>
            <Button onClick={openNueva}>+ Nueva licencia</Button>
          </div>
        ) : undefined}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <StatCard label="Pendientes"   value={pendientes} color="var(--amber-600)" sub="Requieren aprobación" />
        <StatCard label="Aprobadas"    value={aprobadas}  color="var(--green-600)" />
        <StatCard label="Rechazadas"   value={rechazadas} color="var(--red-600)" />
        <StatCard label="Días tomados" value={totalDias}  color="var(--blue-600)" sub="Total aprobados" />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        <Select value={filtroEst} onChange={e => setFiltroEst(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobada">Aprobada</option>
          <option value="rechazada">Rechazada</option>
          <option value="cancelada">Cancelada</option>
          {mostrarArchivadas && <option value="archivada">Archivada</option>}
        </Select>
        <Select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 200 }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {canEdit && (
          <button
            onClick={() => setMostrarArchivadas(p => !p)}
            style={{
              padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: mostrarArchivadas ? 'var(--slate-200)' : 'white',
              color: 'var(--text-2)', fontWeight: mostrarArchivadas ? 600 : 400,
            }}>
            📁 {mostrarArchivadas ? 'Ocultar archivadas' : 'Mostrar archivadas'}
          </button>
        )}
      </div>

      <Card>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <Empty message="No se encontraron licencias" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Empleado</Th>
                <Th>Tipo</Th>
                <Th>Desde</Th>
                <Th>Hasta</Th>
                <Th>Días</Th>
                <Th>Saldo vac.</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const emp = l.empleados as any
                const saldo = emp?.id ? saldos[emp.id] : null
                return (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(l)}>
                    <Td>
                      <p style={{ fontWeight: 500 }}>{emp?.apellido}, {emp?.nombre}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>Leg. {emp?.legajo}</p>
                    </Td>
                    <Td style={{ fontSize: '13px' }}>{TIPO_LABEL[l.tipo_licencia] ?? l.tipo_licencia}</Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {new Date(l.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR')}
                    </Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {new Date(l.fecha_fin + 'T12:00:00').toLocaleDateString('es-AR')}
                    </Td>
                    <Td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{l.dias_tomados ?? 0}</Td>
                    <Td>
                      {saldo !== null && l.tipo_licencia === 'vacaciones' ? (
                        <span style={{ fontWeight: 600, fontSize: '13px', color: saldo <= 0 ? 'var(--red-600)' : saldo <= 5 ? 'var(--amber-600)' : 'var(--green-600)' }}>
                          {saldo}d
                        </span>
                      ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </Td>
                    <Td><Badge variant={ESTADO_BADGE[l.estado]}>{l.estado}</Badge></Td>
                    <Td>
                      {canEdit && l.estado === 'pendiente' && (
                        <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                          <Button variant="primary" size="sm" onClick={() => cambiarEstado(l.id, 'aprobada')}>✓ Aprobar</Button>
                          <Button variant="danger"  size="sm" onClick={() => cambiarEstado(l.id, 'rechazada')}>✗ Rechazar</Button>
                          <button
                            title="Eliminar (cargada por error)"
                            onClick={() => setConfirmEliminar(l)}
                            style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--red-200)', background: 'var(--red-50)', color: 'var(--red-600)', cursor: 'pointer', fontSize: '14px' }}>
                            🗑️
                          </button>
                        </div>
                      )}
                      {canEdit && l.estado === 'aprobada' && (
                        <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                          <Button variant="secondary" size="sm" onClick={() => cambiarEstado(l.id, 'cancelada')}>Cancelar</Button>
                          <button
                            title="Archivar (queda en el legajo)"
                            onClick={() => archivarLicencia(l)}
                            style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text-3)', cursor: 'pointer', fontSize: '14px' }}>
                            📁
                          </button>
                        </div>
                      )}
                      {canEdit && l.estado === 'rechazada' && (
                        <button
                          title="Eliminar (cargada por error)"
                          onClick={e => { e.stopPropagation(); setConfirmEliminar(l) }}
                          style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--red-200)', background: 'var(--red-50)', color: 'var(--red-600)', cursor: 'pointer', fontSize: '14px' }}>
                          🗑️
                        </button>
                      )}
                      {canEdit && l.estado === 'cancelada' && (
                        <button
                          title="Archivar (queda en el legajo)"
                          onClick={e => { e.stopPropagation(); archivarLicencia(l) }}
                          style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text-3)', cursor: 'pointer', fontSize: '14px' }}>
                          📁
                        </button>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ── Modal SALDOS POR EMPLEADO ─────────────────────── */}
      <Modal open={openSaldos} onClose={() => setOpenSaldos(false)} title="Saldos de vacaciones" width={620}>
        <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text-3)' }}>
          Régimen: 0–5 años → 14 días · 5–10 → 21 días · 10–20 → 28 días · 20+ → 35 días
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '480px', overflowY: 'auto' }}>
          {empleados.filter(e => e.fecha_ingreso).map(emp => {
            const anios = calcAnios(emp.fecha_ingreso)
            const correspondientes = diasSegunAntiguedad(emp.fecha_ingreso)
            const tomados = licencias
              .filter(l => l.empleado_id === emp.id && l.tipo_licencia === 'vacaciones' && ['aprobada', 'archivada'].includes(l.estado))
              .reduce((acc, l) => acc + (l.dias_tomados ?? 0), 0)
            const saldo = correspondientes - tomados
            const pct = Math.max(0, Math.min(100, (tomados / correspondientes) * 100))
            return (
              <div key={emp.id} style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 16px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '13px' }}>{emp.apellido}, {emp.nombre}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                      Leg. {emp.legajo} · {anios} año{anios !== 1 ? 's' : ''} de antigüedad → {correspondientes} días/año
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 700, fontSize: '18px', color: saldo <= 0 ? 'var(--red-600)' : saldo <= 5 ? 'var(--amber-600)' : 'var(--green-600)' }}>
                      {saldo}d
                    </p>
                    <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>{tomados} tomados / {correspondientes} totales</p>
                  </div>
                </div>
                {/* Barra de progreso */}
                <div style={{ background: 'var(--border)', borderRadius: '99px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '99px', transition: 'width 0.3s',
                    width: `${pct}%`,
                    background: pct >= 100 ? 'var(--red-500)' : pct >= 75 ? 'var(--amber-500)' : 'var(--green-500)',
                  }} />
                </div>
              </div>
            )
          })}
          {empleados.filter(e => !e.fecha_ingreso).length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--amber-600)', padding: '8px', background: 'var(--amber-50)', borderRadius: 'var(--radius-sm)' }}>
              ⚠️ {empleados.filter(e => !e.fecha_ingreso).length} empleado(s) sin fecha de ingreso cargada — no se puede calcular su saldo.
            </p>
          )}
        </div>
      </Modal>

      {/* ── Modal NUEVA LICENCIA ──────────────────────────── */}
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva solicitud de licencia" width={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select label="Empleado *" value={f('empleado_id')} onChange={e => set('empleado_id', e.target.value)}>
            <option value="">Seleccionar...</option>
            {empleados.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre} — Leg. {e.legajo}</option>)}
          </Select>

          {/* Info de saldo del empleado seleccionado */}
          {empSeleccionado?.fecha_ingreso && (
            <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div>
                <p style={{ fontSize: '10px', color: 'var(--blue-600)', fontWeight: 700 }}>ANTIGÜEDAD</p>
                <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-800)' }}>{calcAnios(empSeleccionado.fecha_ingreso)} años</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: 'var(--blue-600)', fontWeight: 700 }}>DÍAS CORRESPONDIENTES</p>
                <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--blue-800)' }}>{diasCorrespondientes} días</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: 'var(--blue-600)', fontWeight: 700 }}>SALDO DISPONIBLE</p>
                <p style={{ fontWeight: 700, fontSize: '14px', color: saldoEmpSeleccionado <= 0 ? 'var(--red-600)' : saldoEmpSeleccionado <= 5 ? 'var(--amber-600)' : 'var(--green-600)' }}>
                  {saldoEmpSeleccionado} días
                </p>
              </div>
            </div>
          )}

          <Select label="Tipo de licencia *" value={f('tipo_licencia')} onChange={e => set('tipo_licencia', e.target.value)}>
            <option value="">Seleccionar...</option>
            {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Input label="Fecha inicio *" type="date" value={f('fecha_inicio')} onChange={e => set('fecha_inicio', e.target.value)} />
            <Input label="Fecha fin *"    type="date" value={f('fecha_fin')}    onChange={e => set('fecha_fin', e.target.value)} />
          </div>

          {form.fecha_inicio && form.fecha_fin && (
            <div style={{ background: diasSolicitud > saldoEmpSeleccionado && f('tipo_licencia') === 'vacaciones' ? 'var(--red-50)' : 'var(--blue-50)', border: `1px solid ${diasSolicitud > saldoEmpSeleccionado && f('tipo_licencia') === 'vacaciones' ? 'var(--red-200)' : 'var(--blue-200)'}`, borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>{diasSolicitud > saldoEmpSeleccionado && f('tipo_licencia') === 'vacaciones' ? '⚠️' : '📅'}</span>
              <div>
                <p style={{ fontWeight: 600, fontSize: '16px' }}>{diasSolicitud} días</p>
                {f('tipo_licencia') === 'vacaciones' && empSeleccionado && (
                  <p style={{ fontSize: '11px', color: diasSolicitud > saldoEmpSeleccionado ? 'var(--red-600)' : 'var(--blue-600)' }}>
                    {diasSolicitud > saldoEmpSeleccionado
                      ? `⚠️ Supera el saldo disponible (${saldoEmpSeleccionado} días)`
                      : `Saldo restante después: ${saldoEmpSeleccionado - diasSolicitud} días`}
                  </p>
                )}
              </div>
            </div>
          )}

          <Textarea label="Motivo / observaciones" value={f('motivo')} onChange={e => set('motivo', e.target.value)} />

          <Select label="Estado inicial" value={f('estado') || 'pendiente'} onChange={e => set('estado', e.target.value)}>
            <option value="pendiente">Pendiente de aprobación</option>
            <option value="aprobada">Aprobada directamente</option>
          </Select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Guardar</Button>
        </div>
      </Modal>

      {/* ── Modal DETALLE ─────────────────────────────────── */}
      <Modal open={!!detalle} onClose={() => setDetalle(null)} title="Detalle de licencia" width={480}>
        {detalle && (() => {
          const emp = detalle.empleados as any
          const saldo = emp?.id ? saldos[emp.id] : null
          const correspondientes = emp?.fecha_ingreso ? diasSegunAntiguedad(emp.fecha_ingreso) : null
          const anios = emp?.fecha_ingreso ? calcAnios(emp.fecha_ingreso) : null
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px' }}>EMPLEADO</p>
                  <p style={{ fontWeight: 600 }}>{emp?.apellido}, {emp?.nombre}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-2)' }}>Leg. {emp?.legajo}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px' }}>ESTADO</p>
                  <Badge variant={ESTADO_BADGE[detalle.estado]}>{detalle.estado}</Badge>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px' }}>TIPO</p>
                  <p style={{ fontWeight: 500 }}>{TIPO_LABEL[detalle.tipo_licencia]}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px' }}>DÍAS SOLICITADOS</p>
                  <p style={{ fontWeight: 700, fontSize: '20px', fontFamily: 'var(--font-mono)', color: 'var(--blue-600)' }}>{detalle.dias_tomados}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px' }}>DESDE</p>
                  <p>{new Date(detalle.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px' }}>HASTA</p>
                  <p>{new Date(detalle.fecha_fin + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                </div>
              </div>

              {/* Saldo del empleado */}
              {detalle.tipo_licencia === 'vacaciones' && correspondientes !== null && saldo !== null && (
                <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 16px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px', fontWeight: 700 }}>SALDO DE VACACIONES</p>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Antigüedad</p>
                      <p style={{ fontWeight: 600 }}>{anios} años → {correspondientes}d/año</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Saldo actual</p>
                      <p style={{ fontWeight: 700, color: saldo <= 0 ? 'var(--red-600)' : saldo <= 5 ? 'var(--amber-600)' : 'var(--green-600)' }}>
                        {saldo} días disponibles
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {detalle.motivo && (
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>MOTIVO</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-2)', background: 'var(--slate-50)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>{detalle.motivo}</p>
                </div>
              )}

              {canEdit && detalle.estado === 'pendiente' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Button style={{ flex: 1, justifyContent: 'center' }} onClick={() => cambiarEstado(detalle.id, 'aprobada')}>✓ Aprobar</Button>
                    <Button variant="danger" style={{ flex: 1, justifyContent: 'center' }} onClick={() => cambiarEstado(detalle.id, 'rechazada')}>✗ Rechazar</Button>
                  </div>
                  <button onClick={() => { setConfirmEliminar(detalle); setDetalle(null) }}
                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--red-200)', background: 'var(--red-50)', color: 'var(--red-600)', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>
                    🗑️ Eliminar (cargada por error)
                  </button>
                </div>
              )}
              {canEdit && detalle.estado === 'aprobada' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                  <Button variant="secondary" onClick={() => cambiarEstado(detalle.id, 'cancelada')}>Cancelar licencia</Button>
                  <button onClick={() => archivarLicencia(detalle)}
                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text-3)', cursor: 'pointer', fontSize: '12px' }}>
                    📁 Archivar (conserva días en el legajo)
                  </button>
                </div>
              )}
              {canEdit && (detalle.estado === 'rechazada' || detalle.estado === 'cancelada') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                  {detalle.estado === 'rechazada' && (
                    <button onClick={() => { setConfirmEliminar(detalle); setDetalle(null) }}
                      style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--red-200)', background: 'var(--red-50)', color: 'var(--red-600)', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>
                      🗑️ Eliminar (cargada por error)
                    </button>
                  )}
                  <button onClick={() => archivarLicencia(detalle)}
                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text-3)', cursor: 'pointer', fontSize: '12px' }}>
                    📁 Archivar (queda en el legajo)
                  </button>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
      {/* ── Modal CONFIRMAR ELIMINAR ──────────────────────── */}
      <Modal open={!!confirmEliminar} onClose={() => setConfirmEliminar(null)} title="Eliminar licencia" width={420}>
        {confirmEliminar && (() => {
          const emp = confirmEliminar.empleados as any
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <p style={{ fontWeight: 600, color: 'var(--red-700)', marginBottom: '6px' }}>⚠️ Esta acción es permanente</p>
                <p style={{ fontSize: '13px', color: 'var(--red-600)' }}>
                  Se eliminará definitivamente la licencia de <strong>{emp?.apellido}, {emp?.nombre}</strong> ({TIPO_LABEL[confirmEliminar.tipo_licencia]}, {confirmEliminar.dias_tomados} días).
                </p>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                Usá esta opción solo si fue cargada por error. Si la licencia ya se efectivizó, usá <strong>Archivar</strong> en su lugar para conservar el historial en el legajo.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button variant="secondary" onClick={() => setConfirmEliminar(null)}>Cancelar</Button>
                <Button variant="danger" onClick={() => eliminarLicencia(confirmEliminar)}>Sí, eliminar</Button>
              </div>
            </div>
          )
        })()}
      </Modal>

    </Page>
  )
}
