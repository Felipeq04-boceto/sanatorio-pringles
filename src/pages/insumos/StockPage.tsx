import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Input, Select, Modal, Spinner, Empty } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const SECTORES_DESTINO = [
  'Internación', 'Guardia', 'Imágenes', 'Quirófano 1', 'Quirófano 2',
  'Sala de partos', 'Recepción del recién nacido', 'Farmacia', 'Laboratorio', 'Administración'
]

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{icon} {label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'var(--font-mono)', margin: 0 }}>{value}</p>
    </div>
  )
}

export function StockPage({ area }: { area?: string }) {
  const { usuario } = useAuth()
  const [insumos,    setInsumos]    = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [proveedores,setProveedores]= useState<any[]>([])
  const [movimientos,setMovimientos]= useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadingMov, setLoadingMov] = useState(false)
  const [tab,        setTab]        = useState<'stock'|'movimientos'>('stock')
  const [search,     setSearch]     = useState('')
  const [filtroCat,  setFiltroCat]  = useState('')
  const [filtroArea, setFiltroArea] = useState(area ?? '')
  const [filtroMov,  setFiltroMov]  = useState('')
  const [openMov,    setOpenMov]    = useState(false)
  const [openNuevo,  setOpenNuevo]  = useState(false)
  const [openHistorial, setOpenHistorial] = useState(false)
  const [historialInsumo, setHistorialInsumo] = useState<any>(null)
  const [historialMovs,   setHistorialMovs]   = useState<any[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [selInsumo,  setSelInsumo]  = useState<any>(null)
  const [movForm,    setMovForm]    = useState<any>({ tipo_movimiento: 'entrada', cantidad: '' })
  const [nuevoForm,  setNuevoForm]  = useState<any>({})
  const [saving,     setSaving]     = useState(false)
  const [openEditar, setOpenEditar] = useState(false)
  const [editForm,   setEditForm]   = useState<any>({})
  const [openConfirmBorrar, setOpenConfirmBorrar] = useState(false)
  const [insumoABorrar,     setInsumoABorrar]     = useState<any>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: i }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('insumos').select('*, categorias_insumo(*)').order('nombre'),
      supabase.from('categorias_insumo').select('*').order('nombre'),
      supabase.from('proveedores').select('*').eq('estado', 'activo').order('razon_social'),
    ])
    setInsumos(i ?? [])
    setCategorias(c ?? [])
    setProveedores(p ?? [])
    setLoading(false)
  }

  async function loadMovimientos() {
    setLoadingMov(true)
    const { data } = await supabase
      .from('movimientos_stock')
      .select('*, insumos(nombre, unidad_medida, area), proveedores(razon_social)')
      .order('created_at', { ascending: false })
      .limit(200)
    setMovimientos(data ?? [])
    setLoadingMov(false)
  }

  async function abrirHistorial(ins: any) {
    setHistorialInsumo(ins)
    setOpenHistorial(true)
    setLoadingHistorial(true)
    const { data } = await supabase
      .from('movimientos_stock')
      .select('*, proveedores(razon_social)')
      .eq('insumo_id', ins.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setHistorialMovs(data ?? [])
    setLoadingHistorial(false)
  }

  useEffect(() => {
    if (tab === 'movimientos' && movimientos.length === 0) loadMovimientos()
  }, [tab])

  async function handleNuevoInsumo() {
    if (!nuevoForm.nombre || !nuevoForm.categoria_id || !nuevoForm.unidad_medida) return
    setSaving(true)
    try {
      const { error } = await supabase.from('insumos').insert({ ...nuevoForm, stock_actual: 0, stock_minimo: nuevoForm.stock_minimo || 0 })
      if (error) { alert('Error: ' + error.message); return }
      setOpenNuevo(false)
      setNuevoForm({})
      loadAll()
    } finally { setSaving(false) }
  }

  async function handleEditarInsumo() {
    if (!editForm.nombre || !editForm.categoria_id || !editForm.unidad_medida) return
    setSaving(true)
    try {
      const { categorias_insumo: _c, ...datos } = editForm
      const { error } = await supabase.from('insumos').update(datos).eq('id', editForm.id)
      if (error) { alert('Error: ' + error.message); return }
      setOpenEditar(false)
      loadAll()
    } finally { setSaving(false) }
  }

  async function handleBorrarInsumo() {
    if (!insumoABorrar) return
    setSaving(true)
    try {
      const { error } = await supabase.from('insumos').delete().eq('id', insumoABorrar.id)
      if (error) {
        if (error.code === '23503') {
          alert('No se puede borrar este insumo porque tiene movimientos registrados. Marcalo como "inactivo".')
        } else {
          alert('Error al borrar: ' + error.message)
        }
        return
      }
      setOpenConfirmBorrar(false)
      setInsumoABorrar(null)
      loadAll()
    } finally { setSaving(false) }
  }

  async function handleMovimiento() {
    if (!selInsumo || !movForm.cantidad) return
    setSaving(true)
    try {
      const user = (await supabase.auth.getUser()).data.user
      const { error } = await supabase.from('movimientos_stock').insert({
        insumo_id:        selInsumo.id,
        tipo_movimiento:  movForm.tipo_movimiento,
        cantidad:         parseFloat(movForm.cantidad),
        remito_numero:    movForm.remito_numero || null,
        proveedor_id:     movForm.proveedor_id || null,
        precio_unitario:  movForm.precio_unitario ? parseFloat(movForm.precio_unitario) : null,
        observaciones:    movForm.observaciones || null,
        sector_destino:   movForm.sector_destino || null,
        registrado_por:   user?.id,
      })
      if (error) { alert('Error: ' + error.message); return }

      setOpenMov(false)
      setMovForm({ tipo_movimiento: 'entrada', cantidad: '' })
      await loadAll()

      // Alerta stock mínimo — fire-and-forget
      supabase.functions.invoke('alerta-stock-minimo', { body: { insumoId: selInsumo.id } })
        .catch((e: unknown) => console.warn('alerta-stock-minimo:', e))

      // Actualizar historial si está abierto
      if (openHistorial && historialInsumo?.id === selInsumo.id) abrirHistorial(selInsumo)
      if (tab === 'movimientos') loadMovimientos()
    } finally { setSaving(false) }
  }

  function stockColor(ins: any) {
    if (ins.stock_actual === 0) return 'var(--red-600)'
    if (ins.stock_minimo > 0 && ins.stock_actual <= ins.stock_minimo) return 'var(--amber-600)'
    return 'var(--green-600)'
  }
  function stockBadge(ins: any): any {
    if (ins.stock_actual === 0) return 'red'
    if (ins.stock_minimo > 0 && ins.stock_actual <= ins.stock_minimo) return 'amber'
    return 'green'
  }
  function stockLabel(ins: any) {
    if (ins.stock_actual === 0) return 'Sin stock'
    if (ins.stock_minimo > 0 && ins.stock_actual <= ins.stock_minimo) return 'Stock bajo'
    return 'Normal'
  }

  function tipoMovLabel(tipo: string) {
    const map: Record<string, string> = { entrada: '📥 Entrada', salida: '📤 Salida', devolucion: '↩️ Devolución', ajuste: '🔧 Ajuste', baja: '🗑️ Baja' }
    return map[tipo] ?? tipo
  }

  const canEdit = !!usuario?.rol && ['admin', 'referente_enfermeria', 'referente_quirofano', 'referente_instrumentadores'].includes(usuario.rol)

  const filtered = insumos.filter(i => {
    const matchSearch = !search || i.nombre.toLowerCase().includes(search.toLowerCase())
    const matchCat    = !filtroCat  || i.categoria_id === filtroCat
    const matchArea   = !filtroArea || i.area === filtroArea
    return matchSearch && matchCat && matchArea
  })

  const filteredMov = movimientos.filter(m => {
    if (!filtroMov) return true
    return m.tipo_movimiento === filtroMov || m.insumos?.nombre?.toLowerCase().includes(filtroMov.toLowerCase())
  })

  const insumosScope = area ? insumos.filter(i => i.area === area) : insumos
  const sinStock   = insumosScope.filter(i => i.stock_actual === 0 && i.estado === 'activo').length
  const bajoMin    = insumosScope.filter(i => i.stock_actual > 0 && i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo && i.estado === 'activo').length
  const normal     = insumosScope.filter(i => i.stock_actual > (i.stock_minimo ?? 0) && i.estado === 'activo').length

  const pageTitle = area === 'enfermeria' ? 'Stock Enfermería' : area === 'quirofano' ? 'Stock Quirófano' : 'Stock e Insumos'

  return (
    <Page>
      <PageHeader title={pageTitle}
        subtitle={`${insumosScope.filter(i => i.estado === 'activo').length} insumos activos`}
        action={canEdit ? <Button onClick={() => { setNuevoForm({ estado: 'activo', area: area ?? '' }); setOpenNuevo(true) }}>+ Nuevo insumo</Button> : undefined}
      />

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Sin stock"   value={sinStock} color="var(--red-600)"   icon="🔴" />
        <StatCard label="Stock bajo"  value={bajoMin}  color="var(--amber-600)" icon="🟡" />
        <StatCard label="Normal"      value={normal}   color="var(--green-600)" icon="🟢" />
        <StatCard label="Total"       value={insumos.filter(i => i.estado === 'activo').length} color="var(--text)" icon="📦" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', marginBottom: 18 }}>
        {([['stock','📦 Stock'], ['movimientos','📋 Historial de movimientos']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === key ? 700 : 400,
              color: tab === key ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-2px', fontSize: 13 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: STOCK ─────────────────────────────────────────────────── */}
      {tab === 'stock' && <>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <Input placeholder="Buscar insumo..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
          <Select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ width: 190 }}>
            <option value="">Todas las categorías</option>
            {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          {!area && (
            <Select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{ width: 160 }}>
              <option value="">Todas las áreas</option>
              <option value="quirofano">🔵 Quirófano</option>
              <option value="enfermeria">🟢 Enfermería</option>
            </Select>
          )}
        </div>

        <Card>
          {loading
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
            : filtered.length === 0 ? <Empty message="No se encontraron insumos" />
            : <Table>
                <thead><tr>
                  <Th>Insumo</Th><Th>Categoría</Th><Th>Área</Th>
                  <Th>Stock actual</Th><Th>Mínimo</Th><Th>Ubicación</Th><Th>Estado</Th>
                  {canEdit && <Th>Acciones</Th>}
                </tr></thead>
                <tbody>{filtered.map((ins: any) => (
                  <tr key={ins.id}>
                    <Td>
                      <div>
                        <p style={{ fontWeight: 500 }}>{ins.nombre}</p>
                        {ins.descripcion && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{ins.descripcion}</p>}
                      </div>
                    </Td>
                    <Td style={{ fontSize: 12 }}>{ins.categorias_insumo?.nombre ?? '—'}</Td>
                    <Td>
                      <Badge variant={ins.area === 'quirofano' ? 'blue' : 'green'}>
                        {ins.area === 'quirofano' ? 'Quirófano' : ins.area === 'enfermeria' ? 'Enfermería' : '—'}
                      </Badge>
                    </Td>
                    <Td>
                      <span style={{ fontWeight: 600, color: stockColor(ins), fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                        {ins.stock_actual} {ins.unidad_medida}
                      </span>
                    </Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-3)' }}>{ins.stock_minimo} {ins.unidad_medida}</Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>{ins.ubicacion ?? '—'}</Td>
                    <Td><Badge variant={stockBadge(ins)}>{stockLabel(ins)}</Badge></Td>
                    {canEdit && <Td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button variant="secondary" size="sm" onClick={() => { setSelInsumo(ins); setMovForm({ tipo_movimiento: 'entrada', cantidad: '' }); setOpenMov(true) }}>
                          Movimiento
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => abrirHistorial(ins)}>Historial</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditForm({ ...ins }); setOpenEditar(true) }}>Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setInsumoABorrar(ins); setOpenConfirmBorrar(true) }} style={{ color: 'var(--red-600)' }}>Borrar</Button>
                      </div>
                    </Td>}
                  </tr>
                ))}</tbody>
              </Table>
          }
        </Card>
      </>}

      {/* ── TAB: MOVIMIENTOS ───────────────────────────────────────────── */}
      {tab === 'movimientos' && <>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <Input placeholder="Buscar insumo o tipo..." value={filtroMov} onChange={e => setFiltroMov(e.target.value)} style={{ maxWidth: 280 }} />
          <Button variant="secondary" size="sm" onClick={loadMovimientos}>↻ Actualizar</Button>
        </div>
        <Card>
          {loadingMov
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
            : filteredMov.length === 0 ? <Empty message="Sin movimientos registrados" />
            : <Table>
                <thead><tr><Th>Fecha</Th><Th>Insumo</Th><Th>Área</Th><Th>Tipo</Th><Th>Cantidad</Th><Th>Proveedor / Sector</Th><Th>Remito</Th><Th>Obs.</Th></tr></thead>
                <tbody>{filteredMov.map((m: any) => (
                  <tr key={m.id}>
                    <Td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Td>
                    <Td style={{ fontWeight: 500 }}>{m.insumos?.nombre ?? '—'}</Td>
                    <Td>
                      {m.insumos?.area && (
                        <Badge variant={m.insumos.area === 'quirofano' ? 'blue' : 'green'}>
                          {m.insumos.area === 'quirofano' ? 'Q' : 'E'}
                        </Badge>
                      )}
                    </Td>
                    <Td style={{ fontSize: 12 }}>{tipoMovLabel(m.tipo_movimiento)}</Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: ['entrada','devolucion'].includes(m.tipo_movimiento) ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 600 }}>
                      {['entrada','devolucion'].includes(m.tipo_movimiento) ? '+' : '-'}{m.cantidad} {m.insumos?.unidad_medida}
                    </Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.proveedores?.razon_social ?? m.sector_destino ?? '—'}</Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.remito_numero ?? '—'}</Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.observaciones ?? '—'}</Td>
                  </tr>
                ))}</tbody>
              </Table>
          }
        </Card>
      </>}

      {/* ── MODAL: Nuevo movimiento ─────────────────────────────────────── */}
      <Modal open={openMov} onClose={() => setOpenMov(false)} title={'Movimiento — ' + (selInsumo?.nombre ?? '')} width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Stock actual</p>
            <p style={{ fontWeight: 700, fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--blue-600)' }}>{selInsumo?.stock_actual} {selInsumo?.unidad_medida}</p>
            {selInsumo?.stock_minimo > 0 && <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Mínimo: {selInsumo.stock_minimo} {selInsumo.unidad_medida}</p>}
          </div>
          <Select label="Tipo de movimiento" value={movForm.tipo_movimiento} onChange={e => setMovForm((p: any) => ({ ...p, tipo_movimiento: e.target.value }))}>
            <option value="entrada">📥 Entrada (compra / recepción)</option>
            <option value="salida">📤 Salida (consumo)</option>
            <option value="devolucion">↩️ Devolución</option>
            <option value="ajuste">🔧 Ajuste de inventario</option>
            <option value="baja">🗑️ Baja / descarte</option>
          </Select>
          <Input label="Cantidad *" type="number" step="0.001" value={movForm.cantidad} onChange={e => setMovForm((p: any) => ({ ...p, cantidad: e.target.value }))} />
          <Input label="Nro de remito" value={movForm.remito_numero ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, remito_numero: e.target.value }))} />
          {movForm.tipo_movimiento === 'entrada' && (
            <Select label="Proveedor" value={movForm.proveedor_id ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, proveedor_id: e.target.value }))}>
              <option value="">Seleccionar...</option>
              {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </Select>
          )}
          {movForm.tipo_movimiento === 'entrada' && (
            <Input label="Precio unitario" type="number" step="0.01" value={movForm.precio_unitario ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, precio_unitario: e.target.value }))} placeholder="Opcional" />
          )}
          {(['salida', 'baja'] as const).includes(movForm.tipo_movimiento) && (
            <Select label="Sector destino" value={movForm.sector_destino ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, sector_destino: e.target.value }))}>
              <option value="">Seleccionar sector...</option>
              {SECTORES_DESTINO.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
          <Input label="Observaciones" value={movForm.observaciones ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, observaciones: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <Button variant="secondary" onClick={() => setOpenMov(false)}>Cancelar</Button>
          <Button onClick={handleMovimiento} loading={saving}>Registrar</Button>
        </div>
      </Modal>

      {/* ── MODAL: Historial del insumo ─────────────────────────────────── */}
      <Modal open={openHistorial} onClose={() => setOpenHistorial(false)} title={`Historial — ${historialInsumo?.nombre ?? ''}`} width={640}>
        <div style={{ marginBottom: 12 }}>
          <Badge variant={stockBadge(historialInsumo ?? {})}>{historialInsumo ? stockLabel(historialInsumo) : ''}</Badge>
          <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-2)' }}>
            Stock actual: <strong style={{ fontFamily: 'var(--font-mono)' }}>{historialInsumo?.stock_actual} {historialInsumo?.unidad_medida}</strong>
          </span>
        </div>
        {loadingHistorial
          ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
          : historialMovs.length === 0 ? <Empty message="Sin movimientos para este insumo" />
          : <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <Table>
                <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Cantidad</Th><Th>Proveedor / Sector</Th><Th>Remito</Th></tr></thead>
                <tbody>{historialMovs.map((m: any) => (
                  <tr key={m.id}>
                    <Td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Td>
                    <Td style={{ fontSize: 12 }}>{tipoMovLabel(m.tipo_movimiento)}</Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: ['entrada','devolucion'].includes(m.tipo_movimiento) ? 'var(--green-600)' : 'var(--red-600)' }}>
                      {['entrada','devolucion'].includes(m.tipo_movimiento) ? '+' : '-'}{m.cantidad} {historialInsumo?.unidad_medida}
                    </Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.proveedores?.razon_social ?? m.sector_destino ?? '—'}</Td>
                    <Td style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.remito_numero ?? '—'}</Td>
                  </tr>
                ))}</tbody>
              </Table>
            </div>
        }
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="secondary" onClick={() => setOpenHistorial(false)}>Cerrar</Button>
        </div>
      </Modal>

      {/* ── MODAL: Nuevo insumo ────────────────────────────────────────── */}
      <Modal open={openNuevo} onClose={() => setOpenNuevo(false)} title="Nuevo insumo" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Nombre *" value={nuevoForm.nombre ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, nombre: e.target.value }))} />
          <Input label="Descripción" value={nuevoForm.descripcion ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, descripcion: e.target.value }))} />
          <Select label="Categoría *" value={nuevoForm.categoria_id ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, categoria_id: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Input label="Unidad de medida *" value={nuevoForm.unidad_medida ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, unidad_medida: e.target.value }))} placeholder="ej: unidades, litros, kg" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="Stock mínimo" type="number" value={nuevoForm.stock_minimo ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, stock_minimo: e.target.value }))} />
            <Input label="Ubicación" value={nuevoForm.ubicacion ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, ubicacion: e.target.value }))} />
          </div>
          <Select label="Área *" value={nuevoForm.area ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, area: e.target.value }))}>
            <option value="">Seleccionar...</option>
            <option value="enfermeria">Enfermería</option>
            <option value="quirofano">Quirófano</option>
          </Select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <Button variant="secondary" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
          <Button onClick={handleNuevoInsumo} loading={saving}>Guardar</Button>
        </div>
      </Modal>

      {/* ── MODAL: Editar insumo ────────────────────────────────────────── */}
      <Modal open={openEditar} onClose={() => setOpenEditar(false)} title="Editar insumo" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Nombre *" value={editForm.nombre ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, nombre: e.target.value }))} />
          <Select label="Categoría *" value={editForm.categoria_id ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, categoria_id: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="Unidad *" value={editForm.unidad_medida ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, unidad_medida: e.target.value }))} />
            <Input label="Stock mínimo" type="number" value={editForm.stock_minimo ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, stock_minimo: e.target.value }))} />
          </div>
          <Input label="Ubicación" value={editForm.ubicacion ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, ubicacion: e.target.value }))} />
          <Input label="Descripción" value={editForm.descripcion ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, descripcion: e.target.value }))} />
          <Select label="Estado" value={editForm.estado ?? 'activo'} onChange={e => setEditForm((p: any) => ({ ...p, estado: e.target.value }))}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </Select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setOpenEditar(false)}>Cancelar</Button>
          <Button onClick={handleEditarInsumo} loading={saving}>Guardar cambios</Button>
        </div>
      </Modal>

      {/* ── MODAL: Confirmar borrado ────────────────────────────────────── */}
      <Modal open={openConfirmBorrar} onClose={() => setOpenConfirmBorrar(false)} title="Borrar insumo" width={420}>
        <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>¿Borrar <strong>{insumoABorrar?.nombre}</strong>?</p>
          <p style={{ color: 'var(--text-2)', fontSize: 13 }}>
            Se eliminará el insumo y no podrá recuperarse.
            {insumoABorrar?.stock_actual > 0 && <> Tiene <strong>{insumoABorrar.stock_actual} {insumoABorrar.unidad_medida}</strong> en stock.</>}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={() => setOpenConfirmBorrar(false)}>Cancelar</Button>
          <Button onClick={handleBorrarInsumo} loading={saving} style={{ background: 'var(--red-600)', color: '#fff' }}>Sí, borrar</Button>
        </div>
      </Modal>
    </Page>
  )
}
