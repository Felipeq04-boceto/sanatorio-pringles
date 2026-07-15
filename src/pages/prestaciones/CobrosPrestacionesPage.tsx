import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Card, Input, Select, Modal, Spinner, Empty, Badge } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'teal'

const COBERTURAS = [
  { value: 'obra_social', label: 'Obra social' },
  { value: 'mutual', label: 'Mutual' },
  { value: 'particular', label: 'Particular' },
]

const ESTADOS_COLOR: Record<string, BadgeVariant> = {
  pendiente: 'amber',
  cobrado: 'green',
  debitado: 'blue',
  anulado: 'red',
}

export function CobrosPrestacionesPage() {
  const { usuario } = useAuth()
  const [cobros, setCobros] = useState<any[]>([])
  const [prestaciones, setPrestaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCobertura, setFiltroCobertura] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState<any>({ fecha: new Date().toISOString().split('T')[0], cobertura: 'obra_social', estado: 'pendiente' })
  const [saving, setSaving] = useState(false)

  const canEdit = ['admin','rrhh','enfermeria','instrumentadora','administrativo'].includes(usuario?.rol ?? '')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('cobros_prestaciones').select('*, prestaciones(nombre, area)').order('fecha', { ascending: false }),
      supabase.from('prestaciones').select('id, nombre, area, arancel_base').eq('estado', 'activa').order('area').order('nombre'),
    ])
    setCobros(c ?? [])
    setPrestaciones(p ?? [])
    setLoading(false)
  }

  async function guardar() {
    if (!form.prestacion_id || !form.paciente_nombre || !form.cobertura) return
    setSaving(true)
    try {
      const datos = {
        prestacion_id: form.prestacion_id,
        fecha: form.fecha,
        paciente_nombre: form.paciente_nombre,
        paciente_dni: form.paciente_dni || null,
        cobertura: form.cobertura,
        obra_social_nombre: form.obra_social_nombre || null,
        nro_afiliado: form.nro_afiliado || null,
        monto_facturado: form.monto_facturado ? parseFloat(form.monto_facturado) : null,
        monto_cobrado: form.monto_cobrado ? parseFloat(form.monto_cobrado) : null,
        estado: form.estado,
        observaciones: form.observaciones || null,
        registrado_por: usuario?.id,
      }
      if (editando) {
        await supabase.from('cobros_prestaciones').update(datos).eq('id', editando.id)
      } else {
        await supabase.from('cobros_prestaciones').insert(datos)
      }
      setOpenModal(false)
      setForm({ fecha: new Date().toISOString().split('T')[0], cobertura: 'obra_social', estado: 'pendiente' })
      setEditando(null)
      loadAll()
    } finally { setSaving(false) }
  }

  async function cambiarEstado(id: string, estado: string) {
    await supabase.from('cobros_prestaciones').update({ estado }).eq('id', id)
    loadAll()
  }

  const filtered = cobros.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.paciente_nombre?.toLowerCase().includes(q) || c.paciente_dni?.includes(q) || c.prestaciones?.nombre?.toLowerCase().includes(q)
    const matchE = !filtroEstado || c.estado === filtroEstado
    const matchC = !filtroCobertura || c.cobertura === filtroCobertura
    return matchQ && matchE && matchC
  })

  const totalPendiente = cobros.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + (c.monto_facturado ?? 0), 0)
  const totalCobrado = cobros.filter(c => c.estado === 'cobrado').reduce((acc, c) => acc + (c.monto_cobrado ?? 0), 0)

  if (loading) return <Page><div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={36} /></div></Page>

  return (
    <Page>
      <PageHeader
        title="Cobros por Prestación"
        subtitle={`${cobros.length} registros`}
        action={canEdit ? <Button onClick={() => { setForm({ fecha: new Date().toISOString().split('T')[0], cobertura: 'obra_social', estado: 'pendiente' }); setEditando(null); setOpenModal(true) }}>+ Nuevo cobro</Button> : undefined}
      />

      {/* Resumen rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius)', padding: '14px' }}>
          <p style={{ fontSize: '11px', color: '#9A3412', fontWeight: 600, marginBottom: '4px' }}>PENDIENTE DE COBRO</p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: '#EA580C' }}>${totalPendiente.toLocaleString('es-AR')}</p>
        </div>
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--radius)', padding: '14px' }}>
          <p style={{ fontSize: '11px', color: '#15803D', fontWeight: 600, marginBottom: '4px' }}>COBRADO</p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: '#16A34A' }}>${totalCobrado.toLocaleString('es-AR')}</p>
        </div>
        <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, marginBottom: '4px' }}>TOTAL REGISTROS</p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>{cobros.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <Input placeholder="Buscar paciente o prestación..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <Select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="cobrado">Cobrado</option>
          <option value="debitado">Debitado</option>
          <option value="anulado">Anulado</option>
        </Select>
        <Select value={filtroCobertura} onChange={e => setFiltroCobertura(e.target.value)} style={{ width: 160 }}>
          <option value="">Toda cobertura</option>
          {COBERTURAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Empty message="Sin cobros registrados — registrá cobros por prestación" />
      ) : (
        <Card style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['Fecha','Paciente','Prestación / Área','Cobertura','Facturado','Cobrado','Estado','Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', background: 'var(--slate-50)', borderBottom: '2px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                    {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <p style={{ fontWeight: 600 }}>{c.paciente_nombre}</p>
                    {c.paciente_dni && <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>DNI {c.paciente_dni}</p>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <p style={{ fontWeight: 500 }}>{c.prestaciones?.nombre ?? '—'}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{c.prestaciones?.area}</p>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 500 }}>{COBERTURAS.find(x => x.value === c.cobertura)?.label}</p>
                    {c.obra_social_nombre && <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{c.obra_social_nombre}</p>}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                    {c.monto_facturado ? `$${c.monto_facturado.toLocaleString('es-AR')}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: c.monto_cobrado ? '#16A34A' : 'var(--text-3)' }}>
                    {c.monto_cobrado ? `$${c.monto_cobrado.toLocaleString('es-AR')}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge variant={ESTADOS_COLOR[c.estado]}>{c.estado}</Badge>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {canEdit && (
                        <button onClick={() => { setEditando(c); setForm({ ...c, prestacion_id: c.prestacion_id }); setOpenModal(true) }}
                          style={{ fontSize: '11px', padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>
                          Editar
                        </button>
                      )}
                      {canEdit && c.estado === 'pendiente' && (
                        <button onClick={() => cambiarEstado(c.id, 'cobrado')}
                          style={{ fontSize: '11px', padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#16A34A', cursor: 'pointer', fontWeight: 600 }}>
                          ✓ Cobrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Modal nuevo/editar cobro */}
      <Modal open={openModal} onClose={() => { setOpenModal(false); setEditando(null) }}
        title={editando ? 'Editar cobro' : 'Registrar cobro'} width={540}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label="Fecha *" type="date" value={form.fecha ?? ''} onChange={e => setForm((p: any) => ({ ...p, fecha: e.target.value }))} />
            <Select label="Estado" value={form.estado ?? 'pendiente'} onChange={e => setForm((p: any) => ({ ...p, estado: e.target.value }))}>
              <option value="pendiente">Pendiente</option>
              <option value="cobrado">Cobrado</option>
              <option value="debitado">Debitado</option>
              <option value="anulado">Anulado</option>
            </Select>
          </div>
          <Select label="Prestación *" value={form.prestacion_id ?? ''} onChange={e => {
            const p = prestaciones.find(x => x.id === e.target.value)
            setForm((prev: any) => ({ ...prev, prestacion_id: e.target.value, monto_facturado: p?.arancel_base ?? prev.monto_facturado }))
          }}>
            <option value="">Seleccionar prestación...</option>
            {prestaciones.map(p => <option key={p.id} value={p.id}>{p.area} — {p.nombre}</option>)}
          </Select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label="Nombre del paciente *" value={form.paciente_nombre ?? ''} onChange={e => setForm((p: any) => ({ ...p, paciente_nombre: e.target.value }))} />
            <Input label="DNI" value={form.paciente_dni ?? ''} onChange={e => setForm((p: any) => ({ ...p, paciente_dni: e.target.value }))} />
          </div>
          <Select label="Cobertura *" value={form.cobertura ?? 'obra_social'} onChange={e => setForm((p: any) => ({ ...p, cobertura: e.target.value }))}>
            {COBERTURAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          {form.cobertura !== 'particular' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input label="Obra social / Mutual" value={form.obra_social_nombre ?? ''} onChange={e => setForm((p: any) => ({ ...p, obra_social_nombre: e.target.value }))} />
              <Input label="Nro afiliado" value={form.nro_afiliado ?? ''} onChange={e => setForm((p: any) => ({ ...p, nro_afiliado: e.target.value }))} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input label="Monto facturado ($)" type="number" value={form.monto_facturado ?? ''} onChange={e => setForm((p: any) => ({ ...p, monto_facturado: e.target.value }))} />
            <Input label="Monto cobrado ($)" type="number" value={form.monto_cobrado ?? ''} onChange={e => setForm((p: any) => ({ ...p, monto_cobrado: e.target.value }))} />
          </div>
          <Input label="Observaciones" value={form.observaciones ?? ''} onChange={e => setForm((p: any) => ({ ...p, observaciones: e.target.value }))} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => { setOpenModal(false); setEditando(null) }}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving || !form.prestacion_id || !form.paciente_nombre}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}
