import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui'
import { AMBULATORIO, INTERNACION } from '@/features/encuestas/encuestaConfig'

const SERVICIO_LABEL: Record<string, string> = {}
;[AMBULATORIO[0], INTERNACION.find(p => p.id === 'int_sector')].forEach(p => {
  if (p && p.tipo === 'opcion') p.opciones.forEach(o => { SERVICIO_LABEL[o.valor] = o.etiqueta })
})

export function EncuestasDashboardCard() {
  const navigate = useNavigate()
  const [alertas, setAlertas] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [nps, setNps] = useState<number | null>(null)

  useEffect(() => {
    cargar()
    const t = window.setInterval(cargar, 60000)
    return () => window.clearInterval(t)
  }, [])

  async function cargar() {
    const desde = new Date(Date.now() - 30 * 86400000).toISOString()
    const [{ data: pend, count }, { data: mes }] = await Promise.all([
      supabase.from('encuestas_respuestas')
        .select('id, created_at, tipo, servicio, lugar, urgente, motivos_alerta, mejorar', { count: 'exact' })
        .eq('requiere_alerta', true).eq('gestion_estado', 'pendiente').neq('canal', 'prueba')
        .order('urgente', { ascending: false }).order('created_at', { ascending: false }).limit(5),
      supabase.from('encuestas_respuestas').select('nps').gte('created_at', desde).neq('canal', 'prueba'),
    ])
    setAlertas(pend ?? [])
    setTotal(count ?? 0)
    const v = (mes ?? []).map((r: any) => r.nps).filter((x: any) => typeof x === 'number')
    setNps(v.length ? Math.round(((v.filter((x: number) => x >= 9).length - v.filter((x: number) => x <= 6).length) / v.length) * 100) : null)
  }

  return (
    <Card style={{ padding: 0, marginTop: '20px' }}>
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 600, fontSize: '15px' }}>💬 Encuestas: alertas pendientes</p>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>NPS 30 días: <strong>{nps ?? '—'}</strong></span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: total ? '#DC2626' : '#059669', background: total ? 'var(--red-50)' : 'var(--green-50)', borderRadius: 99, padding: '2px 10px' }}>{total}</span>
        </div>
      </div>
      {alertas.length === 0 ? (
        <p style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--text-3)' }}>No hay alertas pendientes.</p>
      ) : alertas.map(a => (
        <div key={a.id} onClick={() => navigate('/encuestas')} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, borderRadius: 99, padding: '2px 10px', whiteSpace: 'nowrap', color: a.urgente ? '#DC2626' : '#D97706', background: a.urgente ? 'var(--red-50)' : 'var(--amber-50)' }}>
            {a.urgente ? 'urgente' : 'pendiente'}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 500 }}>
              {a.tipo === 'internacion' ? 'Internación' : SERVICIO_LABEL[a.servicio] ?? a.servicio ?? 'Sin servicio'}
              {a.lugar?.startsWith('hab-') ? ` · Habitación ${a.lugar.slice(4)}` : ''}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.mejorar || (a.motivos_alerta ?? []).filter((m: string) => !m.startsWith('URGENTE')).join(' · ')}
            </p>
          </div>
        </div>
      ))}
      <div style={{ padding: '10px 24px', textAlign: 'right' }}>
        <button onClick={() => navigate('/encuestas')} style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>Ver encuestas →</button>
      </div>
    </Card>
  )
}
