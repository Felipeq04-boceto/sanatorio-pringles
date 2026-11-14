import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Card, Select, Spinner, Empty } from '@/components/ui'
import { AMBULATORIO, CIERRE, INICIO, INTERNACION, type Pregunta } from '@/features/encuestas/encuestaConfig'

// Informe de encuestas para compartir con el equipo.
// Lee las mismas respuestas que la pantalla de Encuestas, sin datos de contacto,
// y se puede imprimir o guardar como PDF desde el botón de la cabecera.

// ── Etiquetas a partir de la configuración de la encuesta ──────────────
const TODAS: Pregunta[] = [...INICIO, ...AMBULATORIO, ...INTERNACION, ...CIERRE]
const PREGUNTA_TEXTO: Record<string, string> = {}
const OPCION_LABEL: Record<string, Record<string, string>> = {}
TODAS.forEach(p => {
  PREGUNTA_TEXTO[p.id] = p.texto
  if (p.tipo === 'opcion') OPCION_LABEL[p.id] = Object.fromEntries(p.opciones.map(o => [o.valor, o.etiqueta]))
})
const SERVICIO_LABEL: Record<string, string> = { ...OPCION_LABEL.amb_servicio, ...OPCION_LABEL.int_sector }
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', en_curso: 'En curso', resuelta: 'Resuelta', no_aplica: 'No aplica' }
const ESTADO_COLOR: Record<string, string> = { pendiente: '#D97706', en_curso: '#2563EB', resuelta: '#059669', no_aplica: '#64748B' }
const SEGURIDAD: { id: string; texto: string }[] = [
  { id: 'seg_identificacion', texto: 'Le confirmaron nombre y datos antes de cada procedimiento, estudio o medicación' },
  { id: 'seg_higiene_manos', texto: 'Vio al personal higienizarse las manos antes de atenderlo' },
]
const COLUMNAS = 'id,created_at,tipo,servicio,canal,respuestas,csat,nps,destacar,mejorar,requiere_alerta,urgente,motivos_alerta,gestion_estado,gestion_notas'
const MESES_EVOLUCION = 6

// ── Períodos ────────────────────────────────────────────────────────────
interface Periodo { key: string; label: string; desde: Date | null; hasta: Date | null; prevDesde: Date | null; prevHasta: Date | null }

function armarPeriodos(): Periodo[] {
  const hoy = new Date()
  const dia = 86400000
  const lista: Periodo[] = [
    { key: '90', label: 'Últimos 90 días', desde: new Date(hoy.getTime() - 90 * dia), hasta: null, prevDesde: new Date(hoy.getTime() - 180 * dia), prevHasta: new Date(hoy.getTime() - 90 * dia) },
    { key: '30', label: 'Últimos 30 días', desde: new Date(hoy.getTime() - 30 * dia), hasta: null, prevDesde: new Date(hoy.getTime() - 60 * dia), prevHasta: new Date(hoy.getTime() - 30 * dia) },
  ]
  for (let i = 0; i < 12; i++) {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1)
    const nombre = desde.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    lista.push({
      key: `m${i}`, label: nombre.charAt(0).toUpperCase() + nombre.slice(1) + (i === 0 ? ' (en curso)' : ''),
      desde, hasta, prevDesde: new Date(hoy.getFullYear(), hoy.getMonth() - i - 1, 1), prevHasta: desde,
    })
  }
  lista.push({ key: 'todo', label: 'Todo el historial', desde: null, hasta: null, prevDesde: null, prevHasta: null })
  return lista
}

