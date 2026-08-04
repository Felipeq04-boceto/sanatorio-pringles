import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  empleado: any
}

const SECTORES_DEST = ['Internación','Quirófano','Quirófano 1','Quirófano 2','Sala de partos','Recepción del recién nacido','Guardia','Farmacia','Laboratorio','Imágenes','Administración']

export function SeccionStock({ empleado: _empleado }: Props) {
  const { usuario } = useAuth()
  const puedeVerGasesStock = ['referente_enfermeria','referente_instrumentadores','admin'].includes(usuario?.rol ?? '')

  const [stockInsumos,           setStockInsumos]           = useState<any[]>([])
  const [openMovStock,           setOpenMovStock]           = useState(false)
  const [openEditarStock,        setOpenEditarStock]        = useState(false)
  const [editStockForm,          setEditStockForm]          = useState<any>({})
  const [savingEditStock,        setSavingEditStock]        = useState(false)
  const [openConfirmBorrarStock, setOpenConfirmBorrarStock] = useState(false)
  const [insumoABorrarStock,     setInsumoABorrarStock]     = useState<any>(null)
  const [savingBorrarStock,      setSavingBorrarStock]      = useState(false)
  const [insumoActivo,           setInsumoActivo]           = useState<any>(null)
  const [movStockForm,           setMovStockForm]           = useState<any>({ tipo_movimiento: 'salida', cantidad: '' })
  const [savingMovStock,         setSavingMovStock]         = useState(false)
  const [openNuevoInsumo,        setOpenNuevoInsumo]        = useState(false)
  const [nuevoInsumoForm,        setNuevoInsumoForm]        = useState<any>({})
  const [savingNuevoInsumo,      setSavingNuevoInsumo]      = useState(false)

  useEffect(() => {
    supabase.from('insumos')
      .select('*, categorias_insumo(nombre)')
      .eq('estado', 'activo').order('nombre')
      .then(({ data }) => setStockInsumos(data ?? []))
  }, [])

  async function recargarStock() {
    const { data } = await supabase.from('insumos').select('*, categorias_insumo(nombre)').eq('estado', 'activo').order('nombre')
    setStockInsumos(data ?? [])
  }

  async function guardarNuevoInsumo() {
    if (!nuevoInsumoForm.nombre || !nuevoInsumoForm.categoria_id) return
    setSavingNuevoInsumo(true)
    try {
      const { error: insErr } = await supabase.from('insumos').insert({
        nombre: nuevoInsumoForm.nombre,
        descripcion: nuevoInsumoForm.descripcion ?? null,
        unidad_medida: nuevoInsumoForm.unidad_medida ?? 'unidades',
        stock_actual: parseInt(nuevoInsumoForm.stock_actual) || 0,
        stock_minimo: nuevoInsumoForm.stock_minimo ? parseInt(nuevoInsumoForm.stock_minimo) : null,
        categoria_id: nuevoInsumoForm.categoria_id,
        estado: 'activo',
      })
      if (insErr) { alert('Error: ' + insErr.message); return }
      await recargarStock()
      setOpenNuevoInsumo(false)
      setNuevoInsumoForm({})
    } finally { setSavingNuevoInsumo(false) }
  }

  async function guardarMovStock() {
    if (!insumoActivo || !movStockForm.cantidad || movStockForm.cantidad <= 0) return
    setSavingMovStock(true)
    try {
      const cant = parseInt(movStockForm.cantidad)
      const delta = movStockForm.tipo_movimiento === 'entrada' || movStockForm.tipo_movimiento === 'devolucion' ? cant : -cant
      await supabase.from('movimientos_stock').insert({
        insumo_id: insumoActivo.id,
        tipo_movimiento: movStockForm.tipo_movimiento,
        cantidad: cant,
        sector_destino: movStockForm.sector_destino ?? null,
        observaciones: movStockForm.observaciones ?? null,
        registrado_por: usuario?.id,
      })
      await supabase.rpc('incrementar_stock', { p_insumo_id: insumoActivo.id, p_cantidad: delta })
      await recargarStock()
      setOpenMovStock(false)
      setMovStockForm({ tipo_movimiento: 'salida', cantidad: '' })
    } finally { setSavingMovStock(false) }
  }

  const alertasStock = stockInsumos.filter((ins: any) => ins.stock_minimo && ins.stock_actual <= ins.stock_minimo)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Banner alertas stock bajo */}
      {alertasStock.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <p style={{ fontWeight: 700, color: '#DC2626', marginBottom: '8px', fontSize: '13px' }}>
            ⚠️ {alertasStock.length} insumo{alertasStock.length > 1 ? 's' : ''} por debajo del stock mínimo
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {alertasStock.map((ins: any) => (
              <div key={ins.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ color: '#991B1B', fontWeight: 600 }}>• {ins.nombre}</span>
                <span style={{ color: '#B91C1C' }}>
                  Stock: <strong>{ins.stock_actual ?? 0}</strong> {ins.unidad_medida} / Mínimo: {ins.stock_minimo}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {puedeVerGasesStock && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { setNuevoInsumoForm({}); setOpenNuevoInsumo(true) }}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
            + Nuevo insumo
          </button>
        </div>
      )}

      <Card style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {['Insumo','Categoría','Stock actual','Mínimo','Estado','Acción'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', background: 'var(--slate-50)', borderBottom: '2px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stockInsumos.map((ins: any, i: number) => {
              const bajo = ins.stock_minimo && ins.stock_actual <= ins.stock_minimo
              return (
                <tr key={ins.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                    {ins.nombre}
                    <p style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 400 }}>{ins.descripcion}</p>
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>{ins.categorias_insumo?.nombre ?? '—'}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: bajo ? '#DC2626' : '#16A34A' }}>
                    {ins.stock_actual ?? 0} {ins.unidad_medida}
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-3)' }}>{ins.stock_minimo ?? '—'}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                      background: bajo ? '#FEF2F2' : '#F0FDF4', color: bajo ? '#DC2626' : '#16A34A' }}>
                      {bajo ? 'Stock bajo' : 'Normal'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => { setInsumoActivo(ins); setMovStockForm({ tipo_movimiento: 'salida', cantidad: '' }); setOpenMovStock(true) }}
                      style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                      Movimiento
                    </button>
                    {['referente_enfermeria','referente_instrumentadores','admin'].includes(usuario?.rol ?? '') && (
                      <>
                        <button onClick={() => { setEditStockForm({ ...ins }); setOpenEditarStock(true) }}
                          style={{ padding: '4px 10px', marginLeft: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                          Editar
                        </button>
                        <button onClick={() => { setInsumoABorrarStock(ins); setOpenConfirmBorrarStock(true) }}
                          style={{ padding: '4px 10px', marginLeft: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--red-600)' }}>
                          Borrar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Modal movimiento stock */}
      {openMovStock && insumoActivo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Movimiento — {insumoActivo.nombre}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '16px' }}>Stock actual: <strong>{insumoActivo.stock_actual} {insumoActivo.unidad_medida}</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Tipo de movimiento</label>
                <select value={movStockForm.tipo_movimiento} onChange={e => setMovStockForm((p: any) => ({ ...p, tipo_movimiento: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px' }}>
                  <option value="entrada">Entrada (compra / recepción)</option>
                  <option value="salida">Salida (consumo)</option>
                  <option value="devolucion">Devolución</option>
                  <option value="baja">Baja / descarte</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Cantidad *</label>
                <input type="number" min="1" value={movStockForm.cantidad} onChange={e => setMovStockForm((p: any) => ({ ...p, cantidad: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              {(movStockForm.tipo_movimiento === 'salida' || movStockForm.tipo_movimiento === 'baja') && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Sector destino</label>
                  <select value={movStockForm.sector_destino ?? ''} onChange={e => setMovStockForm((p: any) => ({ ...p, sector_destino: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px' }}>
                    <option value="">Seleccionar...</option>
                    {SECTORES_DEST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Observaciones</label>
                <input value={movStockForm.observaciones ?? ''} onChange={e => setMovStockForm((p: any) => ({ ...p, observaciones: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setOpenMovStock(false)}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarMovStock} disabled={savingMovStock || !movStockForm.cantidad}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {savingMovStock ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar insumo */}
      {openEditarStock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px' }}>Editar insumo</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'Nombre *', key: 'nombre' },
                { label: 'Descripción', key: 'descripcion' },
                { label: 'Unidad de medida *', key: 'unidad_medida' },
                { label: 'Ubicación', key: 'ubicacion' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                  <input value={editStockForm[f.key] ?? ''} onChange={e => setEditStockForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              ))}
              {[
                { label: 'Stock actual', key: 'stock_actual' },
                { label: 'Stock mínimo', key: 'stock_minimo' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                  <input type="number" value={editStockForm[f.key] ?? ''} onChange={e => setEditStockForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setOpenEditarStock(false)}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={async () => {
                  setSavingEditStock(true)
                  try {
                    const { error } = await supabase.from('insumos').update({
                      nombre: editStockForm.nombre,
                      descripcion: editStockForm.descripcion,
                      unidad_medida: editStockForm.unidad_medida,
                      stock_actual: editStockForm.stock_actual,
                      stock_minimo: editStockForm.stock_minimo,
                      ubicacion: editStockForm.ubicacion,
                    }).eq('id', editStockForm.id)
                    if (error) { alert('Error al guardar: ' + error.message); return }
                    setOpenEditarStock(false)
                    await recargarStock()
                  } finally { setSavingEditStock(false) }
                }}
                disabled={savingEditStock || !editStockForm.nombre}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {savingEditStock ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar borrar insumo */}
      {openConfirmBorrarStock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 420, maxWidth: '90vw' }}>
            <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
              <p style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
                ¿Borrar <strong>{insumoABorrarStock?.nombre}</strong>?
              </p>
              <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>
                Se eliminará el insumo y no podrá recuperarse.
                {insumoABorrarStock?.stock_actual > 0 && (
                  <> Actualmente tiene <strong>{insumoABorrarStock.stock_actual} {insumoABorrarStock.unidad_medida}</strong> en stock.</>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setOpenConfirmBorrarStock(false)}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={async () => {
                  if (!insumoABorrarStock) return
                  setSavingBorrarStock(true)
                  try {
                    const { error } = await supabase.from('insumos').delete().eq('id', insumoABorrarStock.id)
                    if (error) {
                      if (error.code === '23503') {
                        alert('No se puede borrar este insumo porque tiene movimientos de stock registrados. Si querés dejar de usarlo, marcalo como "inactivo" en vez de borrarlo.')
                      } else {
                        alert('Error al borrar: ' + error.message)
                      }
                      return
                    }
                    setOpenConfirmBorrarStock(false)
                    setInsumoABorrarStock(null)
                    await recargarStock()
                  } finally { setSavingBorrarStock(false) }
                }}
                disabled={savingBorrarStock}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--red-600)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                {savingBorrarStock ? 'Borrando...' : 'Sí, borrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo insumo */}
      {openNuevoInsumo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Nuevo insumo</h3>
            {[
              { label: 'Nombre *', key: 'nombre', type: 'text' },
              { label: 'Descripción', key: 'descripcion', type: 'text' },
              { label: 'Unidad de medida', key: 'unidad_medida', type: 'text', placeholder: 'ej: unidades, cajas, ml' },
              { label: 'Stock inicial *', key: 'stock_actual', type: 'number' },
              { label: 'Stock mínimo', key: 'stock_minimo', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder ?? ''} value={nuevoInsumoForm[f.key] ?? ''}
                  onChange={e => setNuevoInsumoForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Categoría *</label>
              <select value={nuevoInsumoForm.categoria_id ?? ''} onChange={e => setNuevoInsumoForm((p: any) => ({ ...p, categoria_id: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }}>
                <option value="">Seleccionar categoría...</option>
                <option value="c38993f8-7a6e-48e7-acab-02acf6ce811e">Gases medicinales</option>
                <option value="89036ffa-ce41-4017-8769-6b8fae589ebe">Limpieza e higiene</option>
                <option value="300e6b8d-ff52-4dc4-b50e-b4c7a73e1cfe">Material descartable</option>
                <option value="b8a1c2e9-746b-49bf-aa7f-a375a8c6a0ce">Medicamentos</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setOpenNuevoInsumo(false)}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarNuevoInsumo} disabled={savingNuevoInsumo || !nuevoInsumoForm.nombre || !nuevoInsumoForm.stock_actual}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {savingNuevoInsumo ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
