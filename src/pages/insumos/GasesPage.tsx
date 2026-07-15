import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Input, Select, Modal, Spinner, Empty, Textarea, StatCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const ESTADOS: Record<string, { label: string; color: string; badge: any }> = {
  lleno:             { label: 'Lleno',               color: 'var(--blue-600)',   badge: 'blue' },
  en_traslado:       { label: 'En traslado',          color: 'var(--amber-600)', badge: 'amber' },
  en_uso:            { label: 'En uso',               color: 'var(--green-600)', badge: 'green' },
  vacio:             { label: 'Vacío / para recarga', color: 'var(--slate-500)', badge: 'slate' },
  devuelto:          { label: 'Devuelto al proveedor',color: 'var(--teal-600)',  badge: 'teal' },
  baja:              { label: 'Dado de baja',         color: 'var(--red-600)',   badge: 'red' },
}

const SECTORES = [
  'Depósito central', 'Internación', 'Quirófano', 'Quirófano 1', 'Quirófano 2',
  'Sala de partos', 'Recepción del recién nacido', 'Guardia', 'Pediatría',
  'Neonatología', 'Farmacia', 'Laboratorio', 'Imágenes', 'Administración', 'Otro'
]

const GAS_LABEL: Record<string, string> = {
  oxigeno: 'Oxígeno (O₂)', co2: 'CO₂', oxido_nitroso: 'N₂O',
  aire_medicinal: 'Aire medicinal', nitrogeno: 'N₂', mezcla: 'Mezcla'
}