// ── Helpers ─────────────────────────────────────────────────────────────
const servicioDe = (r: any): string => (r.tipo === 'internacion' ? 'Internación' : SERVICIO_LABEL[r.servicio] ?? r.servicio ?? 'Sin dato')
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const enRango = (r: any, desde: Date | null, hasta: Date | null) => {
  const t = new Date(r.created_at).getTime()
  return (!desde || t >= desde.getTime()) && (!hasta || t < hasta.getTime())
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
const colorEscala = (p: number) => (p < 3 ? '#DC2626' : p < 4 ? '#D97706' : '#059669')

// Descarta comentarios que no aportan ("no", "nada", "-")
const esComentario = (t: any): t is string =>
  typeof t === 'string' && t.trim().length > 0 && !/^(no|nada|ningun[ao]?|todo bien|-+|\.+)[\s.!]*$/i.test(t.trim())

function variacion(actual: number | null, anterior: number | null, decimales = 0): { texto: string; color: string } | null {
  if (actual === null || anterior === null) return null
  const d = Math.round((actual - anterior) * 10 ** decimales) / 10 ** decimales
  if (d === 0) return { texto: 'Igual que el período anterior', color: 'var(--text-3)' }
  return { texto: `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} vs. período anterior`, color: d > 0 ? '#059669' : '#DC2626' }
}

const ESTILOS = `
  [data-solo-print] { display: none; }
  @media print {
    @page { margin: 14mm; }
    aside, [data-noprint], main > div[style*="sticky"] { display: none !important; }
    html, body, #root, #root > div, main { height: auto !important; overflow: visible !important; display: block !important; background: #fff !important; }
    [data-solo-print] { display: block !important; }
    [data-bloque] { break-inside: avoid; box-shadow: none !important; }
    [data-informe] * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

// ── Página ──────────────────────────────────────────────────────────────
export function EncuestasInformePage() {
  const navigate = useNavigate()
  const periodos = useMemo(armarPeriodos, [])
  const [datos, setDatos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [periodoKey, setPeriodoKey] = useState('90')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [conComentarios, setConComentarios] = useState(true)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setErrorCarga(null)
    const { data, error } = await supabase.from('encuestas_respuestas').select(COLUMNAS).order('created_at', { ascending: false }).limit(5000)
    if (error) setErrorCarga(error.message)
    setDatos((data ?? []).filter((r: any) => r.canal !== 'prueba'))
    setLoading(false)
  }

  const periodo = periodos.find(p => p.key === periodoKey) ?? periodos[0]
  const delTipo = useMemo(() => datos.filter(r => !filtroTipo || r.tipo === filtroTipo), [datos, filtroTipo])
  const actuales = useMemo(() => delTipo.filter(r => enRango(r, periodo.desde, periodo.hasta)), [delTipo, periodo])
  const anteriores = useMemo(
    () => (periodo.prevDesde ? delTipo.filter(r => enRango(r, periodo.prevDesde, periodo.prevHasta)) : []),
    [delTipo, periodo],
  )

  const resumen = useMemo(() => {
    const alertas = actuales.filter(r => r.requiere_alerta)
    const conNps = actuales.filter(r => r.nps !== null && r.nps !== undefined)
    return {
      total: actuales.length, nps: calcularNps(actuales), csat: promedioCsat(actuales),
      totalPrev: anteriores.length ? anteriores.length : null, npsPrev: calcularNps(anteriores), csatPrev: promedioCsat(anteriores),
      alertas: alertas.length,
      gestionadas: alertas.filter(r => ['resuelta', 'no_aplica'].includes(r.gestion_estado)).length,
      conNps: conNps.length,
      promotores: conNps.filter(r => r.nps >= 9).length,
      pasivos: conNps.filter(r => r.nps === 7 || r.nps === 8).length,
      detractores: conNps.filter(r => r.nps <= 6).length,
    }
  }, [actuales, anteriores])

  const evolucion = useMemo(() => {
    const hoy = new Date()
    return Array.from({ length: MESES_EVOLUCION }, (_, i) => {
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (MESES_EVOLUCION - 1 - i), 1)
      const hasta = new Date(desde.getFullYear(), desde.getMonth() + 1, 1)
      const lista = delTipo.filter(r => enRango(r, desde, hasta))
      return { mes: desde.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }), n: lista.length, nps: calcularNps(lista), csat: promedioCsat(lista) }
    })
  }, [delTipo])

  const porServicio = useMemo(() => {
    const g: Record<string, any[]> = {}
    actuales.forEach(r => { (g[servicioDe(r)] ??= []).push(r) })
    return Object.entries(g).map(([nombre, lista]) => ({
      nombre, n: lista.length, nps: calcularNps(lista), csat: promedioCsat(lista),
      alertas: lista.filter(r => r.requiere_alerta).length,
    })).sort((a, b) => b.n - a.n)
  }, [actuales])

  const aspectos = useMemo(() => {
    const acc: Record<string, { s: number; n: number }> = {}
    actuales.forEach(r => Object.entries(r.respuestas ?? {}).forEach(([k, v]) => {
      if (typeof v === 'number') { acc[k] ??= { s: 0, n: 0 }; acc[k].s += v; acc[k].n += 1 }
    }))
    const todos = Object.entries(acc)
      .map(([k, { s, n }]) => ({ k, texto: PREGUNTA_TEXTO[k] ?? k, prom: Math.round((s / n) * 10) / 10, n }))
      .sort((a, b) => a.prom - b.prom)
    const cuantos = Math.min(5, Math.floor(todos.length / 2))
    return { aMejorar: todos.slice(0, cuantos), mejores: todos.slice(todos.length - cuantos).reverse(), todos }
  }, [actuales])

  const seguridad = useMemo(() => SEGURIDAD.map(s => {
    const valores = actuales.map(r => r.respuestas?.[s.id]).filter(v => v === 'si' || v === 'no')
    const si = valores.filter(v => v === 'si').length
    return { ...s, si, total: valores.length, pct: valores.length ? Math.round((si / valores.length) * 100) : null }
  }), [actuales])

  const alertas = useMemo(() => actuales.filter(r => r.requiere_alerta), [actuales])
  const sugerencias = useMemo(() => actuales.filter(r => !r.requiere_alerta && esComentario(r.mejorar)), [actuales])
  const reconocimientos = useMemo(() => actuales.filter(r => esComentario(r.destacar)), [actuales])
  const maxMes = Math.max(...evolucion.map(e => e.n), 1)
  const pct = (n: number) => (resumen.conNps ? Math.round((n / resumen.conNps) * 100) : 0)
  const tituloTipo = filtroTipo === 'internacion' ? 'Internación' : filtroTipo === 'ambulatorio' ? 'Atención ambulatoria' : 'Toda la atención'

  return (
    <Page>
      <style>{ESTILOS}</style>
      <div data-informe>
        <div data-noprint>
          <PageHeader
            title="Informe de encuestas"
            subtitle="Resumen para compartir con el equipo · sin datos de contacto de los pacientes"
            action={
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => navigate('/encuestas')}>Volver a encuestas</Button>
                <Button onClick={() => window.print()} disabled={!actuales.length}>Imprimir o guardar PDF</Button>
              </div>
            }
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px', alignItems: 'end' }}>
            <Select label="Período" value={periodoKey} onChange={e => setPeriodoKey(e.target.value)}>
              {periodos.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
            <Select label="Tipo de atención" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="">Todas</option>
              <option value="internacion">Internación</option>
              <option value="ambulatorio">Ambulatoria</option>
            </Select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-2)', padding: '8px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={conComentarios} onChange={e => setConComentarios(e.target.checked)} />
              Incluir comentarios textuales
            </label>
          </div>
        </div>

        {/* Cabecera que solo aparece en el PDF */}
        <div data-solo-print style={{ marginBottom: '18px', borderBottom: '2px solid #335955', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#335955' }}>Informe de encuestas de satisfacción</p>
              <p style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>{periodo.label} · {tituloTipo}</p>
              <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Generado el {new Date().toLocaleDateString('es-AR')} · Uso interno</p>
            </div>
            <img src="/logo.jpg" alt="Sanatorio Integral de la Comunidad" style={{ height: '48px' }} />
          </div>
        </div>

        {errorCarga && (
          <Card style={{ padding: '12px 16px', marginBottom: '16px', background: 'var(--red-50)' }}>
            <p style={{ fontSize: '13px', color: 'var(--red-600)' }}>No se pudieron cargar las encuestas: {errorCarga}</p>
          </Card>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={32} /></div>
        ) : !actuales.length ? (
          <Empty message="No hay respuestas en este período" />
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>

            {/* Indicadores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
              <Indicador label="Respuestas" valor={String(resumen.total)} color="var(--accent)" nota={variacion(resumen.total, resumen.totalPrev)} />
              <Indicador label="NPS" valor={resumen.nps === null ? '—' : String(resumen.nps)} color={colorNps(resumen.nps)} nota={variacion(resumen.nps, resumen.npsPrev)} ayuda="De −100 a 100" />
              <Indicador label="Satisfacción general" valor={resumen.csat === null ? '—' : `${resumen.csat} / 5`} color="var(--accent)" nota={variacion(resumen.csat, resumen.csatPrev, 1)} />
              <Indicador
                label="Alertas"
                valor={String(resumen.alertas)}
                color={resumen.alertas > resumen.gestionadas ? '#DC2626' : '#059669'}
                ayuda={resumen.alertas ? `${resumen.gestionadas} de ${resumen.alertas} ya gestionadas` : 'Ninguna en el período'}
              />
            </div>

            {/* Recomendación */}
            <Bloque titulo="¿Nos recomendarían?" ayuda={`Sobre ${resumen.conNps} respuestas con puntaje de 0 a 10`}>
              <div style={{ display: 'flex', height: 22, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-2)' }}>
                <div style={{ width: `${pct(resumen.promotores)}%`, background: '#059669' }} />
                <div style={{ width: `${pct(resumen.pasivos)}%`, background: '#F59E0B' }} />
                <div style={{ width: `${pct(resumen.detractores)}%`, background: '#DC2626' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '12px' }}>
                {([
                  ['Promotores (9 y 10)', resumen.promotores, '#059669'],
                  ['Neutros (7 y 8)', resumen.pasivos, '#B45309'],
                  ['Detractores (0 a 6)', resumen.detractores, '#DC2626'],
                ] as [string, number, string][]).map(([l, n, c]) => (
                  <div key={l}>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: c }}>{pct(n)}% <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-3)' }}>({n})</span></p>
                    <p style={{ fontSize: '12px', color: 'var(--text-2)' }}>{l}</p>
                  </div>
                ))}
              </div>
            </Bloque>

            {/* Evolución */}
            <Bloque titulo="Evolución mensual" ayuda={`Últimos ${MESES_EVOLUCION} meses, sin importar el período elegido`}>
              <Tabla cab={['Mes', 'Respuestas', '', 'NPS', 'Satisfacción']}>
                {evolucion.map(e => (
                  <tr key={e.mes} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={celda}>{e.mes}</td>
                    <td style={{ ...celda, fontWeight: 600 }}>{e.n}</td>
                    <td style={{ ...celda, width: '40%' }}>
                      <div style={{ height: 8, borderRadius: 99, background: 'var(--accent)', width: `${(e.n / maxMes) * 100}%`, minWidth: e.n ? 4 : 0 }} />
                    </td>
                    <td style={{ ...celda, fontWeight: 700, color: colorNps(e.nps) }}>{e.nps ?? '—'}</td>
                    <td style={celda}>{e.csat ?? '—'}</td>
                  </tr>
                ))}
              </Tabla>
            </Bloque>

            {/* Por servicio */}
            <Bloque titulo="Resultados por servicio">
              <Tabla cab={['Servicio', 'Respuestas', 'NPS', 'Satisfacción', 'Alertas']}>
                {porServicio.map(s => (
                  <tr key={s.nombre} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...celda, fontWeight: 600 }}>{s.nombre}</td>
                    <td style={celda}>{s.n}</td>
                    <td style={{ ...celda, fontWeight: 700, color: colorNps(s.nps) }}>{s.nps ?? '—'}</td>
                    <td style={celda}>{s.csat ?? '—'}</td>
                    <td style={{ ...celda, color: s.alertas ? '#DC2626' : 'var(--text-2)' }}>{s.alertas}</td>
                  </tr>
                ))}
              </Tabla>
              {porServicio.some(s => s.n < 5) && (
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '8px' }}>Los servicios con menos de 5 respuestas dan una idea orientativa: una sola opinión les mueve mucho el resultado.</p>
              )}
            </Bloque>

            {/* Aspectos */}
            {aspectos.todos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {aspectos.mejores.length > 0 ? (
                  <>
                    <Bloque titulo="Lo mejor calificado" ayuda="Promedio de 1 a 5"><Barras items={aspectos.mejores} /></Bloque>
                    <Bloque titulo="Lo más bajo" ayuda="Promedio de 1 a 5 · donde hay más margen para mejorar"><Barras items={aspectos.aMejorar} /></Bloque>
                  </>
                ) : (
                  <Bloque titulo="Aspectos evaluados" ayuda="Promedio de 1 a 5"><Barras items={aspectos.todos} /></Bloque>
                )}
              </div>
            )}

            {/* Seguridad del paciente */}
            {seguridad.some(s => s.total > 0) && (
              <Bloque titulo="Seguridad del paciente" ayuda="Porcentaje que respondió que sí, sin contar a quienes no recordaban">
                <div style={{ display: 'grid', gap: '12px' }}>
                  {seguridad.filter(s => s.total > 0).map(s => (
                    <div key={s.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' }}>
                        <span>{s.texto}</span>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: (s.pct ?? 0) >= 90 ? '#059669' : (s.pct ?? 0) >= 75 ? '#D97706' : '#DC2626' }}>
                          {s.pct}% <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({s.si} de {s.total})</span>
                        </span>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 99, marginTop: 4 }}>
                        <div style={{ width: `${s.pct}%`, height: '100%', borderRadius: 99, background: (s.pct ?? 0) >= 90 ? '#059669' : (s.pct ?? 0) >= 75 ? '#D97706' : '#DC2626' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Bloque>
            )}

            {/* Alertas y gestión */}
            <Bloque
              titulo="Alertas y qué se hizo"
              ayuda={alertas.length
                ? (['resuelta', 'en_curso', 'pendiente', 'no_aplica'] as const)
                    .map(e => [alertas.filter(r => r.gestion_estado === e).length, ESTADO_LABEL[e].toLowerCase()] as [number, string])
                    .filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`).join(' · ')
                : undefined}
            >
              {!alertas.length ? (
                <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>No hubo alertas en el período.</p>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {alertas.map(r => (
                    <div key={r.id} data-bloque style={{ border: '1px solid var(--border)', borderLeft: `4px solid ${ESTADO_COLOR[r.gestion_estado] ?? '#64748B'}`, borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600 }}>
                        {servicioDe(r)} · {fechaCorta(r.created_at)}
                        <span style={{ fontWeight: 600, color: ESTADO_COLOR[r.gestion_estado] ?? '#64748B' }}> · {ESTADO_LABEL[r.gestion_estado] ?? r.gestion_estado}</span>
                        {r.urgente && <span style={{ color: '#DC2626' }}> · Urgente</span>}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
                        {(r.motivos_alerta ?? []).filter((m: string) => !m.startsWith('URGENTE')).join(' · ') || 'Sin motivo registrado'}
                      </p>
                      {conComentarios && esComentario(r.mejorar) && <p style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.5 }}>“{r.mejorar.trim()}”</p>}
                      <p style={{ fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                        <strong>Qué se hizo:</strong>{' '}
                        {r.gestion_notas?.trim() || <span style={{ color: 'var(--text-3)' }}>Todavía no hay una gestión registrada.</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Bloque>

            {/* Comentarios */}
            {conComentarios && sugerencias.length > 0 && (
              <Bloque titulo={`Qué nos piden mejorar (${sugerencias.length})`} ayuda="Comentarios de respuestas que no generaron alerta">
                <Citas items={sugerencias.map(r => ({ id: r.id, texto: r.mejorar, pie: `${servicioDe(r)} · ${fechaCorta(r.created_at)}` }))} />
              </Bloque>
            )}
            {conComentarios && reconocimientos.length > 0 && (
              <Bloque titulo={`Reconocimientos al equipo (${reconocimientos.length})`}>
                <Citas items={reconocimientos.map(r => ({ id: r.id, texto: r.destacar, pie: `${servicioDe(r)} · ${fechaCorta(r.created_at)}` }))} />
              </Bloque>
            )}
          </div>
        )}
      </div>
    </Page>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────
const celda: React.CSSProperties = { padding: '8px 12px', fontSize: '13px' }

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <Card data-bloque style={{ padding: '16px 20px' }}>
      <p style={{ fontWeight: 600, marginBottom: ayuda ? '2px' : '12px' }}>{titulo}</p>
      {ayuda && <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '12px' }}>{ayuda}</p>}
      {children}
    </Card>
  )
}

