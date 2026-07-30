import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Card, Table, Th, Td, Input, Select, Spinner, Empty } from '@/components/ui'

export function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: m } = await supabase.from('movimientos_stock')
      .select('*, insumos(nombre, unidad_medida)').order('fecha', { ascending: false }).limit(200)
    setMovimientos(m ?? [])
    setLoading(false)
  }

  const TIPO_LABEL: Record<string, string> = {
    entrada: '↑ Entrada', salida: '↓ Salida', ajuste: '↔ Ajuste',
    devolucion: '↩ Devolución', vencimiento: '⚠ Vencimiento', baja: '✕ Baja',
  }

  const filtered = movimientos.filter(m => {
    const ins = m.insumos as any
    const matchSearch = !search || ins?.nombre?.toLowerCase().includes(search.toLowerCase())
    const matchTipo = !filtroTipo || m.tipo_movimiento === filtroTipo
    return matchSearch && matchTipo
  })

  return (
    <Page>
      <PageHeader title="Movimientos de stock" subtitle={filtered.length + ' registros'} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Input placeholder="Buscar insumo..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 250 }} />
        <Select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>
      <Card>
        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div> :
        filtered.length === 0 ? <Empty message="No hay movimientos" /> :
        <Table>
          <thead><tr><Th>Fecha</Th><Th>Insumo</Th><Th>Tipo</Th><Th>Cantidad</Th><Th>Stock anterior</Th><Th>Stock posterior</Th><Th>Sector destino</Th><Th>Remito</Th></tr></thead>
          <tbody>{filtered.map((m: any) => {
            const ins = m.insumos as any
            const esEntrada = ['entrada','devolucion'].includes(m.tipo_movimiento)
            return (
              <tr key={m.id}>
                <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(m.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Td>
                <Td style={{ fontWeight: 500 }}>{ins?.nombre ?? '—'}</Td>
                <Td><Badge variant={esEntrada ? 'green' : m.tipo_movimiento === 'ajuste' ? 'blue' : 'red'}>{TIPO_LABEL[m.tipo_movimiento]}</Badge></Td>
                <Td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: esEntrada ? 'var(--green-600)' : 'var(--red-600)' }}>{esEntrada ? '+' : '-'}{m.cantidad} {ins?.unidad_medida}</Td>
                <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>{m.stock_anterior} {ins?.unidad_medida}</Td>
                <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{m.stock_posterior} {ins?.unidad_medida}</Td>
                <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.sector_destino ?? '—'}</Td>
                <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.remito_numero ?? '—'}</Td>
              </tr>
            )
          })}</tbody>
        </Table>}
      </Card>
    </Page>
  )
}
