import React from 'react'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Card } from '@/components/ui'

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <Page>
      <PageHeader title={title} />
      <Card style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '32px', marginBottom: '12px' }}>🚧</p>
        <p style={{ fontWeight: 600, marginBottom: '6px' }}>{title}</p>
        <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>{description}</p>
      </Card>
    </Page>
  )
}

export function CapacitacionesPage() { return <Placeholder title="Capacitaciones"       description="Registro de capacitaciones y vencimiento de certificaciones." /> }
export function MediacionesPage()    { return <Placeholder title="Mediación sanitaria"  description="Expedientes y seguimiento de mediaciones." /> }
export function MovimientosPage()    { return <Placeholder title="Movimientos de stock" description="Historial completo de entradas, salidas y ajustes." /> }
export function ProveedoresPage()    { return <Placeholder title="Proveedores"          description="Gestión de proveedores y contratos." /> }
