import React from 'react'
import { useEffect, useState } from 'react'
import { supabase, type AlertaStock } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const TIPO_BADGE: Record<string, any> = {
  stock_cero: 'red', stock_minimo: 'amber', vencimiento_proximo: 'amber',
  tubo_vencido: 'red', sin_proveedor: 'blue'
}

export function AlertasPage() {
  const { usuario } = useAuth()
  const [alertas,  setAlertas]  = useState<AlertaStock[]>([])
  const [loading,  setLoading]  = useState(true)
  const [resolviendo, setResolviendo] = useState<string | null>(null)

  useEffect(() => { loadAlertas() }, [])

  async function loadAlertas() {
    setLoading(true)
    const { data } = await supabase
      .from('alertas_stock')
      .select('*, insumos(nombre, stock_actual, unidad_medida, stock_minimo)')
      .eq('resuelta', false)
      .order('fecha_generacion', { ascending: false })
    setAlertas((data ?? []) as AlertaStock[])
    setLoading(false)
  }

  async function resolver(id: string) {
    setResolviendo(id)
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('alertas_stock').update({
      resuelta: true,
      fecha_resolucion: new Date().toISOString(),
      resuelta_por: user?.id ?? null,
    }).eq('id', id)
    loadAlertas()
    setResolviendo(null)
  }

  const canEdit = usuario?.rol && ['admin', 'insumos'].includes(usuario.rol)

  return (
    <Page>
      <PageHeader
        title="Alertas de stock"
        subtitle={alertas.length === 0 ? 'Sin alertas activas' : `${alertas.length} alertas pendientes`}
      />

      {alertas.length > 0 && (
        <div style={{
          background: 'var(--red-50)', border: '1px solid #fca5a5',
          borderRadius: 'var(--radius-lg)', padding: '14px 20px',
          marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <p style={{ fontSize: '13px', color: 'var(--red-600)', fontWeight: 500 }}>
            Hay {alertas.length} alerta{alertas.length > 1 ? 's' : ''} activa{alertas.length > 1 ? 's' : ''} que requieren atención.
          </p>
        </div>
      )}

      <Card>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>
        ) : alertas.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>✅</p>
            <p style={{ fontWeight: 600, marginBottom: '4px' }}>Sin alertas activas</p>
            <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Todos los insumos están dentro de los niveles normales.</p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Insumo</Th>
                <Th>Mensaje</Th>
                <Th>Stock actual</Th>
                <Th>Fecha</Th>
                {canEdit && <Th>Acción</Th>}
              </tr>
            </thead>
            <tbody>
              {alertas.map(a => (
                <tr key={a.id}>
                  <Td><Badge variant={TIPO_BADGE[a.tipo_alerta] ?? 'slate'}>{a.tipo_alerta.replace(/_/g, ' ')}</Badge></Td>
                  <Td style={{ fontWeight: 500 }}>{a.insumos?.nombre ?? '—'}</Td>
                  <Td style={{ fontSize: '12px', color: 'var(--text-2)', maxWidth: 320 }}>{a.mensaje}</Td>
                  <Td>
                    {a.insumos && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600,
                        color: a.insumos.stock_actual === 0 ? 'var(--red-600)' : 'var(--amber-600)' }}>
                        {a.insumos.stock_actual} {a.insumos.unidad_medida}
                      </span>
                    )}
                  </Td>
                  <Td style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                    {new Date(a.fecha_generacion).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  </Td>
                  {canEdit && (
                    <Td>
                      <Button
                        variant="secondary" size="sm"
                        loading={resolviendo === a.id}
                        onClick={() => resolver(a.id)}
                      >
                        Resolver
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  )
}
