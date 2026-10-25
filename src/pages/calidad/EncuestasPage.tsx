import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Modal, Spinner, Empty, Select } from '@/components/ui'
import { AMBULATORIO, CIERRE, INICIO, INTERNACION, type Pregunta } from '@/features/encuestas/encuestaConfig'

// ── Etiquetas a partir de la configuración de la encuesta ──────────────
const TODAS: Pregunta[] = [...INICIO, ...AMBULATORIO, ...INTERNACION, ...CIERRE]
const PREGUNTA_TEXTO: Record<string, string> = {}
const OPCION_LABEL: Record<string, Record<string, string>> = {}
TODAS.forEach(p => {
  PREGUNTA_TEXTO[p.id] = p.texto
  if (p.tipo === 'opcion') OPCION_LABEL[p.id] = Object.fromEntries(p.opciones.map(o => [o.valor, o.etiqueta]))
})
const SERVICIO_LABEL: Record<string, string> = { ...OPCION_LABEL.amb_servicio, ...OPCION_LABEL.int_sector, internacion: 'Internación' }
const ESCALA = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente']
const SINO: Record<string, string> = { si: 'Sí', no: 'No', no_recuerdo: 'No recuerdo', na: 'No corresponde' }
const CANAL_LABEL: Record<string, string> = {
  qr_internacion: 'QR internación', qr_servicio: 'QR servicio', qr_habitacion: 'QR habitación',
  qr_general: 'QR general', whatsapp: 'WhatsApp', email: 'Email', prueba: 'Prueba',
}
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', en_curso: 'En curso', resuelta: 'Resuelta', no_aplica: 'No aplica' }
const ESTADO_BADGE: Record<string, any> = { pendiente: 'amber', en_curso: 'blue', resuelta: 'green', no_aplica: 'slate' }

const PERIODOS = [
  { key: '30', label: 'Últimos 30 días', dias: 30 },
  { key: '90', label: 'Últimos 90 días', dias: 90 },
  { key: '365', label: 'Últimos 12 meses', dias: 365 },
  { key: 'todo', label: 'Todo', dias: 0 },
]

type Tab = 'alertas' | 'respuestas' | 'servicios' | 'reconocimientos'

// ── Helpers ─────────────────────────────────────────────────────────────
const servicioDe = (r: any) => (r.tipo === 'internacion' ? 'Internación' : SERVICIO_LABEL[r.servicio] ?? r.servicio ?? 'Sin dato')
const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

function formatearValor(id: string, v: any): string {
  if (typeof v === 'number') return `${v} · ${ESCALA[v] ?? ''}`
  if (OPCION_LABEL[id]?.[v]) return OPCION_LABEL[id][v]
  if (SINO[v]) return SINO[v]
  return String(v)
}

function calcularNps(lista: any[]): number | null {
  const conNps = lista.filter(r => r.nps !== null && r.nps !== undefined)
  if (!conNps.length) return null
  const prom = conNps.filter(r => r.nps >= 9).length
  const det = conNps.filter(r => r.nps <= 6).length
  return Math.round(((prom - det) / conNps.length) * 100)
}

function promedioCsat(lista: any[]): number | null {
  const v = lista.map(r => r.csat).filter((x: any) => typeof x === 'number')
  return v.length ? Math.round((v.reduce((a: number, b: number) => a + b, 0) / v.length) * 10) / 10 : null
}

const colorNps = (n: number | null) => (n === null ? 'var(--text-3)' : n >= 50 ? '#059669' : n >= 0 ? '#D97706' : '#DC2626')

function linkWhatsapp(tel: string) {
  let d = tel.replace(/\D/g, '')
  if (!d.startsWith('54')) d = '549' + d.replace(/^0/, '')
  return `https://wa.me/${d}`
}