function Indicador({ label, valor, color, ayuda, nota }: {
  label: string; valor: string; color: string; ayuda?: string; nota?: { texto: string; color: string } | null
}) {
  return (
    <Card data-bloque style={{ padding: '16px 20px' }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>{label.toUpperCase()}</p>
      <p style={{ fontSize: '28px', fontWeight: 700, color, lineHeight: 1.1 }}>{valor}</p>
      {ayuda && <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>{ayuda}</p>}
      {nota && <p style={{ fontSize: '12px', color: nota.color, marginTop: '4px' }}>{nota.texto}</p>}
    </Card>
  )
}

function Tabla({ cab, children }: { cab: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
            {cab.map((h, i) => <th key={i} style={{ ...celda, fontWeight: 600 }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Barras({ items }: { items: { k: string; texto: string; prom: number; n: number }[] }) {
  return (
    <>
      {items.map(d => (
        <div key={d.k} style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px' }}>
            <span>{d.texto}</span>
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.prom} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({d.n})</span></span>
          </div>
          <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 99, marginTop: 4 }}>
            <div style={{ width: `${(d.prom / 5) * 100}%`, height: '100%', borderRadius: 99, background: colorEscala(d.prom) }} />
          </div>
        </div>
      ))}
    </>
  )
}

function Citas({ items }: { items: { id: string; texto: string; pie: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
      {items.map(c => (
        <div key={c.id} data-bloque style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
          <p style={{ fontSize: '13px', lineHeight: 1.5 }}>“{c.texto.trim()}”</p>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>{c.pie}</p>
        </div>
      ))}
    </div>
  )
}
