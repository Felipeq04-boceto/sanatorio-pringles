import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Input, Select, Modal, Spinner, Empty } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

// ─── tipos ────────────────────────────────────────────────────────────────────

type EstadoPedido = 'borrador' | 'solicitado' | 'aprobado' | 'recibido' | 'cancelado'

interface ItemPedido {
  id?: string
  insumo_id: string
  cantidad_solicitada: number
  cantidad_recibida?: number
  precio_unitario?: number
  observaciones?: string
  insumos?: { nombre: string; unidad_medida: string }
}

interface Pedido {
  id: string
  numero: string
  estado: EstadoPedido
  proveedor_id?: string
  observaciones?: string
  fecha_solicitud?: string
  fecha_aprobacion?: string
  fecha_recepcion?: string
  remito_numero?: string
  creado_por?: string
  created_at: string
  proveedores?: { razon_social: string }
  items_pedido?: ItemPedido[]
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  borrador:   '✏️ Borrador',
  solicitado: '📤 Solicitado',
  aprobado:   '✅ Aprobado',
  recibido:   '📦 Recibido',
  cancelado:  '❌ Cancelado',
}

const ESTADO_BADGE: Record<EstadoPedido, 'slate' | 'blue' | 'green' | 'teal' | 'red'> = {
  borrador:   'slate',
  solicitado: 'blue',
  aprobado:   'green',
  recibido:   'teal',
  cancelado:  'red',
}

