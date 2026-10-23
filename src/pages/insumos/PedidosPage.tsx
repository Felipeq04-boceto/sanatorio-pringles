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

const ESTADO_COLOR: Record<EstadoPedido, string> = {
  borrador:   'gray',
  solicitado: 'blue',
  aprobado:   'green',
  recibido:   'purple',
  cancelado:  'red',
}

function estadoBadge(estado: EstadoPedido) {
  const colors: Record<string, string> = {
    gray:   'bg-gray-100 text-gray-700',
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
    purple: 'bg-purple-100 text-purple-700',
    red:    'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[ESTADO_COLOR[estado]]}`}>
      {ESTADO_LABEL[estado]}
    </span>
  )
}

function formatFecha(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── componente principal ─────────────────────────────────────────────────────

export function PedidosPage() {
  const { usuario } = useAuth()
  const [pedidos, setPedidos]         = useState<Pedido[]>([])
  const [insumos, setInsumos]         = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [search, setSearch]           = useState('')

  // Modal nuevo pedido
  const [openNuevo, setOpenNuevo]     = useState(false)
  const [nuevoForm, setNuevoForm]     = useState<any>({ observaciones: '' })
  const [items, setItems]             = useState<Partial<ItemPedido>[]>([{ insumo_id: '', cantidad_solicitada: 1 }])
  const [saving, setSaving]           = useState(false)

  // Modal detalle / acciones
  const [pedidoSel, setPedidoSel]     = useState<Pedido | null>(null)
  const [openDetalle, setOpenDetalle] = useState(false)

  // Modal recepción
  const [openRecibir, setOpenRecibir] = useState(false)
  const [recibirForm, setRecibirForm] = useState<any>({ remito_numero: '', observaciones: '' })
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
      // Generar número de pedido
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
        .select()
        .single()

      if (error || !pedido) throw error ?? new Error('No se pudo crear el pedido')

      const itemsInsert = itemsValidos.map(i => ({
        pedido_id:           pedido.id,
        insumo_id:           i.insumo_id,
        cantidad_solicitada: i.cantidad_solicitada,
        precio_unitario:     i.precio_unitario ?? null,
        observaciones:       i.observaciones   ?? null,
      }))
      await supabase.from('items_pedido').insert(itemsInsert)

      setOpenNuevo(false)
      setNuevoForm({ observaciones: '' })
      setItems([{ insumo_id: '', cantidad_solicitada: 1 }])
      await loadAll()
    } finally {
      setSaving(false)
    }
  }

  // ── cambiar estado ────────────────────────────────────────────────────────

  async function cambiarEstado(pedido: Pedido, nuevoEstado: EstadoPedido) {
    const update: any = { estado: nuevoEstado }
    if (nuevoEstado === 'solicitado') update.fecha_solicitud  = new Date().toISOString()
    if (nuevoEstado === 'aprobado')   update.fecha_aprobacion = new Date().toISOString()
    await supabase.from('pedidos_insumos').update(update).eq('id', pedido.id)
    await loadAll()
    if (openDetalle) {
      const updated = pedidos.find(p => p.id === pedido.id)
      if (updated) setPedidoSel({ ...updated, estado: nuevoEstado, ...update })
    }
  }

  // ── recibir mercadería ────────────────────────────────────────────────────

  async function handleRecibir() {
    if (!pedidoSel) return
    setSaving(true)
    try {
      // Actualizar pedido
      await supabase.from('pedidos_insumos').update({
        estado:          'recibido',
        fecha_recepcion: new Date().toISOString(),
        remito_numero:   recibirForm.remito_numero || null,
        observaciones:   recibirForm.observaciones || null,
      }).eq('id', pedidoSel.id)

      // Para cada ítem: actualizar cantidad_recibida y crear movimiento_stock
      const items = pedidoSel.items_pedido ?? []
      await Promise.all(items.map(async (item) => {
        const cantRecibida = cantRecibidas[item.id!] ?? item.cantidad_solicitada
        if (cantRecibida <= 0) return

        // Actualizar item
        await supabase.from('items_pedido').update({ cantidad_recibida: cantRecibida }).eq('id', item.id!)

        // Crear movimiento de entrada
        await supabase.from('movimientos_stock').insert({
          insumo_id:       item.insumo_id,
          tipo_movimiento: 'entrada',
          cantidad:        cantRecibida,
          remito_numero:   recibirForm.remito_numero || null,
          proveedor_id:    pedidoSel.proveedor_id   || null,
          precio_unitario: item.precio_unitario      ?? null,
          observaciones:   `Pedido ${pedidoSel.numero}`,
          registrado_por:  usuario?.id ?? null,
        })

        // Actualizar stock_actual
        await supabase.rpc('incrementar_stock', { p_insumo_id: item.insumo_id, p_cantidad: cantRecibida })
      }))

      setOpenRecibir(false)
      setOpenDetalle(false)
      setPedidoSel(null)
      setRecibirForm({ remito_numero: '', observaciones: '' })
      setCantRecibidas({})
      await loadAll()

      // Disparar alertas de stock (por si algo quedó bajo mínimo y no se actualizó)
      // No aplica en entrada, pero dejamos el hook por consistencia
    } finally {
      setSaving(false)
    }
  }

  // ── filtros ───────────────────────────────────────────────────────────────

  const pedidosFiltrados = pedidos.filter(p => {
    if (filtroEstado && p.estado !== filtroEstado) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.numero.toLowerCase().includes(q) ||
        p.proveedores?.razon_social.toLowerCase().includes(q) ||
        (p.observaciones ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── stats cards ───────────────────────────────────────────────────────────

  const stats = {
    borrador:   pedidos.filter(p => p.estado === 'borrador').length,
    solicitado: pedidos.filter(p => p.estado === 'solicitado').length,
    aprobado:   pedidos.filter(p => p.estado === 'aprobado').length,
    recibido:   pedidos.filter(p => p.estado === 'recibido').length,
  }

  // ── items del formulario ──────────────────────────────────────────────────

  function addItem() {
    setItems(prev => [...prev, { insumo_id: '', cantidad_solicitada: 1 }])
  }

  function updateItem(idx: number, field: string, value: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <Page><div className="flex justify-center py-24"><Spinner /></div></Page>

  return (
    <Page>
      <PageHeader title="Pedidos de Insumos">
        <Button onClick={() => setOpenNuevo(true)}>+ Nuevo pedido</Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Borradores',  value: stats.borrador,   color: 'bg-gray-50 border-gray-200',     text: 'text-gray-700' },
          { label: 'Solicitados', value: stats.solicitado, color: 'bg-blue-50 border-blue-200',     text: 'text-blue-700' },
          { label: 'Aprobados',   value: stats.aprobado,   color: 'bg-green-50 border-green-200',   text: 'text-green-700' },
          { label: 'Recibidos',   value: stats.recibido,   color: 'bg-purple-50 border-purple-200', text: 'text-purple-700' },
        ].map(s => (
          <div key={s.label} className={`border rounded-xl p-4 ${s.color}`}>
            <p className={`text-3xl font-bold ${s.text}`}>{s.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Buscar por número, proveedor..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={filtroEstado} onChange={(e: any) => setFiltroEstado(e.target.value)}>
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
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setPedidoSel(p); setOpenDetalle(true) }}>
                  <Td className="font-mono text-sm font-medium">{p.numero}</Td>
                  <Td>{p.proveedores?.razon_social ?? <span className="text-gray-400">Sin proveedor</span>}</Td>
                  <Td>{estadoBadge(p.estado)}</Td>
                  <Td className="text-gray-500">{p.items_pedido?.length ?? 0} ítem{(p.items_pedido?.length ?? 0) !== 1 ? 's' : ''}</Td>
                  <Td className="text-gray-500 text-sm">{formatFecha(p.created_at)}</Td>
                  <Td onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2">
                      {p.estado === 'borrador' && (
                        <Button size="sm" variant="secondary" onClick={() => cambiarEstado(p, 'solicitado')}>
                          Enviar
                        </Button>
                      )}
                      {p.estado === 'solicitado' && (
                        <Button size="sm" variant="secondary" onClick={() => cambiarEstado(p, 'aprobado')}>
                          Aprobar
                        </Button>
                      )}
                      {p.estado === 'aprobado' && (
                        <Button size="sm" onClick={() => {
                          setPedidoSel(p)
                          // Pre-llenar cantidades con lo solicitado
                          const init: Record<string, number> = {}
                          p.items_pedido?.forEach(it => { if (it.id) init[it.id] = it.cantidad_solicitada })
                          setCantRecibidas(init)
                          setOpenRecibir(true)
                        }}>
                          Recibir
                        </Button>
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
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor (opcional)</label>
            <Select
              value={nuevoForm.proveedor_id ?? ''}
              onChange={(e: any) => setNuevoForm((f: any) => ({ ...f, proveedor_id: e.target.value || undefined }))}
            >
              <option value="">Sin proveedor asignado</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={2}
              value={nuevoForm.observaciones ?? ''}
              onChange={e => setNuevoForm((f: any) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Urgente, para quirófano, etc."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Ítems del pedido</label>
              <button onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Agregar ítem</button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Select
                      value={item.insumo_id ?? ''}
                      onChange={(e: any) => updateItem(idx, 'insumo_id', e.target.value)}
                    >
                      <option value="">Seleccionar insumo…</option>
                      {insumos.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.nombre} (stock: {i.stock_actual} {i.unidad_medida})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      value={item.cantidad_solicitada ?? ''}
                      onChange={(e: any) => updateItem(idx, 'cantidad_solicitada', Number(e.target.value))}
                    />
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="mt-1 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
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

      {/* ── Modal detalle pedido ────────────────────────────────────────────── */}
      <Modal open={openDetalle} onClose={() => { setOpenDetalle(false); setPedidoSel(null) }} title={`Pedido ${pedidoSel?.numero ?? ''}`}>
        {pedidoSel && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {estadoBadge(pedidoSel.estado)}
              {pedidoSel.proveedores && (
                <span className="text-sm text-gray-500">Proveedor: <strong>{pedidoSel.proveedores.razon_social}</strong></span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Creado:</span> {formatFecha(pedidoSel.created_at)}</div>
              {pedidoSel.fecha_solicitud  && <div><span className="text-gray-500">Solicitado:</span> {formatFecha(pedidoSel.fecha_solicitud)}</div>}
              {pedidoSel.fecha_aprobacion && <div><span className="text-gray-500">Aprobado:</span>   {formatFecha(pedidoSel.fecha_aprobacion)}</div>}
              {pedidoSel.fecha_recepcion  && <div><span className="text-gray-500">Recibido:</span>   {formatFecha(pedidoSel.fecha_recepcion)}</div>}
              {pedidoSel.remito_numero    && <div><span className="text-gray-500">Remito:</span>     <strong>{pedidoSel.remito_numero}</strong></div>}
            </div>

            {pedidoSel.observaciones && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{pedidoSel.observaciones}</p>
            )}

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Ítems</h4>
              <div className="border rounded-lg divide-y">
                {(pedidoSel.items_pedido ?? []).map((item, idx) => (
                  <div key={item.id ?? idx} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{item.insumos?.nombre ?? '—'}</p>
                      <p className="text-gray-500">{item.insumos?.unidad_medida}</p>
                    </div>
                    <div className="text-right">
                      <p>Solicitado: <strong>{item.cantidad_solicitada}</strong></p>
                      {item.cantidad_recibida !== undefined && item.cantidad_recibida !== null && (
                        <p className="text-green-600">Recibido: <strong>{item.cantidad_recibida}</strong></p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex gap-2">
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
      <Modal open={openRecibir} onClose={() => setOpenRecibir(false)} title="Registrar recepción de mercadería">
        {pedidoSel && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Pedido <strong>{pedidoSel.numero}</strong> · Confirmá las cantidades realmente recibidas</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° de remito</label>
                <Input
                  value={recibirForm.remito_numero}
                  onChange={(e: any) => setRecibirForm((f: any) => ({ ...f, remito_numero: e.target.value }))}
                  placeholder="REM-0001"
                />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Cantidades recibidas</h4>
              <div className="border rounded-lg divide-y">
                {(pedidoSel.items_pedido ?? []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{item.insumos?.nombre}</p>
                      <p className="text-xs text-gray-500">Solicitado: {item.cantidad_solicitada} {item.insumos?.unidad_medida}</p>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min="0"
                        value={item.id ? (cantRecibidas[item.id] ?? item.cantidad_solicitada) : item.cantidad_solicitada}
                        onChange={(e: any) => item.id && setCantRecibidas(prev => ({ ...prev, [item.id!]: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones (opcional)</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                value={recibirForm.observaciones}
                onChange={e => setRecibirForm((f: any) => ({ ...f, observaciones: e.target.value }))}
                placeholder="Diferencias, faltantes, productos en mal estado..."
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              ⚠️ Al confirmar se actualizará el stock automáticamente y se registrará un movimiento de entrada por cada ítem.
            </div>

            <div className="flex justify-end gap-3">
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
