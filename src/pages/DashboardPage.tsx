import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Page } from '@/components/layout/AppLayout'
import { Badge, Card, Spinner } from '@/components/ui'
import { EncuestasDashboardCard } from '@/components/encuestas/EncuestasDashboardCard'

// ── Tipos ───────────────────────────────────────────────────────────────
interface InsumoRow { id: string; nombre: string; area: string | null; stock_actual: number; stock_minimo: number }
interface TuboRow { numero_serie: string; tipo_gas: string; fecha_vencimiento: string; dias_restantes: number }
interface LicenciaRow { id: string; tipo_licencia: string; fecha_fin: string; empleados: { nombre: string; apellido: string } | null }
interface PedidoRow { id: string; numero: string; estado: string; created_at: string; proveedores: { razon_social: string } | null }
interface MediacionRow { id: string; tipo_conflicto: string; origen: string; fecha: string; empleados: { nombre: string; apellido: string } | null }

interface Datos {
  empleados: number
  licenciasPorAprobar: number
  deLicenciaHoy: number
  pedidosPorAprobar: number
  certifPorVencer: number
  mediacionesAbiertas: number
  sinStock: InsumoRow[]
  stockBajo: InsumoRow[]
  tubos: TuboRow[]
  licencias: LicenciaRow[]
  pedidos: PedidoRow[]
  mediaciones: MediacionRow[]
}

// ── Etiquetas ───────────────────────────────────────────────────────────
const TIPO_LICENCIA: Record<string, string> = {
  vacaciones: 'Vacaciones', enfermedad: 'Enfermedad', maternidad: 'Maternidad', paternidad: 'Paternidad',
  estudio: 'Estudio', duelo: 'Duelo', sin_goce: 'Sin goce de sueldo', otra: 'Otra',
}
const ESTADO_PEDIDO: Record<string, { label: string; variant: 'slate' | 'blue' | 'green' | 'teal' | 'red' }> = {
  borrador: { label: 'Borrador', variant: 'slate' },
  solicitado: { label: 'Solicitado', variant: 'blue' },
  aprobado: { label: 'Aprobado', variant: 'green' },
  recibido: { label: 'Recibido', variant: 'teal' },
  cancelado: { label: 'Cancelado', variant: 'red' },
}
const TIPO_GAS: Record<string, string> = {
  oxigeno: 'Oxígeno', co2: 'CO₂', oxido_nitroso: 'N₂O', aire_medicinal: 'Aire medicinal', nitrogeno: 'N₂', mezcla: 'Mezcla',
}
const AREA: Record<string, string> = { enfermeria: 'Enfermería', quirofano: 'Quirófano' }
const TIPO_MEDIACION: Record<string, string> = {
  laboral: 'Conflicto laboral', interpersonal: 'Conflicto interpersonal', disciplinario: 'Disciplinario',
  reclamo: 'Reclamo', evento_adverso: 'Evento adverso', disconformidad: 'Disconformidad', otro: 'Otro',
}

// ── Helpers ─────────────────────────────────────────────────────────────
// Fecha local en formato YYYY-MM-DD (toISOString usa UTC y de noche adelanta un día)
function fechaLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function diasHasta(fecha: string) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((new Date(fecha + 'T00:00:00').getTime() - hoy.getTime()) / 86400000)
}
const fechaCorta = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