function exportarCsv(lista: any[]) {
  const claves = Array.from(new Set(lista.flatMap(r => Object.keys(r.respuestas ?? {})))).sort()
  const cab = ['fecha', 'tipo', 'servicio', 'canal', 'lugar', 'respondente', 'satisfaccion', 'nps', 'alerta', 'urgente', 'estado_gestion', 'motivos', 'destacar', 'mejorar', 'contacto_nombre', 'contacto_telefono', 'contacto_email', ...claves]
  const esc = (x: any) => `"${String(x ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
  const filas = lista.map(r => [
    fecha(r.created_at), r.tipo, servicioDe(r), CANAL_LABEL[r.canal] ?? r.canal, r.lugar, r.respondente,
    r.csat, r.nps, r.requiere_alerta ? 'sí' : 'no', r.urgente ? 'sí' : 'no', ESTADO_LABEL[r.gestion_estado],
    (r.motivos_alerta ?? []).join(' | '), r.destacar, r.mejorar, r.contacto_nombre, r.contacto_telefono, r.contacto_email,
    ...claves.map(k => (r.respuestas?.[k] !== undefined ? formatearValor(k, r.respuestas[k]) : '')),
  ].map(esc).join(';'))
  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...filas].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `encuestas-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Página ──────────────────────────────────────────────────────────────
export function EncuestasPage() {
  const [datos, setDatos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState('90')
  const [tab, setTab] = useState<Tab>('alertas')
  const [filtroEstado, setFiltroEstado] = useState('abiertas')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroServicio, setFiltroServicio] = useState('')
  const [activa, setActiva] = useState<any>(null)
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorGestion, setErrorGestion] = useState<string | null>(null)

  useEffect(() => {
    cargar()
    const t = window.setInterval(cargar, 60000)
    return () => window.clearInterval(t)
  }, [periodo])

  async function cargar() {
    setErrorCarga(null)
    let q = supabase.from('encuestas_respuestas').select('*').order('created_at', { ascending: false }).limit(5000)
    const p = PERIODOS.find(x => x.key === periodo)
    if (p && p.dias > 0) q = q.gte('created_at', new Date(Date.now() - p.dias * 86400000).toISOString())
    const { data, error } = await q
    if (error) setErrorCarga(error.message)
    setDatos((data ?? []).filter((r: any) => r.canal !== 'prueba'))
    setLoading(false)
  }

  function abrir(r: any) {
    setActiva(r)
    setNotas(r.gestion_notas ?? '')
    setErrorGestion(null)
  }

  async function guardarGestion(estado: string) {
    if (!activa) return
    setSaving(true)
    setErrorGestion(null)
    const { data: { user } } = await supabase.auth.getUser()
    const cambios = { gestion_estado: estado, gestion_notas: notas.trim() || null, gestionada_por: user?.id ?? null, gestionada_at: new Date().toISOString() }
    const { error } = await supabase.from('encuestas_respuestas').update(cambios).eq('id', activa.id)
    setSaving(false)
    if (error) { setErrorGestion(`No se pudo guardar: ${error.message}`); return }
    setActiva((p: any) => (p ? { ...p, ...cambios } : p))
    setDatos(prev => prev.map(r => (r.id === activa.id ? { ...r, ...cambios } : r)))
  }

  // ── Derivados ─────────────────────────────────────────────────────────
  const filtrados = useMemo(() => datos.filter(r =>
    (!filtroTipo || r.tipo === filtroTipo) && (!filtroServicio || servicioDe(r) === filtroServicio)
  ), [datos, filtroTipo, filtroServicio])

  const alertas = useMemo(() => filtrados
    .filter(r => r.requiere_alerta)
    .filter(r => filtroEstado === 'todas' ? true
      : filtroEstado === 'abiertas' ? ['pendiente', 'en_curso'].includes(r.gestion_estado)
      : r.gestion_estado === filtroEstado)
    .sort((a, b) => Number(b.urgente && b.gestion_estado === 'pendiente') - Number(a.urgente && a.gestion_estado === 'pendiente')),
  [filtrados, filtroEstado])

  const stats = useMemo(() => ({
    total: filtrados.length,
    nps: calcularNps(filtrados),
    csat: promedioCsat(filtrados),
    pendientes: filtrados.filter(r => r.requiere_alerta && r.gestion_estado === 'pendiente').length,
    urgentes: filtrados.filter(r => r.urgente && r.gestion_estado === 'pendiente').length,
  }), [filtrados])

  const porServicio = useMemo(() => {
    const g: Record<string, any[]> = {}
    filtrados.forEach(r => { (g[servicioDe(r)] ??= []).push(r) })
    return Object.entries(g).map(([nombre, lista]) => ({
      nombre, n: lista.length, nps: calcularNps(lista), csat: promedioCsat(lista),
      alertas: lista.filter(r => r.requiere_alerta).length,
    })).sort((a, b) => b.n - a.n)
  }, [filtrados])

  const porCanal = useMemo(() => {
    const g: Record<string, number> = {}
    filtrados.forEach(r => { const c = CANAL_LABEL[r.canal] ?? r.canal ?? 'Sin dato'; g[c] = (g[c] ?? 0) + 1 })
    return Object.entries(g).sort((a, b) => b[1] - a[1])
  }, [filtrados])

  const dimensiones = useMemo(() => {
    const acc: Record<string, { s: number; n: number }> = {}
    filtrados.forEach(r => Object.entries(r.respuestas ?? {}).forEach(([k, v]) => {
      if (typeof v === 'number') { acc[k] ??= { s: 0, n: 0 }; acc[k].s += v; acc[k].n += 1 }
    }))
    return Object.entries(acc)
      .map(([k, { s, n }]) => ({ k, texto: PREGUNTA_TEXTO[k] ?? k, prom: Math.round((s / n) * 10) / 10, n }))
      .sort((a, b) => a.prom - b.prom)
  }, [filtrados])

  const reconocimientos = useMemo(() => filtrados.filter(r => r.destacar?.trim()), [filtrados])
  const serviciosDisponibles = useMemo(() => Array.from(new Set(datos.map(servicioDe))).sort(), [datos])

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Page>
      <PageHeader
        title="Encuestas de satisfacción"
        subtitle="El Sanatorio te escucha · respuestas de pacientes y familiares"
        action={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={cargar}>Actualizar</Button>
            <Button variant="secondary" onClick={() => exportarCsv(filtrados)} disabled={!filtrados.length}>Exportar CSV</Button>
          </div>
        }
      />

      {errorCarga && (
        <Card style={{ padding: '12px 16px', marginBottom: '16px', background: 'var(--red-50)' }}>
          <p style={{ fontSize: '13px', color: 'var(--red-600)' }}>No se pudieron cargar las encuestas: {errorCarga}</p>
        </Card>
      )}

      {/* Filtros */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <Select label="Período" value={periodo} onChange={e => setPeriodo(e.target.value)}>
          {PERIODOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
        <Select label="Tipo de atención" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todas</option>
          <option value="internacion">Internación</option>
          <option value="ambulatorio">Ambulatoria</option>
        </Select>
        <Select label="Servicio" value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)}>
          <option value="">Todos</option>
          {serviciosDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {/* Indicadores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Respuestas', valor: String(stats.total), color: 'var(--accent)', ayuda: PERIODOS.find(p => p.key === periodo)?.label },
          { label: 'NPS', valor: stats.nps === null ? '—' : String(stats.nps), color: colorNps(stats.nps), ayuda: 'De −100 a 100' },
          { label: 'Satisfacción general', valor: stats.csat === null ? '—' : `${stats.csat} / 5`, color: 'var(--accent)', ayuda: 'Promedio' },
          { label: 'Alertas pendientes', valor: String(stats.pendientes), color: stats.pendientes ? '#DC2626' : '#059669', ayuda: 'Sin gestionar', onClick: () => { setTab('alertas'); setFiltroEstado('pendiente') } },
          { label: 'Urgentes', valor: String(stats.urgentes), color: stats.urgentes ? '#DC2626' : '#059669', ayuda: 'Pacientes internados', onClick: () => { setTab('alertas'); setFiltroEstado('pendiente') } },
        ].map(s => (
          <Card key={s.label} style={{ padding: '16px 20px', cursor: s.onClick ? 'pointer' : 'default' }} onClick={s.onClick}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>{s.label.toUpperCase()}</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.valor}</p>
            {s.ayuda && <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>{s.ayuda}</p>}
          </Card>
        ))}
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', marginBottom: '16px', borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {([
          ['alertas', `Alertas (${filtrados.filter(r => r.requiere_alerta && ['pendiente', 'en_curso'].includes(r.gestion_estado)).length})`],
          ['respuestas', `Respuestas (${filtrados.length})`],
          ['servicios', 'Por servicio'],
          ['reconocimientos', `Reconocimientos (${reconocimientos.length})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 18px', whiteSpace: 'nowrap', fontSize: '13px', marginBottom: '-2px',
            fontWeight: tab === k ? 700 : 400,
            color: tab === k ? 'var(--accent)' : 'var(--text-2)',
            borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={32} /></div>
      ) : (
        <>
          {tab === 'alertas' && (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {[['abiertas', 'Abiertas'], ['pendiente', 'Pendientes'], ['en_curso', 'En curso'], ['resuelta', 'Resueltas'], ['todas', 'Todas']].map(([k, l]) => (
                  <Button key={k} size="sm" variant={filtroEstado === k ? 'primary' : 'secondary'} onClick={() => setFiltroEstado(k)}>{l}</Button>
                ))}
              </div>
              {alertas.length === 0 ? <Empty message="No hay alertas con este filtro" /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {alertas.map(r => <FilaRespuesta key={r.id} r={r} onClick={() => abrir(r)} />)}
                </div>
              )}
            </>
          )}

          {tab === 'respuestas' && (
            filtrados.length === 0 ? <Empty message="Todavía no hay respuestas en este período" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtrados.slice(0, 300).map(r => <FilaRespuesta key={r.id} r={r} onClick={() => abrir(r)} />)}
                {filtrados.length > 300 && <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Se muestran las 300 más recientes. Exportá el CSV para ver todas.</p>}
              </div>
            )
          )}

          {tab === 'servicios' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <Card style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                      {['Servicio', 'Respuestas', 'NPS', 'Satisfacción', 'Alertas'].map(h => <th key={h} style={{ padding: '10px 16px', fontWeight: 600 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {porServicio.map(s => (
                      <tr key={s.nombre} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => { setFiltroServicio(s.nombre); setTab('respuestas') }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{s.nombre}</td>
                        <td style={{ padding: '10px 16px' }}>{s.n}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: colorNps(s.nps) }}>{s.nps ?? '—'}</td>
                        <td style={{ padding: '10px 16px' }}>{s.csat ?? '—'}</td>
                        <td style={{ padding: '10px 16px', color: s.alertas ? '#DC2626' : 'var(--text-2)' }}>{s.alertas}</td>
                      </tr>
                    ))}
                    {!porServicio.length && <tr><td colSpan={5} style={{ padding: '16px', color: 'var(--text-3)' }}>Sin datos</td></tr>}
                  </tbody>
                </table>
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                <Card style={{ padding: '16px 20px' }}>
                  <p style={{ fontWeight: 600, marginBottom: '4px' }}>Aspectos peor calificados</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '12px' }}>Promedio de 1 a 5, de menor a mayor</p>
                  {dimensiones.slice(0, 10).map(d => (
                    <div key={d.k} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px' }}>
                        <span>{d.texto}</span>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.prom} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({d.n})</span></span>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 99, marginTop: 4 }}>
                        <div style={{ width: `${(d.prom / 5) * 100}%`, height: '100%', borderRadius: 99, background: d.prom < 3 ? '#DC2626' : d.prom < 4 ? '#D97706' : 'var(--accent)' }} />
                      </div>
                    </div>
                  ))}
                  {!dimensiones.length && <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Sin datos</p>}
                </Card>

                <Card style={{ padding: '16px 20px' }}>
                  <p style={{ fontWeight: 600, marginBottom: '12px' }}>Respuestas por canal</p>
                  {porCanal.map(([c, n]) => (
                    <div key={c} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                      <span>{c}</span><span style={{ fontWeight: 700 }}>{n}</span>
                    </div>
                  ))}
                  {!porCanal.length && <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Sin datos</p>}
                </Card>
              </div>
            </div>
          )}

          {tab === 'reconocimientos' && (
            reconocimientos.length === 0 ? <Empty message="Todavía no hay reconocimientos al personal" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {reconocimientos.map(r => (
                  <Card key={r.id} style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => abrir(r)}>
                    <p style={{ fontSize: '14px', lineHeight: 1.6, marginBottom: '10px' }}>“{r.destacar}”</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{servicioDe(r)} · {fecha(r.created_at)}</p>
                  </Card>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Detalle */}
      <Modal open={!!activa} onClose={() => setActiva(null)} title="Respuesta de encuesta" width={680}>
        {activa && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {activa.urgente && <Badge variant="red">Urgente</Badge>}
              {activa.requiere_alerta && <Badge variant={ESTADO_BADGE[activa.gestion_estado]}>{ESTADO_LABEL[activa.gestion_estado]}</Badge>}
              <Badge variant="slate">{servicioDe(activa)}</Badge>
              <Badge variant="slate">{CANAL_LABEL[activa.canal] ?? activa.canal ?? 'Sin canal'}</Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{fecha(activa.created_at)}{activa.lugar ? ` · ${activa.lugar}` : ''}</span>
            </div>

            {(activa.motivos_alerta ?? []).length > 0 && (
              <div style={{ background: 'var(--red-50)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red-600)', marginBottom: '6px' }}>MOTIVOS DE ALERTA</p>
                {activa.motivos_alerta.map((m: string) => <p key={m} style={{ fontSize: '13px' }}>• {m}</p>)}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[
                ['Responde', activa.respondente === 'familiar' ? 'Familiar o acompañante' : activa.respondente === 'paciente' ? 'Paciente' : '—'],
                ['Satisfacción', activa.csat ? `${activa.csat} · ${ESCALA[activa.csat]}` : '—'],
                ['Recomendación', activa.nps ?? '—'],
              ].map(([l, v]) => (
                <div key={String(l)} style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{String(l).toUpperCase()}</p>
                  <p style={{ fontWeight: 600, fontSize: '13px' }}>{String(v)}</p>
                </div>
              ))}
            </div>

            {(activa.mejorar || activa.destacar) && (
              <div style={{ display: 'grid', gap: '10px' }}>
                {activa.mejorar && <Bloque titulo="QUÉ DEBERÍAMOS MEJORAR" texto={activa.mejorar} />}
                {activa.destacar && <Bloque titulo="PERSONA O EQUIPO DESTACADO" texto={activa.destacar} />}
              </div>
            )}

            {activa.consentimiento_contacto && (activa.contacto_nombre || activa.contacto_telefono || activa.contacto_email) && (
              <div style={{ background: 'var(--blue-50)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--blue-700)', marginBottom: '6px' }}>PIDIÓ QUE LO CONTACTEMOS</p>
                {activa.contacto_nombre && <p style={{ fontWeight: 600, fontSize: '13px' }}>{activa.contacto_nombre}</p>}
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '13px', marginTop: '4px' }}>
                  {activa.contacto_telefono && <a href={`tel:${activa.contacto_telefono}`} style={{ textDecoration: 'underline' }}>{activa.contacto_telefono}</a>}
                  {activa.contacto_telefono && <a href={linkWhatsapp(activa.contacto_telefono)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Escribir por WhatsApp</a>}
                  {activa.contacto_email && <a href={`mailto:${activa.contacto_email}`} style={{ textDecoration: 'underline' }}>{activa.contacto_email}</a>}
                </div>
              </div>
            )}

            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>RESPUESTAS</p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 260, overflowY: 'auto' }}>
                {Object.entries(activa.respuestas ?? {}).map(([k, v]) => {
                  const bajo = typeof v === 'number' && v <= 2 || v === 'no'
                  return (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-2)' }}>{PREGUNTA_TEXTO[k] ?? k}</span>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', color: bajo ? '#DC2626' : 'var(--text)' }}>{formatearValor(k, v)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>GESTIÓN</p>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={3}
                placeholder="Qué se hizo: a quién se llamó, qué se resolvió, qué quedó pendiente"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', fontSize: '13px', lineHeight: 1.6, resize: 'vertical' }}
              />
              {activa.gestionada_at && <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>Última actualización: {fecha(activa.gestionada_at)}</p>}
              {errorGestion && <p style={{ fontSize: '12px', color: 'var(--red-600)', marginTop: '6px' }}>{errorGestion}</p>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <Button size="sm" variant="secondary" loading={saving} onClick={() => guardarGestion('en_curso')}>Marcar en curso</Button>
                <Button size="sm" loading={saving} onClick={() => guardarGestion('resuelta')}>Marcar resuelta</Button>
                <Button size="sm" variant="secondary" loading={saving} onClick={() => guardarGestion('no_aplica')}>No aplica</Button>
                {activa.gestion_estado !== 'pendiente' && (
                  <Button size="sm" variant="secondary" loading={saving} onClick={() => guardarGestion('pendiente')}>Volver a pendiente</Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  )
}

function Bloque({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '4px' }}>{titulo}</p>
      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '13px', lineHeight: 1.6 }}>{texto}</div>
    </div>
  )
}

function FilaRespuesta({ r, onClick }: { r: any; onClick: () => void }) {
  const texto = r.mejorar || (r.motivos_alerta ?? []).filter((m: string) => !m.startsWith('URGENTE')).join(' · ') || r.destacar || 'Sin comentarios'
  return (
    <Card style={{ cursor: 'pointer', borderLeft: r.urgente && r.gestion_estado === 'pendiente' ? '4px solid #DC2626' : undefined }} onClick={onClick}>
      <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
            {r.urgente && <Badge variant="red">Urgente</Badge>}
            {r.requiere_alerta && <Badge variant={ESTADO_BADGE[r.gestion_estado]}>{ESTADO_LABEL[r.gestion_estado]}</Badge>}
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{servicioDe(r)}</span>
            {r.lugar?.startsWith('hab-') && <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>Habitación {r.lugar.slice(4)}</span>}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{fecha(r.created_at)} · {CANAL_LABEL[r.canal] ?? r.canal ?? 'Sin canal'}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: r.nps === null ? 'var(--text-3)' : r.nps >= 9 ? '#059669' : r.nps >= 7 ? '#D97706' : '#DC2626' }}>{r.nps ?? '—'}</p>
          <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>NPS</p>
        </div>
      </div>
    </Card>
  )
}
