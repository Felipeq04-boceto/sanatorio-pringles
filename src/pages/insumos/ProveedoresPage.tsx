import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Input, Select, Modal, Spinner, Empty, Textarea } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

export function ProveedoresPage() {
  const { usuario } = useAuth()
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('proveedores').select('*').order('razon_social')
    setProveedores(data ?? [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.razon_social) return
    setSaving(true)
    try {
      if (form.id) { await supabase.from('proveedores').update(form).eq('id', form.id) }
      else { await supabase.from('proveedores').insert(form) }
      setOpen(false)
      loadAll()
    } finally { setSaving(false) }
  }

  const canEdit = usuario?.rol && ['admin', 'insumos'].includes(usuario.rol)
  const filtered = proveedores.filter(p => !search || p.razon_social?.toLowerCase().includes(search.toLowerCase()))

  return (
    <Page>
      <PageHeader title="Proveedores" subtitle={filtered.length + ' proveedores'}
        action={canEdit ? <Button onClick={() => { setForm({ estado: 'activo' }); setOpen(true) }}>+ Nuevo proveedor</Button> : undefined} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
      </div>
      <Card>
        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div> :
        filtered.length === 0 ? <Empty message="No hay proveedores" /> :
        <Table>
          <thead><tr><Th>Razón social</Th><Th>CUIT</Th><Th>Contacto</Th><Th>Teléfono</Th><Th>Email</Th><Th>Estado</Th>{canEdit && <Th />}</tr></thead>
          <tbody>{filtered.map((p: any) => (
            <tr key={p.id}>
              <Td><p style={{ fontWeight: 600 }}>{p.razon_social}</p></Td>
              <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{p.cuit ?? '—'}</Td>
              <Td>{p.contacto_nombre ?? '—'}</Td>
              <Td style={{ fontSize: 12 }}>{p.contacto_telefono ?? '—'}</Td>
              <Td style={{ fontSize: 12 }}>{p.contacto_email ?? '—'}</Td>
              <Td><Badge variant={p.estado === 'activo' ? 'green' : p.estado === 'suspendido' ? 'red' : 'slate'}>{p.estado}</Badge></Td>
              {canEdit && <Td><Button variant="ghost" size="sm" onClick={() => { setForm({ ...p }); setOpen(true) }}>Editar</Button></Td>}
            </tr>
          ))}</tbody>
        </Table>}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Editar proveedor' : 'Nuevo proveedor'} width={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Razón social *" value={form.razon_social ?? ''} onChange={e => setForm((p: any) => ({ ...p, razon_social: e.target.value }))} />
          <Input label="CUIT" value={form.cuit ?? ''} onChange={e => setForm((p: any) => ({ ...p, cuit: e.target.value }))} />
          <Input label="Contacto nombre" value={form.contacto_nombre ?? ''} onChange={e => setForm((p: any) => ({ ...p, contacto_nombre: e.target.value }))} />
          <Input label="Teléfono" value={form.contacto_telefono ?? ''} onChange={e => setForm((p: any) => ({ ...p, contacto_telefono: e.target.value }))} />
          <Input label="Email" value={form.contacto_email ?? ''} onChange={e => setForm((p: any) => ({ ...p, contacto_email: e.target.value }))} />
          <Select label="Estado" value={form.estado ?? 'activo'} onChange={e => setForm((p: any) => ({ ...p, estado: e.target.value }))}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
            <option value="suspendido">Suspendido</option>
          </Select>
          <Textarea label="Notas" value={form.notas ?? ''} onChange={e => setForm((p: any) => ({ ...p, notas: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Guardar</Button>
        </div>
      </Modal>
    </Page>
  )
}