function formatFecha(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── componente principal ─────────────────────────────────────────────────────

export function PedidosPage() {
  const { usuario } = useAuth()
  const [pedidos, setPedidos]           = useState<Pedido[]>([])
  const [insumos, setInsumos]           = useState<any[]>([])
  const [proveedores, setProveedores]   = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [search, setSearch]             = useState('')

  // Modal nuevo pedido
  const [openNuevo, setOpenNuevo]   = useState(false)
  const [nuevoForm, setNuevoForm]   = useState<any>({ observaciones: '' })
  const [items, setItems]           = useState<Partial<ItemPedido>[]>([{ insumo_id: '', cantidad_solicitada: 1 }])
  const [saving, setSaving]         = useState(false)

  // Modal detalle
  const [pedidoSel, setPedidoSel]     = useState<Pedido | null>(null)
  const [openDetalle, setOpenDetalle] = useState(false)

  // Modal recepción
  const [openRecibir, setOpenRecibir]     = useState(false)
  const [recibirForm, setRecibirForm]     = useState<any>({ remito_numero: '', observaciones: '' })
  const [cantRecibidas, setCantRecibidas] = useState<Record<string, number>>({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ps }, { data: ins }, { data: provs }] = await Promise.all([
      supabase
        .from('pedidos_insumos')
        .select('*, proveedores(razon_social), items_pedido(*, insumos(nombre, unidad_medida))')
        .order('created_at', { ascending: false }),
      supabase.from('insumos').select('id, nombre, unidad_medida, stock_actual').eq('estado', 'activo').order('nombre'),
      supabase.from('proveedores').select('id, razon_social').eq('estado', 'activo').order('razon_social'),
    ])
    setPedidos((ps ?? []) as Pedido[])
    setInsumos(ins ?? [])
    setProveedores(provs ?? [])
    setLoading(false)
  }

  // ── crear pedido ──────────────────────────────────────────────────────────

  async function handleCrearPedido() {
    const itemsValidos = items.filter(i => i.insumo_id && (i.cantidad_solicitada ?? 0) > 0)
    if (itemsValidos.length === 0) return
    setSaving(true)
    try {
      const año = new Date().getFullYear()
      const { count } = await supabase
        .from('pedidos_insumos')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${año}-01-01`)
      const numero = `PED-${año}-${String((count ?? 0) + 1).padStart(4, '0')}`

      const { data: pedido, error } = await supabase
        .from('pedidos_insumos')
        .insert({
          numero,
          estado:       'borrador',
          proveedor_id: nuevoForm.proveedor_id || null,
          observaciones: nuevoForm.observaciones || null,
          creado_por:   usuario?.id ?? null,
        })
        .select().single()

      if (error || !pedido) throw error ?? new Error('No se pudo crear el pedido')

      await supabase.from('items_pedido').insert(
        itemsValidos.map(i => ({
          pedido_id:           pedido.id,
          insumo_id:           i.insumo_id,
          cantidad_solicitada: i.cantidad_solicitada,
          precio_unitario:     i.precio_unitario ?? null,
          observaciones:       i.observaciones ?? null,
        }))
      )

      setOpenNuevo(false)
      setNuevoForm({ observaciones: '' })
      setItems([{ insumo_id: '', cantidad_solicitada: 1 }])
      await loadAll()
    } finally { setSaving(false) }
  }

  // ── cambiar estado ────────────────────────────────────────────────────────

  async function cambiarEstado(pedido: Pedido, nuevoEstado: EstadoPedido) {
    const update: any = { estado: nuevoEstado }
    if (nuevoEstado === 'solicitado') update.fecha_solicitud  = new Date().toISOString()
    if (nuevoEstado === 'aprobado')   update.fecha_aprobacion = new Date().toISOString()
    await supabase.from('pedidos_insumos').update(update).eq('id', pedido.id)
    await loadAll()
  }

  // ── recibir mercadería ────────────────────────────────────────────────────

  async function handleRecibir() {
    if (!pedidoSel) return
    setSaving(true)
    try {
      await supabase.from('pedidos_insumos').update({
        estado:          'recibido',
        fecha_recepcion: new Date().toISOString(),
        remito_numero:   recibirForm.remito_numero || null,
        observaciones:   recibirForm.observaciones || null,
      }).eq('id', pedidoSel.id)

      await Promise.all((pedidoSel.items_pedido ?? []).map(async (item) => {
        const cant = cantRecibidas[item.id!] ?? item.cantidad_solicitada
        if (cant <= 0) return
        await supabase.from('items_pedido').update({ cantidad_recibida: cant }).eq('id', item.id!)
        await supabase.from('movimientos_stock').insert({
          insumo_id:       item.insumo_id,
          tipo_movimiento: 'entrada',
          cantidad:        cant,
          remito_numero:   recibirForm.remito_numero || null,
          proveedor_id:    pedidoSel.proveedor_id || null,
          precio_unitario: item.precio_unitario ?? null,
          observaciones:   `Pedido ${pedidoSel.numero}`,
          registrado_por:  usuario?.id ?? null,
        })
        await supabase.rpc('incrementar_stock', { p_insumo_id: item.insumo_id, p_cantidad: cant })
      }))

      setOpenRecibir(false)
      setOpenDetalle(false)
      setPedidoSel(null)
      setRecibirForm({ remito_numero: '', observaciones: '' })
      setCantRecibidas({})
      await loadAll()
    } finally { setSaving(false) }
  }

  // ── filtros ───────────────────────────────────────────────────────────────

  const pedidosFiltrados = pedidos.filter(p => {
    if (filtroEstado && p.estado !== filtroEstado) return false
    if (search) {
      const q = search.toLowerCase()
      return p.numero.toLowerCase().includes(q) ||
        (p.proveedores?.razon_social ?? '').toLowerCase().includes(q) ||
        (p.observaciones ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const stats = {
    borrador:   pedidos.filter(p => p.estado === 'borrador').length,
    solicitado: pedidos.filter(p => p.estado === 'solicitado').length,
    aprobado:   pedidos.filter(p => p.estado === 'aprobado').length,
    recibido:   pedidos.filter(p => p.estado === 'recibido').length,
  }

  // ── items del form ────────────────────────────────────────────────────────

  function addItem() { setItems(prev => [...prev, { insumo_id: '', cantidad_solicitada: 1 }]) }
  function updateItem(idx: number, field: string, value: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <Page><div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner /></div></Page>

  return (
    <Page>
      <PageHeader title="Pedidos de Insumos" action={
        <Button onClick={() => setOpenNuevo(true)}>+ Nuevo pedido</Button>
      } />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {([
          { label: 'Borradores',  value: stats.borrador,   bg: '#f8fafc', border: '#e2e8f0', color: '#475569' },
          { label: 'Solicitados', value: stats.solicitado, bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
          { label: 'Aprobados',   value: stats.aprobado,   bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
          { label: 'Recibidos',   value: stats.recibido,   bg: '#f0fdfa', border: '#99f6e4', color: '#0f766e' },
        ] as const).map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: s.color, margin: 0, fontFamily: 'var(--font-mono)' }}>{s.value}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          placeholder="Buscar por número, proveedor..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <Select value={filtroEstado} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFiltroEstado(e.target.value)} style={{ width: 200 }}>
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_LABEL) as EstadoPedido[]).map(e => (
            <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
          ))}
        </Select>
      </div>

      {/* Tabla */}
      {pedidosFiltrados.length === 0 ? (
        <Empty message="No hay pedidos que coincidan con los filtros." />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Proveedor</Th>
                <Th>Estado</Th>
                <Th>Ítems</Th>
                <Th>Fecha</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.map(p => (
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setPedidoSel(p); setOpenDetalle(true) }}
                >
                  <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{p.numero}</Td>
                  <Td>{p.proveedores?.razon_social ?? <span style={{ color: 'var(--text-3)' }}>Sin proveedor</span>}</Td>
                  <Td><Badge variant={ESTADO_BADGE[p.estado]}>{ESTADO_LABEL[p.estado]}</Badge></Td>
                  <Td style={{ color: 'var(--text-3)' }}>{p.items_pedido?.length ?? 0} ítem{(p.items_pedido?.length ?? 0) !== 1 ? 's' : ''}</Td>
                  <Td style={{ color: 'var(--text-3)', fontSize: 12 }}>{formatFecha(p.created_at)}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                      {p.estado === 'borrador' && (
                        <Button size="sm" variant="secondary" onClick={() => cambiarEstado(p, 'solicitado')}>Enviar</Button>
                      )}
                      {p.estado === 'solicitado' && (
                        <Button size="sm" variant="secondary" onClick={() => cambiarEstado(p, 'aprobado')}>Aprobar</Button>
                      )}
                      {p.estado === 'aprobado' && (
                        <Button size="sm" onClick={() => {
                          setPedidoSel(p)
                          const init: Record<string, number> = {}
                          p.items_pedido?.forEach(it => { if (it.id) init[it.id] = it.cantidad_solicitada })
                          setCantRecibidas(init)
                          setOpenRecibir(true)
                        }}>Recibir</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* ── Modal nuevo pedido ──────────────────────────────────────────────── */}
      <Modal open={openNuevo} onClose={() => setOpenNuevo(false)} title="Nuevo pedido de insumos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Select
            label="Proveedor (opcional)"
            value={nuevoForm.proveedor_id ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNuevoForm((f: any) => ({ ...f, proveedor_id: e.target.value || undefined }))}
          >
            <option value="">Sin proveedor asignado</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </Select>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Observaciones</label>
            <textarea
              style={{ width: '100%', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 13, resize: 'none', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
              rows={2}
              value={nuevoForm.observaciones ?? ''}
              onChange={e => setNuevoForm((f: any) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Urgente, para quirófano, etc."
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>Ítems del pedido</label>
              <button onClick={addItem} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Agregar ítem</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={item.insumo_id ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateItem(idx, 'insumo_id', e.target.value)}
                    >
                      <option value="">Seleccionar insumo…</option>
                      {insumos.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.nombre} (stock: {i.stock_actual} {i.unidad_medida})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ width: 90 }}>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      value={item.cantidad_solicitada ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateItem(idx, 'cantidad_solicitada', Number(e.target.value))}
                    />
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
            <Button variant="secondary" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
            <Button
              onClick={handleCrearPedido}
              disabled={saving || items.filter(i => i.insumo_id && (i.cantidad_solicitada ?? 0) > 0).length === 0}
            >
              {saving ? 'Creando…' : 'Crear pedido'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal detalle ───────────────────────────────────────────────────── */}
      <Modal open={openDetalle} onClose={() => { setOpenDetalle(false); setPedidoSel(null) }} title={`Pedido ${pedidoSel?.numero ?? ''}`} width={600}>
        {pedidoSel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge variant={ESTADO_BADGE[pedidoSel.estado]}>{ESTADO_LABEL[pedidoSel.estado]}</Badge>
              {pedidoSel.proveedores && (
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Proveedor: <strong>{pedidoSel.proveedores.razon_social}</strong></span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-3)' }}>Creado:</span> {formatFecha(pedidoSel.created_at)}</div>
              {pedidoSel.fecha_solicitud  && <div><span style={{ color: 'var(--text-3)' }}>Solicitado:</span> {formatFecha(pedidoSel.fecha_solicitud)}</div>}
              {pedidoSel.fecha_aprobacion && <div><span style={{ color: 'var(--text-3)' }}>Aprobado:</span>   {formatFecha(pedidoSel.fecha_aprobacion)}</div>}
              {pedidoSel.fecha_recepcion  && <div><span style={{ color: 'var(--text-3)' }}>Recibido:</span>   {formatFecha(pedidoSel.fecha_recepcion)}</div>}
              {pedidoSel.remito_numero    && <div><span style={{ color: 'var(--text-3)' }}>Remito:</span>     <strong>{pedidoSel.remito_numero}</strong></div>}
            </div>

            {pedidoSel.observaciones && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', background: 'var(--slate-50)', borderRadius: 8, padding: '10px 14px', margin: 0 }}>{pedidoSel.observaciones}</p>
            )}

            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ítems</p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {(pedidoSel.items_pedido ?? []).map((item, idx) => (
                  <div key={item.id ?? idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', fontSize: 13, borderTop: idx > 0 ? '1px solid var(--border)' : undefined }}>
                    <div>
                      <p style={{ fontWeight: 500, margin: 0 }}>{item.insumos?.nombre ?? '—'}</p>
                      <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 12 }}>{item.insumos?.unidad_medida}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0 }}>Solicitado: <strong>{item.cantidad_solicitada}</strong></p>
                      {item.cantidad_recibida != null && (
                        <p style={{ color: 'var(--green-600)', margin: 0 }}>Recibido: <strong>{item.cantidad_recibida}</strong></p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {pedidoSel.estado === 'borrador' && (
                  <Button size="sm" variant="secondary" onClick={() => cambiarEstado(pedidoSel, 'solicitado')}>📤 Enviar solicitud</Button>
                )}
                {pedidoSel.estado === 'solicitado' && (
                  <Button size="sm" variant="secondary" onClick={() => cambiarEstado(pedidoSel, 'aprobado')}>✅ Aprobar</Button>
                )}
                {pedidoSel.estado === 'aprobado' && (
                  <Button size="sm" onClick={() => {
                    const init: Record<string, number> = {}
                    pedidoSel.items_pedido?.forEach(it => { if (it.id) init[it.id] = it.cantidad_solicitada })
                    setCantRecibidas(init)
                    setOpenRecibir(true)
                  }}>📦 Registrar recepción</Button>
                )}
                {(pedidoSel.estado === 'borrador' || pedidoSel.estado === 'solicitado') && (
                  <Button size="sm" variant="danger" onClick={async () => {
                    await cambiarEstado(pedidoSel, 'cancelado')
                    setOpenDetalle(false)
                  }}>Cancelar pedido</Button>
                )}
              </div>
              <Button variant="secondary" onClick={() => setOpenDetalle(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal recepción ─────────────────────────────────────────────────── */}
      <Modal open={openRecibir} onClose={() => setOpenRecibir(false)} title="Registrar recepción de mercadería" width={520}>
        {pedidoSel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Pedido <strong>{pedidoSel.numero}</strong> · Confirmá las cantidades realmente recibidas
            </p>

            <Input
              label="N° de remito"
              value={recibirForm.remito_numero}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecibirForm((f: any) => ({ ...f, remito_numero: e.target.value }))}
              placeholder="REM-0001"
            />

            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cantidades recibidas</p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {(pedidoSel.items_pedido ?? []).map((item, idx) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: idx > 0 ? '1px solid var(--border)' : undefined }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{item.insumos?.nombre}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Solicitado: {item.cantidad_solicitada} {item.insumos?.unidad_medida}</p>
                    </div>
                    <div style={{ width: 90 }}>
                      <Input
                        type="number"
                        min="0"
                        value={item.id ? (cantRecibidas[item.id] ?? item.cantidad_solicitada) : item.cantidad_solicitada}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => item.id && setCantRecibidas(prev => ({ ...prev, [item.id!]: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Observaciones (opcional)</label>
              <textarea
                style={{ width: '100%', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 13, resize: 'none', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                rows={2}
                value={recibirForm.observaciones}
                onChange={e => setRecibirForm((f: any) => ({ ...f, observaciones: e.target.value }))}
                placeholder="Diferencias, faltantes, productos en mal estado..."
              />
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af' }}>
              ⚠️ Al confirmar se actualizará el stock automáticamente y se registrará un movimiento de entrada por cada ítem.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button variant="secondary" onClick={() => setOpenRecibir(false)}>Cancelar</Button>
              <Button onClick={handleRecibir} disabled={saving}>
                {saving ? 'Guardando…' : '✅ Confirmar recepción'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  )
}