// ── Página ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [fallas, setFallas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const hoy = fechaLocal(new Date())
    const en7 = fechaLocal(new Date(Date.now() + 7 * 86400000))

    const consultas = await Promise.all([
      supabase.from('empleados').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
      supabase.from('licencias').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('licencias').select('*', { count: 'exact', head: true }).eq('estado', 'aprobada').lte('fecha_inicio', hoy).gte('fecha_fin', hoy),
      supabase.from('pedidos_insumos').select('*', { count: 'exact', head: true }).eq('estado', 'solicitado'),
      supabase.from('v_certificaciones_por_vencer').select('*', { count: 'exact', head: true }),
      supabase.from('mediaciones').select('*', { count: 'exact', head: true }).eq('estado', 'abierto'),
      supabase.from('insumos').select('id, nombre, area, stock_actual, stock_minimo').eq('estado', 'activo').order('nombre'),
      supabase.from('v_tubos_por_vencer').select('numero_serie, tipo_gas, fecha_vencimiento, dias_restantes').order('dias_restantes').limit(6),
      supabase.from('licencias').select('id, tipo_licencia, fecha_fin, empleados(nombre, apellido)').eq('estado', 'aprobada').gte('fecha_fin', hoy).lte('fecha_fin', en7).order('fecha_fin').limit(8),
      supabase.from('pedidos_insumos').select('id, numero, estado, created_at, proveedores(razon_social)').order('created_at', { ascending: false }).limit(6),
      supabase.from('mediaciones').select('id, tipo_conflicto, origen, fecha, empleados(nombre, apellido)').eq('estado', 'abierto').order('fecha', { ascending: false }).limit(5),
    ])
    const nombres = ['empleados', 'licencias por aprobar', 'licencias de hoy', 'pedidos por aprobar', 'certificaciones', 'mediaciones', 'insumos', 'tubos', 'licencias por terminar', 'pedidos recientes', 'mediaciones abiertas']
    setFallas(consultas.map((c, i) => (c.error ? nombres[i] : '')).filter(Boolean))

    const [emp, licPend, licHoy, pedPend, certif, medCount, insumos, tubos, licencias, pedidos, mediaciones] = consultas
    const lista = (insumos.data ?? []) as InsumoRow[]
    setDatos({
      empleados: emp.count ?? 0,
      licenciasPorAprobar: licPend.count ?? 0,
      deLicenciaHoy: licHoy.count ?? 0,
      pedidosPorAprobar: pedPend.count ?? 0,
      certifPorVencer: certif.count ?? 0,
      mediacionesAbiertas: medCount.count ?? 0,
      sinStock: lista.filter(i => i.stock_actual <= 0),
      stockBajo: lista.filter(i => i.stock_actual > 0 && i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo),
      tubos: (tubos.data ?? []) as unknown as TuboRow[],
      licencias: (licencias.data ?? []) as unknown as LicenciaRow[],
      pedidos: (pedidos.data ?? []) as unknown as PedidoRow[],
      mediaciones: (mediaciones.data ?? []) as unknown as MediacionRow[],
    })
    setLoading(false)
  }

  if (loading || !datos) {
    return <Page><div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}><Spinner size={32} /></div></Page>
  }

  // Solo admin entra a las pantallas de insumos; RRHH ve los números sin enlace
  const puedeInsumos = usuario?.rol === 'admin'
  const ir = (ruta: string, permitido = true) => (permitido ? () => navigate(ruta) : undefined)
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  const hoyTexto = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const criticos = datos.sinStock.length + datos.stockBajo.length

  return (
    <Page>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '4px' }}>{hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)}</p>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--accent)', lineHeight: 1.2 }}>{saludo}, {usuario?.nombre}</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '4px' }}>Lo que necesita atención hoy</p>
      </div>

      {fallas.length > 0 && (
        <Card style={{ padding: '10px 16px', marginBottom: '16px', background: 'var(--amber-50)' }}>
          <p style={{ fontSize: '12px', color: 'var(--amber-600)' }}>No se pudieron cargar algunos datos ({fallas.join(', ')}). Los números de esas secciones pueden figurar en cero.</p>
        </Card>
      )}

      {/* Indicadores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <Indicador label="Empleados activos" valor={datos.empleados} color="var(--accent)" onClick={ir('/rrhh/empleados')} />
        <Indicador label="Licencias por aprobar" valor={datos.licenciasPorAprobar} color={datos.licenciasPorAprobar ? 'var(--amber-600)' : 'var(--accent)'} ayuda={`${datos.deLicenciaHoy} de licencia hoy`} onClick={ir('/rrhh/licencias')} />
        <Indicador label="Insumos críticos" valor={criticos} color={datos.sinStock.length ? 'var(--red-600)' : criticos ? 'var(--amber-600)' : 'var(--accent)'} ayuda={criticos ? `${datos.sinStock.length} sin stock · ${datos.stockBajo.length} bajo mínimo` : 'Todo en orden'} onClick={ir('/insumos/alertas', puedeInsumos)} />
        <Indicador label="Pedidos por aprobar" valor={datos.pedidosPorAprobar} color={datos.pedidosPorAprobar ? 'var(--amber-600)' : 'var(--accent)'} onClick={ir('/insumos/pedidos', puedeInsumos)} />
        <Indicador label="Tubos por vencer" valor={datos.tubos.length} color={datos.tubos.length ? 'var(--amber-600)' : 'var(--accent)'} ayuda="Próximos 60 días" onClick={ir('/insumos/gases', puedeInsumos)} />
        <Indicador label="Certif. por vencer" valor={datos.certifPorVencer} color={datos.certifPorVencer ? 'var(--amber-600)' : 'var(--accent)'} ayuda="Próximos 90 días" onClick={ir('/rrhh/capacitaciones')} />
        <Indicador label="Mediaciones abiertas" valor={datos.mediacionesAbiertas} color={datos.mediacionesAbiertas ? 'var(--red-600)' : 'var(--accent)'} onClick={ir('/rrhh/mediaciones')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <Seccion titulo="Sin stock" total={datos.sinStock.length} critico vacio="Ningún insumo sin stock" onVer={ir('/insumos/alertas', puedeInsumos)}>
          {datos.sinStock.map(i => (
            <Fila key={i.id} titulo={i.nombre} detalle={i.area ? AREA[i.area] ?? i.area : ''}><Badge variant="red">Sin stock</Badge></Fila>
          ))}
        </Seccion>

        <Seccion titulo="Stock bajo el mínimo" total={datos.stockBajo.length} vacio="Todo el stock está sobre el mínimo" onVer={ir('/insumos/alertas', puedeInsumos)}>
          {datos.stockBajo.map(i => (
            <Fila key={i.id} titulo={i.nombre} detalle={i.area ? AREA[i.area] ?? i.area : ''}><Badge variant="amber">{i.stock_actual} de {i.stock_minimo}</Badge></Fila>
          ))}
        </Seccion>

        <Seccion titulo="Licencias que terminan esta semana" total={datos.licencias.length} vacio="Nadie vuelve de licencia en los próximos 7 días" onVer={ir('/rrhh/licencias')}>
          {datos.licencias.map(l => {
            const dias = diasHasta(l.fecha_fin)
            return (
              <Fila key={l.id} titulo={l.empleados ? `${l.empleados.apellido}, ${l.empleados.nombre}` : 'Sin empleado'} detalle={`${TIPO_LICENCIA[l.tipo_licencia] ?? l.tipo_licencia} · hasta el ${fechaCorta(l.fecha_fin)}`}>
                <Badge variant={dias <= 1 ? 'amber' : 'slate'}>{dias <= 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`}</Badge>
              </Fila>
            )
          })}
        </Seccion>

        <Seccion titulo="Tubos próximos a vencer" total={datos.tubos.length} vacio="Sin tubos por vencer en 60 días" onVer={ir('/insumos/gases', puedeInsumos)}>
          {datos.tubos.map(t => (
            <Fila key={t.numero_serie} titulo={t.numero_serie} detalle={TIPO_GAS[t.tipo_gas] ?? t.tipo_gas}>
              <Badge variant={t.dias_restantes <= 15 ? 'red' : 'amber'}>{t.dias_restantes} días</Badge>
            </Fila>
          ))}
        </Seccion>

        <Seccion titulo="Pedidos recientes" total={datos.pedidos.length} vacio="Todavía no hay pedidos" onVer={ir('/insumos/pedidos', puedeInsumos)}>
          {datos.pedidos.map(p => {
            const e = ESTADO_PEDIDO[p.estado] ?? { label: p.estado, variant: 'slate' as const }
            return (
              <Fila key={p.id} titulo={p.numero} detalle={`${p.proveedores?.razon_social ?? 'Sin proveedor'} · ${fechaCorta(p.created_at)}`}>
                <Badge variant={e.variant}>{e.label}</Badge>
              </Fila>
            )
          })}
        </Seccion>

        <Seccion titulo="Mediaciones abiertas" total={datos.mediacionesAbiertas} critico vacio="No hay mediaciones abiertas" onVer={ir('/rrhh/mediaciones')}>
          {datos.mediaciones.map(m => (
            <Fila key={m.id} titulo={TIPO_MEDIACION[m.tipo_conflicto] ?? m.tipo_conflicto} detalle={`${m.empleados ? `${m.empleados.apellido}, ${m.empleados.nombre}` : 'Sin empleado'} · ${fechaCorta(m.fecha)}`} />
          ))}
        </Seccion>
      </div>

      <EncuestasDashboardCard />
    </Page>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────
function Indicador({ label, valor, color, ayuda, onClick }: { label: string; valor: number; color: string; ayuda?: string; onClick?: () => void }) {
  return (
    <Card style={{ padding: '16px 20px', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>{label.toUpperCase()}</p>
      <p style={{ fontSize: '28px', fontWeight: 700, color, lineHeight: 1.1 }}>{valor}</p>
      {ayuda && <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>{ayuda}</p>}
    </Card>
  )
}

function Seccion({ titulo, total, critico, vacio, onVer, children }: {
  titulo: string; total: number; critico?: boolean; vacio: string; onVer?: () => void; children: React.ReactNode
}) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ fontWeight: 600, fontSize: '14px' }}>{titulo}</h3>
          {total > 0 && <Badge variant={critico ? 'red' : 'slate'}>{total}</Badge>}
        </div>
        {onVer && <button onClick={onVer} style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>Ver todo →</button>}
      </div>
      {total === 0 ? (
        <p style={{ padding: '20px', color: 'var(--text-3)', fontSize: '13px' }}>{vacio}</p>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>{children}</div>
      )}
    </Card>
  )
}

function Fila({ titulo, detalle, children }: { titulo: string; detalle?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</p>
        {detalle && <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{detalle}</p>}
      </div>
      {children}
    </div>
  )
}
