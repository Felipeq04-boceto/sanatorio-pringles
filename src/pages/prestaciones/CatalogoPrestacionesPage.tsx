import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Input, Select, Modal, Spinner, Empty } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const AREAS = ['Internación','Quirófano','Laboratorio','Imágenes','Guardia','Neonatología','Farmacia','Kinesiología','Otro']

type Prestacion = {
  id: string
  nombre: string
  descripcion: string | null
  area: string
  codigo: string | null
  arancel_base: number | null
  estado: 'activa' | 'inactiva'
}

export function CatalogoPrestacionesPage() {
  const { usuario } = useAuth()
  const [prestaciones, setPrestaciones] = useState<Prestacion[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroArea, setFiltroArea] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [editando, setEditando] = useState<Prestacion | null>(null)
  const [form, setForm] = useState<Partial<Prestacion>>({})
  const [saving, setSaving] = useState(false)

  const canEdit = usuario?.rol === 'admin'

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('prestaciones').select('*').order('area').order('nombre')
    setPrestaciones(data ?? [])
    setLoading(false)
  }

  async function guardar() {
    if (!form.nombre || !form.area) return
    setSaving(true)
    try {
      if (editando) {
        await supabase.from('prestaciones').update(form).eq('id', editando.id)
      } else {
        await supabase.from('prestaciones').insert({ ...form, estado: 'activa' })
      }
      setOpenModal(false)
      setForm({})
      setEditando(null)
      loadAll()
    } finally { setSaving(false) }
  }

  async function toggleEstado(p: Prestacion) {
    await supabase.from('prestaciones').update({ estado: p.estado === 'activa' ? 'inactiva' : 'activa' }).eq('id', p.id)
    loadAll()
  }

  const filtered = prestaciones.filter(p => {
    const q = search.toLowerCase()
    const matchQ = !q || p.nombre.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q)
    const matchA = !filtroArea || p.area === filtroArea
    return matchQ && matchA
  })

  // Agrupar por área
  const porArea: Record<string, Prestacion[]> = {}
  filtered.forEach(p => {
    if (!porArea[p.area]) porArea[p.area] = []
    porArea[p.area].push(p)
  })

  if (loading) return <Page><div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={36} /></div></Page>

  return (
    <Page>
      <PageHeader
        title="Catálogo de Prestaciones"
        subtitle={`${prestaciones.filter(p => p.estado === 'activa').length} prestaciones activas`}
        action={canEdit ? <Button onClick={() => { setForm({}); setEditando(null); setOpenModal(true) }}>+ Nueva prestación</Button> : undefined}
      />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Input placeholder="Buscar por nombre o código..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <Select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{ width: 180 }}>
          <option value="">Todas las áreas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>

      {Object.keys(porArea).length === 0 ? (
        <Empty message="Sin prestaciones — agregá prestaciones al catálogo" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(porArea).map(([area, items]) => (
            <Card key={area}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#335955' }}>🏥 {area}</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{items.length} prestación{items.length !== 1 ? 'es' : ''}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Código','Nombre','Arancel base','Estado', canEdit ? 'Acciones' : ''].filter(Boolean).map(h => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: 'left', background: 'var(--slate-50)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--text-3)', fontSize: '12px' }}>{p.codigo ?? '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <p style={{ fontWeight: 600 }}>{p.nombre}</p>
                        {p.descripcion && <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{p.descripcion}</p>}
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: p.arancel_base ? '#335955' : 'var(--text-3)' }}>
                        {p.arancel_base ? `$${p.arancel_base.toLocaleString('es-AR')}` : 'Variable'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <Badge variant={p.estado === 'activa' ? 'green' : 'slate'}>{p.estado}</Badge>
                      </td>
                      {canEdit && (
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => { setEditando(p); setForm(p); setOpenModal(true) }}
                              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>
                              Editar
                            </button>
                            <button onClick={() => toggleEstado(p)}
                              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', color: p.estado === 'activa' ? 'var(--red-600)' : 'var(--green-600)' }}>
                              {p.estado === 'activa' ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}

      <Modal open={openModal} onClose={() => { setOpenModal(false); setForm({}); setEditando(null) }}
        title={editando ? 'Editar prestación' : 'Nueva prestación'} width={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select label="Área *" value={form.area ?? ''} onChange={e => setForm(p => ({ ...p, area: e.target.value }))}>
            <option value="">Seleccionar área...</option>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Input label="Nombre *" value={form.nombre ?? ''} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
          <Input label="Código (opcional)" value={form.codigo ?? ''} onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))} placeholder="Ej: INT-001" />
          <Input label="Descripción" value={form.descripcion ?? ''} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
          <Input label="Arancel base ($)" type="number" value={form.arancel_base ?? ''} onChange={e => setForm(p => ({ ...p, arancel_base: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="Dejar vacío si es variable" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => { setOpenModal(false); setForm({}); setEditando(null) }}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving || !form.nombre || !form.area}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}
