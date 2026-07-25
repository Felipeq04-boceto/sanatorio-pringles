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

export function StockPage() {
  const { usuario } = useAuth()
  const [insumos, setInsumos] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [openMov, setOpenMov] = useState(false)
  const [openNuevo, setOpenNuevo] = useState(false)
  const [selInsumo, setSelInsumo] = useState<any>(null)
  const [movForm, setMovForm] = useState<any>({ tipo_movimiento: 'entrada', cantidad: '' })
  const [nuevoForm, setNuevoForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [openEditar, setOpenEditar] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [openConfirmBorrar, setOpenConfirmBorrar] = useState(false)
  const [insumoABorrar, setInsumoABorrar] = useState<any>(null)

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

  async function handleNuevoInsumo() {
    if (!nuevoForm.nombre || !nuevoForm.categoria_id || !nuevoForm.unidad_medida) return
    setSaving(true)
    try {
      const { error: insErr } = await supabase.from('insumos').insert({ ...nuevoForm, stock_actual: 0, stock_minimo: nuevoForm.stock_minimo || 0 })
      if (insErr) { alert('Error: ' + insErr.message); return }
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
          alert('No se puede borrar este insumo porque tiene movimientos de stock registrados. Si querés dejar de usarlo, marcalo como "inactivo" en vez de borrarlo.')
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
      await supabase.from('movimientos_stock').insert({
        insumo_id: selInsumo.id,
        tipo_movimiento: movForm.tipo_movimiento,
        cantidad: parseFloat(movForm.cantidad),
        remito_numero: movForm.remito_numero || null,
        proveedor_id: movForm.proveedor_id || null,
        precio_unitario: movForm.precio_unitario ? parseFloat(movForm.precio_unitario) : null,
        observaciones: movForm.observaciones || null,
        registrado_por: user?.id,
      })
      setOpenMov(false)
      setMovForm({ tipo_movimiento: 'entrada', cantidad: '' })
      loadAll()
    } finally { setSaving(false) }
  }

  function stockColor(ins: any) {
    if (ins.stock_actual === 0) return 'var(--red-600)'
    if (ins.stock_actual <= ins.stock_minimo) return 'var(--amber-600)'
    return 'var(--green-600)'
  }

  function stockBadge(ins: any): any {
    if (ins.stock_actual === 0) return 'red'
    if (ins.stock_actual <= ins.stock_minimo) return 'amber'
    return 'green'
  }

  const canEdit = usuario?.rol && ['admin', 'referente_enfermeria', 'referente_instrumentadores'].includes(usuario.rol)
  const filtered = insumos.filter(i => {
    const matchSearch = !search || i.nombre.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filtroCat || i.categoria_id === filtroCat
    return matchSearch && matchCat
  })

  return (
    <Page>
      <PageHeader title="Stock general" subtitle={filtered.length + ' insumos'}
        action={canEdit ? <Button onClick={() => { setNuevoForm({ estado: 'activo' }); setOpenNuevo(true) }}>+ Nuevo insumo</Button> : undefined} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Input placeholder="Buscar insumo..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <Select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ width: 200 }}>
          <option value="">Todas las categorías</option>
          {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Select>
      </div>

      <Card>
        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div> :
        filtered.length === 0 ? <Empty message="No se encontraron insumos" /> :
        <Table>
          <thead><tr><Th>Insumo</Th><Th>Categoría</Th><Th>Stock actual</Th><Th>Mínimo</Th><Th>Ubicación</Th><Th>Estado</Th>{canEdit && <Th>Acciones</Th>}</tr></thead>
          <tbody>{filtered.map((ins: any) => (
            <tr key={ins.id}>
              <Td><div><p style={{ fontWeight: 500 }}>{ins.nombre}</p>{ins.descripcion && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{ins.descripcion}</p>}</div></Td>
              <Td style={{ fontSize: 12 }}>{ins.categorias_insumo?.nombre ?? '—'}</Td>
              <Td><span style={{ fontWeight: 600, color: stockColor(ins), fontFamily: 'var(--font-mono)', fontSize: 13 }}>{ins.stock_actual} {ins.unidad_medida}</span></Td>
              <Td style={{ fontSize: 12, color: 'var(--text-3)' }}>{ins.stock_minimo} {ins.unidad_medida}</Td>
              <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>{ins.ubicacion ?? '—'}</Td>
              <Td><Badge variant={stockBadge(ins)}>{ins.stock_actual === 0 ? 'Sin stock' : ins.stock_actual <= ins.stock_minimo ? 'Stock bajo' : 'Normal'}</Badge></Td>
              {canEdit && <Td><div style={{ display: 'flex', gap: '4px' }}>
                <Button variant="secondary" size="sm" onClick={() => { setSelInsumo(ins); setMovForm({ tipo_movimiento: 'entrada', cantidad: '' }); setOpenMov(true) }}>Movimiento</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditForm({ ...ins }); setOpenEditar(true) }}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => { setInsumoABorrar(ins); setOpenConfirmBorrar(true) }} style={{ color: 'var(--red-600)' }}>Borrar</Button>
              </div></Td>}
            </tr>
          ))}</tbody>
        </Table>}
      </Card>

      {/* Modal nuevo insumo */}
      <Modal open={openNuevo} onClose={() => setOpenNuevo(false)} title="Nuevo insumo" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Nombre *" value={nuevoForm.nombre ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, nombre: e.target.value }))} />
          <Input label="Descripción" value={nuevoForm.descripcion ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, descripcion: e.target.value }))} />
          <Select label="Categoría *" value={nuevoForm.categoria_id ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, categoria_id: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Input label="Unidad de medida *" value={nuevoForm.unidad_medida ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, unidad_medida: e.target.value }))} placeholder="ej: unidades, litros, kg, m³" />
          <Input label="Stock mínimo" type="number" value={nuevoForm.stock_minimo ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, stock_minimo: e.target.value }))} />
          <Input label="Ubicación" value={nuevoForm.ubicacion ?? ''} onChange={e => setNuevoForm((p: any) => ({ ...p, ubicacion: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <Button variant="secondary" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
          <Button onClick={handleNuevoInsumo} loading={saving}>Guardar</Button>
        </div>
      </Modal>

      {/* Modal movimiento */}
      <Modal open={openMov} onClose={() => setOpenMov(false)} title={'Movimiento — ' + (selInsumo?.nombre ?? '')} width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Stock actual</p>
            <p style={{ fontWeight: 700, fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--blue-600)' }}>{selInsumo?.stock_actual} {selInsumo?.unidad_medida}</p>
          </div>
          <Select label="Tipo de movimiento" value={movForm.tipo_movimiento} onChange={e => setMovForm((p: any) => ({ ...p, tipo_movimiento: e.target.value }))}>
            <option value="entrada">Entrada (compra / recepción)</option>
            <option value="salida">Salida (consumo)</option>
            <option value="devolucion">Devolución</option>
            <option value="ajuste">Ajuste de inventario</option>
            <option value="baja">Baja / descarte</option>
          </Select>
          <Input label="Cantidad *" type="number" step="0.001" value={movForm.cantidad} onChange={e => setMovForm((p: any) => ({ ...p, cantidad: e.target.value }))} />
          <Input label="Nro de remito" value={movForm.remito_numero ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, remito_numero: e.target.value }))} />
          {movForm.tipo_movimiento === 'entrada' && (
            <Select label="Proveedor" value={movForm.proveedor_id ?? ''} onChange={e => setMovForm((p: any) => ({ ...p, proveedor_id: e.target.value }))}>
              <option value="">Seleccionar...</option>
              {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </Select>
          )}
          {(movForm.tipo_movimiento === 'salida' || movForm.tipo_movimiento === 'baja') && (
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

      {/* Modal editar insumo */}
      <Modal open={openEditar} onClose={() => setOpenEditar(false)} title="Editar insumo" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="Nombre *" value={editForm.nombre ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, nombre: e.target.value }))} />
          <Select label="Categoría *" value={editForm.categoria_id ?? ''} onChange={e => setEditForm((p: any) => ({ ...p, categoria_id: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenEditar(false)}>Cancelar</Button>
          <Button onClick={handleEditarInsumo} loading={saving}>Guardar cambios</Button>
        </div>
      </Modal>

      {/* Modal confirmar borrado */}
      <Modal open={openConfirmBorrar} onClose={() => setOpenConfirmBorrar(false)} title="Borrar insumo" width={420}>
        <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <p style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
            ¿Borrar <strong>{insumoABorrar?.nombre}</strong>?
          </p>
          <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
            Se eliminará el insumo y no podrá recuperarse.
              {insumoABorrar?.stock_actual > 0 && (
                <> Actualmente tiene <strong>{insumoABorrar.stock_actual} {insumoABorrar.unidad_medida}</strong> en stock.</>
              )}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button variant="secondary" onClick={() => setOpenConfirmBorrar(false)}>Cancelar</Button>
          <Button onClick={handleBorrarInsumo} loading={saving} style={{ background: 'var(--red-600)', color: '#fff' }}>
            Sí, borrar
          </Button>
        </div>
      </Modal>
    </Page>
  )
}