export function GasesPage() {
  const { usuario } = useAuth()
  const [tubos,       setTubos]       = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [insumos,     setInsumos]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [filtroGas,   setFiltroGas]   = useState('')
  const [filtroEst,   setFiltroEst]   = useState('')
  const [openNuevo,   setOpenNuevo]   = useState(false)
  const [openMovimiento, setOpenMovimiento] = useState(false)
  const [openHistorial,  setOpenHistorial]  = useState(false)
  const [openConfirmBorrar, setOpenConfirmBorrar] = useState(false)
  const [tuboActivo,  setTuboActivo]  = useState<any>(null)
  const [historial,   setHistorial]   = useState<any[]>([])
  const [form,        setForm]        = useState<any>({})
  const [movForm,     setMovForm]     = useState<any>({})
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: p }, { data: i }] = await Promise.all([
      supabase.from('tubos_gas')
        .select('*, proveedores(razon_social), insumos(nombre)')
        .order('numero_serie'),
      supabase.from('proveedores').select('*').eq('categoria', 'gas_medicinal').eq('estado', 'activo').order('razon_social'),
      supabase.from('insumos').select('*').eq('estado', 'activo').order('nombre'),
    ])
    setTubos(t ?? [])
    setProveedores(p ?? [])
    setInsumos(i ?? [])
    setLoading(false)
  }

  async function loadHistorial(tuboId: string) {
    const { data } = await supabase
      .from('tubos_historial')
      .select('*')
      .eq('tubo_id', tuboId)
      .order('fecha', { ascending: false })
    setHistorial(data ?? [])
  }

  async function handleNuevoTubo() {
    if (!form.numero_serie || !form.tipo_gas || !form.insumo_id) return
    setError(null)
    setSaving(true)
    try {
      // 1. Insertar el tubo
      // Extraer campos que NO van en tubos_gas
      const { responsable_nombre, observaciones, ubicacion_inicial, ...datosTubo } = form
      const { data: tubo, error: errTubo } = await supabase.from('tubos_gas').insert({
        ...datosTubo,
        estado_tubo: 'lleno',
        ubicacion_actual: ubicacion_inicial || 'Depósito central',
      }).select().single()

      if (errTubo || !tubo) {
        setError(`Error al registrar tubo: ${errTubo?.message ?? 'respuesta vacía'}`)
        return
      }

      // 2. Registrar en historial
      const { error: errHist } = await supabase.from('tubos_historial').insert({
        tubo_id: tubo.id,
        estado_anterior: null,
        estado_nuevo: 'lleno',
        ubicacion_anterior: null,
        ubicacion_nueva: ubicacion_inicial || 'Depósito central',
        responsable_nombre: responsable_nombre || (usuario?.nombre + ' ' + usuario?.apellido),
        responsable_sector: 'Depósito central',
        observaciones: observaciones || 'Ingreso inicial del tubo al sistema',
        registrado_por: usuario?.id,
      })

      if (errHist) {
        // El tubo se creó pero el historial falló — avisamos pero no bloqueamos
        setError(`Tubo registrado, pero hubo un error en el historial: ${errHist.message}`)
      }

      // Actualizar stock del insumo asociado
      if (datosTubo.insumo_id) {
        await supabase.rpc('incrementar_stock', { p_insumo_id: datosTubo.insumo_id, p_cantidad: 1 })
      }
      setOpenNuevo(false)
      setForm({})
      loadAll()
    } catch (e: any) {
      setError(`Error inesperado: ${e.message}`)
    } finally { setSaving(false) }
  }

  async function handleMovimiento() {
    if (!tuboActivo || !movForm.estado_nuevo || !movForm.responsable_nombre) return
    setError(null)
    setSaving(true)
    try {
      const { error: errUpd } = await supabase.from('tubos_gas').update({
        estado_tubo: movForm.estado_nuevo,
        ubicacion_actual: movForm.ubicacion_nueva || tuboActivo.ubicacion_actual,
        fecha_ultimo_recambio: movForm.estado_nuevo === 'vacio' ? new Date().toISOString().split('T')[0] : tuboActivo.fecha_ultimo_recambio,
      }).eq('id', tuboActivo.id)

      if (errUpd) { setError(`Error al actualizar tubo: ${errUpd.message}`); return }

      const { error: errHist } = await supabase.from('tubos_historial').insert({
        tubo_id: tuboActivo.id,
        estado_anterior: tuboActivo.estado_tubo,
        estado_nuevo: movForm.estado_nuevo,
        ubicacion_anterior: tuboActivo.ubicacion_actual,
        ubicacion_nueva: movForm.ubicacion_nueva || tuboActivo.ubicacion_actual,
        responsable_nombre: movForm.responsable_nombre,
        responsable_sector: movForm.responsable_sector,
        observaciones: movForm.observaciones,
        registrado_por: usuario?.id,
      })

      if (errHist) { setError(`Movimiento guardado, error en historial: ${errHist.message}`) }

      setOpenMovimiento(false)
      setMovForm({})
      loadAll()
    } catch (e: any) {
      setError(`Error inesperado: ${e.message}`)
    } finally { setSaving(false) }
  }

  async function handleBorrar() {
    if (!tuboActivo) return
    setSaving(true)
    try {
      // Borrar historial primero (FK), luego el tubo
      await supabase.from('tubos_historial').delete().eq('tubo_id', tuboActivo.id)
      const { error: errDel } = await supabase.from('tubos_gas').delete().eq('id', tuboActivo.id)
      if (errDel) { setError(`Error al borrar: ${errDel.message}`); return }
      // Restar del stock del insumo asociado
      if (tuboActivo.insumo_id) {
        await supabase.rpc('incrementar_stock', { p_insumo_id: tuboActivo.insumo_id, p_cantidad: -1 })
      }
      setOpenConfirmBorrar(false)
      setTuboActivo(null)
      loadAll()
    } catch (e: any) {
      setError(`Error inesperado: ${e.message}`)
    } finally { setSaving(false) }
  }

  async function verHistorial(tubo: any) {
    setTuboActivo(tubo)
    await loadHistorial(tubo.id)
    setOpenHistorial(true)
  }

  function abrirMovimiento(tubo: any) {
    setTuboActivo(tubo)
    setMovForm({
      estado_nuevo: tubo.estado_tubo,
      ubicacion_nueva: tubo.ubicacion_actual,
      responsable_nombre: '',
      responsable_sector: '',
      observaciones: '',
    })
    setOpenMovimiento(true)
  }

  function abrirBorrar(tubo: any) {
    setTuboActivo(tubo)
    setOpenConfirmBorrar(true)
  }

  const canEdit = usuario?.rol && ['admin', 'referente_enfermeria', 'referente_instrumentadores'].includes(usuario.rol)

  const filtered = tubos.filter(t => {
    const matchSearch = !search || t.numero_serie?.toLowerCase().includes(search.toLowerCase())
    const matchGas = !filtroGas || t.tipo_gas === filtroGas
    const matchEst = !filtroEst || t.estado_tubo === filtroEst
    return matchSearch && matchGas && matchEst
  })

  const hoy = new Date()
  function diasVencimiento(fecha: string | null) {
    if (!fecha) return null
    return Math.ceil((new Date(fecha).getTime() - hoy.getTime()) / 86400000)
  }

  const porEstado = Object.keys(ESTADOS).reduce((acc, k) => {
    acc[k] = tubos.filter(t => t.estado_tubo === k).length
    return acc
  }, {} as Record<string, number>)

  return (
    <Page>
      <PageHeader
        title="Gases medicinales — Trazabilidad"
        subtitle={`${filtered.length} tubos registrados`}
        action={canEdit ? <Button onClick={() => { setForm({}); setError(null); setOpenNuevo(true) }}>+ Ingresar tubo</Button> : undefined}
      />

      {/* Alerta stock mínimo oxígeno */}
      {(() => {
        const tubosO2Llenos = tubos.filter(t => t.tipo_gas === 'oxigeno' && t.estado_tubo === 'lleno').length
        if (tubosO2Llenos < 4) return (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '22px' }}>🚨</span>
            <div>
              <p style={{ fontWeight: 700, color: '#991B1B', fontSize: '14px' }}>Stock crítico de Oxígeno</p>
              <p style={{ color: '#B91C1C', fontSize: '13px' }}>
                Solo hay <strong>{tubosO2Llenos}</strong> tubo{tubosO2Llenos !== 1 ? 's' : ''} de O₂ lleno{tubosO2Llenos !== 1 ? 's' : ''}. El mínimo recomendado es 4. Solicitá reposición urgente.
              </p>
            </div>
          </div>
        )
        return null
      })()}

      {/* Mensaje de error global */}
      {error && (
        <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-400)', fontSize: '16px' }}>✕</button>
        </div>
      )}

      {/* Stats por estado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {Object.entries(ESTADOS).map(([k, v]) => (
          <Card key={k} style={{ padding: '14px 16px', cursor: 'pointer', border: filtroEst === k ? `2px solid ${v.color}` : '1px solid var(--border)' }}
            onClick={() => setFiltroEst(filtroEst === k ? '' : k)}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', marginBottom: '4px' }}>{v.label.toUpperCase()}</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: v.color }}>{porEstado[k] ?? 0}</p>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <Input placeholder="Buscar por nro de serie..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
        <Select value={filtroGas} onChange={e => setFiltroGas(e.target.value)} style={{ width: 180 }}>
          <option value="">Todos los gases</option>
          {Object.entries(GAS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {filtroEst && <Button variant="secondary" size="sm" onClick={() => setFiltroEst('')}>✕ Quitar filtro estado</Button>}
      </div>

      <Card>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <Empty message="No se encontraron tubos" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nro serie</Th>
                <Th>Gas</Th>
                <Th>Estado</Th>
                <Th>Ubicación actual</Th>
                <Th>Proveedor</Th>
                <Th>Vencimiento</Th>
                <Th>Capacidad</Th>
                {canEdit && <Th>Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const dias = diasVencimiento(t.fecha_vencimiento)
                const estado = ESTADOS[t.estado_tubo] ?? { label: t.estado_tubo, badge: 'slate' }
                return (
                  <tr key={t.id}>
                    <Td>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>{t.numero_serie}</code>
                    </Td>
                    <Td style={{ fontSize: '13px' }}>{GAS_LABEL[t.tipo_gas] ?? t.tipo_gas}</Td>
                    <Td><Badge variant={estado.badge}>{estado.label}</Badge></Td>
                    <Td style={{ fontSize: '13px', fontWeight: 500 }}>{t.ubicacion_actual ?? '—'}</Td>
                    <Td style={{ fontSize: '12px', color: 'var(--text-2)' }}>{t.proveedores?.razon_social ?? '—'}</Td>
                    <Td>
                      {t.fecha_vencimiento ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px' }}>{new Date(t.fecha_vencimiento).toLocaleDateString('es-AR')}</span>
                          {dias !== null && dias <= 60 && <Badge variant={dias <= 15 ? 'red' : 'amber'}>{dias}d</Badge>}
                        </div>
                      ) : '—'}
                    </Td>
                    <Td style={{ fontSize: '12px', color: 'var(--text-3)' }}>{t.capacidad_m3 ? `${t.capacidad_m3} m³` : '—'}</Td>
                    {canEdit && (
                      <Td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <Button variant="primary" size="sm" onClick={() => abrirMovimiento(t)}>Mover</Button>
                          <Button variant="ghost" size="sm" onClick={() => verHistorial(t)}>Historial</Button>
                          <Button variant="ghost" size="sm" onClick={() => abrirBorrar(t)}
                            style={{ color: 'var(--red-600)', borderColor: 'var(--red-200)' }}>
                            Borrar
                          </Button>
                        </div>
                      </Td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Modal: Ingresar nuevo tubo */}
      <Modal open={openNuevo} onClose={() => setOpenNuevo(false)} title="Ingresar tubo al sistema" width={560}>
        {error && (
          <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '14px' }}>
            <span style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {error}</span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Input label="Número de serie *" value={form.numero_serie ?? ''} onChange={e => setForm((p: any) => ({ ...p, numero_serie: e.target.value }))} placeholder="Ej: AL-2024-001" />

          <Select label="Tipo de gas *" value={form.tipo_gas ?? ''} onChange={e => setForm((p: any) => ({ ...p, tipo_gas: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {Object.entries(GAS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>

          <Select label="Proveedor" value={form.proveedor_id ?? ''} onChange={e => setForm((p: any) => ({ ...p, proveedor_id: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </Select>

          <Select label="Insumo asociado *" value={form.insumo_id ?? ''} onChange={e => setForm((p: any) => ({ ...p, insumo_id: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </Select>

          <Input label="Capacidad (m³)" type="number" step="0.01" value={form.capacidad_m3 ?? ''} onChange={e => setForm((p: any) => ({ ...p, capacidad_m3: e.target.value }))} />
          <Input label="Fecha vencimiento" type="date" value={form.fecha_vencimiento ?? ''} onChange={e => setForm((p: any) => ({ ...p, fecha_vencimiento: e.target.value }))} />
          <Input label="Fecha último recambio" type="date" value={form.fecha_ultimo_recambio ?? ''} onChange={e => setForm((p: any) => ({ ...p, fecha_ultimo_recambio: e.target.value }))} />
          <Input label="Ubicación inicial" value={form.ubicacion_inicial ?? 'Depósito central'} onChange={e => setForm((p: any) => ({ ...p, ubicacion_inicial: e.target.value }))} />

          <div style={{ gridColumn: '1 / -1', background: 'var(--blue-50)', borderRadius: 'var(--radius)', padding: '12px 14px', border: '1px solid var(--blue-200)' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--blue-700)', marginBottom: '8px' }}>Responsable del ingreso</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Input label="Nombre y apellido *" value={form.responsable_nombre ?? ''} onChange={e => setForm((p: any) => ({ ...p, responsable_nombre: e.target.value }))} placeholder="Quien recibe el tubo" />
              <Input label="Observaciones" value={form.observaciones ?? ''} onChange={e => setForm((p: any) => ({ ...p, observaciones: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
          <Button onClick={handleNuevoTubo} loading={saving}>Registrar ingreso</Button>
        </div>
      </Modal>

      {/* Modal: Cambiar estado / mover tubo */}
      <Modal open={openMovimiento} onClose={() => setOpenMovimiento(false)} title={`Mover tubo — ${tuboActivo?.numero_serie}`} width={520}>
        {tuboActivo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>ESTADO ACTUAL</p>
                <Badge variant={ESTADOS[tuboActivo.estado_tubo]?.badge}>{ESTADOS[tuboActivo.estado_tubo]?.label}</Badge>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>UBICACIÓN ACTUAL</p>
                <p style={{ fontWeight: 500, fontSize: '13px' }}>{tuboActivo.ubicacion_actual ?? '—'}</p>
              </div>
            </div>

            <Select label="Nuevo estado *" value={movForm.estado_nuevo ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, estado_nuevo: e.target.value }))}>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>

            <Select label="Nueva ubicación" value={movForm.ubicacion_nueva ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, ubicacion_nueva: e.target.value }))}>
              <option value="">Seleccionar sector...</option>
              {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>

            <div style={{ background: 'var(--blue-50)', borderRadius: 'var(--radius)', padding: '12px 14px', border: '1px solid var(--blue-200)' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--blue-700)', marginBottom: '8px' }}>Responsable del movimiento</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Input label="Nombre y apellido *" value={movForm.responsable_nombre ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, responsable_nombre: e.target.value }))} placeholder="Quien realiza el movimiento" />
                <Input label="Sector" value={movForm.responsable_sector ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, responsable_sector: e.target.value }))} placeholder="Ej: Enfermería" />
              </div>
            </div>

            <Textarea label="Observaciones" value={movForm.observaciones ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, observaciones: e.target.value }))} style={{ minHeight: 60 }} placeholder="Motivo del movimiento, novedades, etc." />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenMovimiento(false)}>Cancelar</Button>
          <Button onClick={handleMovimiento} loading={saving}>Confirmar movimiento</Button>
        </div>
      </Modal>

      {/* Modal: Historial del tubo */}
      <Modal open={openHistorial} onClose={() => setOpenHistorial(false)} title={`Historial — Tubo ${tuboActivo?.numero_serie}`} width={620}>
        {tuboActivo && (
          <div>
            <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div><p style={{ fontSize: '11px', color: 'var(--text-3)' }}>GAS</p><p style={{ fontWeight: 600 }}>{GAS_LABEL[tuboActivo.tipo_gas]}</p></div>
              <div><p style={{ fontSize: '11px', color: 'var(--text-3)' }}>PROVEEDOR</p><p style={{ fontWeight: 500, fontSize: '13px' }}>{tuboActivo.proveedores?.razon_social ?? '—'}</p></div>
              <div><p style={{ fontSize: '11px', color: 'var(--text-3)' }}>ESTADO ACTUAL</p><Badge variant={ESTADOS[tuboActivo.estado_tubo]?.badge}>{ESTADOS[tuboActivo.estado_tubo]?.label}</Badge></div>
            </div>

            {historial.length === 0 ? (
              <Empty message="Sin movimientos registrados" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                {historial.map((h, i) => (
                  <div key={h.id} style={{
                    background: i === 0 ? 'var(--blue-50)' : 'var(--slate-50)',
                    borderRadius: 'var(--radius)', padding: '12px 16px',
                    border: `1px solid ${i === 0 ? 'var(--blue-200)' : 'var(--border)'}`,
                    position: 'relative'
                  }}>
                    {i === 0 && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', background: 'var(--blue-600)', color: '#fff', padding: '2px 6px', borderRadius: '99px' }}>ÚLTIMO</span>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {h.estado_anterior && <><Badge variant={ESTADOS[h.estado_anterior]?.badge ?? 'slate'}>{ESTADOS[h.estado_anterior]?.label ?? h.estado_anterior}</Badge><span style={{ color: 'var(--text-3)' }}>→</span></>}
                        <Badge variant={ESTADOS[h.estado_nuevo]?.badge ?? 'slate'}>{ESTADOS[h.estado_nuevo]?.label ?? h.estado_nuevo}</Badge>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(h.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {(h.ubicacion_anterior || h.ubicacion_nueva) && (
                      <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>
                        📍 {h.ubicacion_anterior && h.ubicacion_anterior !== h.ubicacion_nueva ? `${h.ubicacion_anterior} → ` : ''}{h.ubicacion_nueva}
                      </p>
                    )}
                    <p style={{ fontSize: '12px', fontWeight: 500 }}>
                      👤 {h.responsable_nombre}{h.responsable_sector ? ` — ${h.responsable_sector}` : ''}
                    </p>
                    {h.observaciones && <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px', fontStyle: 'italic' }}>{h.observaciones}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Confirmar borrado */}
      <Modal open={openConfirmBorrar} onClose={() => setOpenConfirmBorrar(false)} title="Borrar tubo" width={440}>
        <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <p style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
            ¿Borrar tubo <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--slate-100)', padding: '2px 6px', borderRadius: '4px' }}>{tuboActivo?.numero_serie}</code>?
          </p>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Se eliminará el tubo y todo su historial de movimientos. Esta acción no se puede deshacer.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button variant="secondary" onClick={() => setOpenConfirmBorrar(false)}>Cancelar</Button>
          <Button onClick={handleBorrar} loading={saving}
            style={{ background: 'var(--red-600)', color: '#fff' }}>
            Sí, borrar
          </Button>
        </div>
      </Modal>
    </Page>
  )
}
