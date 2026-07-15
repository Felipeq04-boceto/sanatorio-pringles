import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Modal, Input, Select, Spinner, Textarea } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const TIPO_LICENCIA: Record<string, string> = {
  vacaciones: 'Vacaciones', enfermedad: 'Enfermedad', maternidad: 'Maternidad',
  paternidad: 'Paternidad', estudio: 'Estudio', duelo: 'Duelo',
  sin_goce: 'Sin goce de sueldo', otra: 'Otra',
}

const TIPO_MEDIACION: Record<string, string> = {
  laboral: 'Conflicto laboral',
  interpersonal: 'Conflicto interpersonal',
  disciplinario: 'Disciplinario',
  reclamo: 'Reclamo',
  evento_adverso: 'Evento adverso',
  disconformidad: 'Disconformidad',
  otro: 'Otro',
}

const ESTADO_MED_BADGE: Record<string, any> = {
  abierto: 'amber', en_proceso: 'blue', cerrado: 'green', derivado: 'slate',
}
const ESTADO_MED_LABEL: Record<string, string> = {
  abierto: 'Abierto', en_proceso: 'En proceso', cerrado: 'Cerrado', derivado: 'Derivado',
}

export function EmpleadoPortalPage() {
  const { usuario } = useAuth()
  const [empleado,    setEmpleado]    = useState<any>(null)
  const [marcaciones, setMarcaciones] = useState<any[]>([])
  const [turnos,      setTurnos]      = useState<any[]>([])
  const [licencias,   setLicencias]   = useState<any[]>([])
  const [mediaciones, setMediaciones] = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [marcando,    setMarcando]    = useState(false)
  const [openLic,     setOpenLic]     = useState(false)
  const [licForm,     setLicForm]     = useState<any>({})
  const [savingLic,   setSavingLic]   = useState(false)
  const [geoStatus,   setGeoStatus]   = useState<'idle'|'ok'|'fuera'|'error'>('idle')
  const [config,      setConfig]      = useState<any>({})

  // Mediaciones
  const [openNuevaMed,  setOpenNuevaMed]  = useState(false)
  const [medForm,       setMedForm]       = useState<any>({})
  const [savingMed,     setSavingMed]     = useState(false)
  const [errorMed,      setErrorMed]      = useState<string|null>(null)
  const [detalleMed,    setDetalleMed]    = useState<any>(null)
  const [seccionActiva, setSeccionActiva] = useState<'inicio'|'mediaciones'|'turnos'|'gases'|'stock'|'prestaciones'>(
    usuario?.rol === 'referente_enfermeria' || usuario?.rol === 'referente_instrumentadores' ? 'gases' : 'inicio'
  )
  const [openCambiarPass, setOpenCambiarPass] = useState(false)
  const [passForm, setPassForm] = useState<any>({})
  const [savingPass, setSavingPass] = useState(false)
  const [errorPass, setErrorPass] = useState<string|null>(null)
  const [turnosGeneral, setTurnosGeneral] = useState<any[]>([])
  const [tubos, setTubos] = useState<any[]>([])
  const [stockInsumos, setStockInsumos] = useState<any[]>([])
  const [openMovStock, setOpenMovStock] = useState(false)
  const [insumoActivo, setInsumoActivo] = useState<any>(null)
  const [movStockForm, setMovStockForm] = useState<any>({ tipo_movimiento: 'salida', cantidad: '' })
  const [savingMovStock, setSavingMovStock] = useState(false)
  const [openNuevoInsumo, setOpenNuevoInsumo] = useState(false)
  const [nuevoInsumoForm, setNuevoInsumoForm] = useState<any>({})
  const [savingNuevoInsumo, setSavingNuevoInsumo] = useState(false)
  const [openMovTubo, setOpenMovTubo] = useState(false)
  const [tuboActivo, setTuboActivo] = useState<any>(null)
  const [movTuboForm, setMovTuboForm] = useState<any>({})
  const [savingMovTubo, setSavingMovTubo] = useState(false)
  const [openNuevoTubo, setOpenNuevoTubo] = useState(false)
  const [nuevoTuboForm, setNuevoTuboForm] = useState<any>({})
  const [savingNuevoTubo, setSavingNuevoTubo] = useState(false)
  const [empleadosTodos, setEmpleadosTodos] = useState<any[]>([])
  const [mesPortal, setMesPortal] = useState(() => new Date().toISOString().substring(0, 7))
  const [tabSector, setTabSector] = useState('internacion')

  useEffect(() => { if (usuario) loadAll() }, [usuario])

  async function cambiarMiPassword() {
    setErrorPass(null)
    if (!passForm.actual) { setErrorPass('Ingresá tu contraseña actual'); return }
    if (!passForm.nueva || passForm.nueva.length < 6) { setErrorPass('La nueva contraseña debe tener al menos 6 caracteres'); return }
    if (passForm.nueva !== passForm.confirmar) { setErrorPass('Las contraseñas no coinciden'); return }
    setSavingPass(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passForm.nueva })
      if (error) { setErrorPass(`Error: ${error.message}`); return }
      setOpenCambiarPass(false)
      setPassForm({})
      alert('✅ Contraseña actualizada correctamente')
    } finally { setSavingPass(false) }
  }

  useEffect(() => {
    if (!mesPortal) return
    const inicioMes = mesPortal + '-01'
    const [y, m] = mesPortal.split('-').map(Number)
    const finMes = new Date(y, m, 0).toISOString().split('T')[0]
    supabase.from('turnos').select('empleado_id, fecha, tipo_turno, estado')
      .gte('fecha', inicioMes).lte('fecha', finMes)
      .then(({ data }) => setTurnosGeneral(data ?? []))
  }, [mesPortal])

  async function loadAll() {
    setLoading(true)

    const { data: cfg } = await supabase.from('configuracion').select('*')
    const cfgMap = (cfg ?? []).reduce((acc: any, c: any) => { acc[c.clave] = c.valor; return acc }, {})
    setConfig(cfgMap)

    const { data: emp } = await supabase
      .from('empleados').select('*').eq('usuario_id', usuario!.id).single()
    setEmpleado(emp)

    if (!emp) {
      // Rol insumos puede operar sin legajo de empleado
      if (usuario?.rol === 'referente_enfermeria' || usuario?.rol === 'referente_instrumentadores') {
        const [{ data: tubosData }, { data: stockData }] = await Promise.all([
          supabase.from('tubos_gas').select('*, proveedores(razon_social), insumos(nombre)').order('numero_serie'),
          supabase.from('insumos').select('*, categorias_insumo(nombre)').eq('estado', 'activo').order('nombre'),
        ])
        setTubos(tubosData ?? [])
        setStockInsumos(stockData ?? [])
      }
      setLoading(false)
      return
    }

    const hoy = new Date().toISOString().split('T')[0]
    const inicioMes = hoy.substring(0, 7) + '-01'

    const [{ data: marc }, { data: turn }, { data: lic }, { data: med }] = await Promise.all([
      supabase.from('marcaciones').select('*').eq('empleado_id', emp.id)
        .gte('fecha', inicioMes).order('hora', { ascending: false }),
      supabase.from('turnos').select('*').eq('empleado_id', emp.id)
        .gte('fecha', hoy).lte('fecha', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0])
        .order('fecha'),
      supabase.from('licencias').select('*').eq('empleado_id', emp.id)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('mediaciones').select('*').eq('empleado_id', emp.id)
        .order('created_at', { ascending: false }),
    ])
    setMarcaciones(marc ?? [])
    setTurnos(turn ?? [])
    setLicencias(lic ?? [])
    setMediaciones(med ?? [])

    // Cargar todos los empleados para la vista de turnos
    const { data: empTodos } = await supabase.from('empleados')
      .select('id, nombre, apellido, legajo, sectores(nombre)')
      .eq('estado', 'activo').order('apellido')
    setEmpleadosTodos(empTodos ?? [])

    // Cargar tubos de gas
    const { data: tubosData } = await supabase.from('tubos_gas')
      .select('*, proveedores(razon_social), insumos(nombre)')
      .order('numero_serie')
    setTubos(tubosData ?? [])

    // Stock para rol insumos
    const { data: stockData } = await supabase.from('insumos')
      .select('*, categorias_insumo(nombre)').eq('estado', 'activo').order('nombre')
    setStockInsumos(stockData ?? [])
    setLoading(false)
  }

  function calcDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  async function marcarAsistencia(tipo: 'entrada' | 'salida') {
    if (!empleado) return
    setMarcando(true)
    setGeoStatus('idle')
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      )
      const lat = pos.coords.latitude
      const lon = pos.coords.longitude
      const precision = pos.coords.accuracy
      const sanLat = parseFloat(config.geo_latitud ?? '-37.9925')
      const sanLon = parseFloat(config.geo_longitud ?? '-61.3667')
      const radio  = parseFloat(config.geo_radio_metros ?? '150')
      const distancia = calcDistancia(lat, lon, sanLat, sanLon)
      const dentroDelArea = distancia <= radio
      setGeoStatus(dentroDelArea ? 'ok' : 'fuera')
      const ahora = new Date()
      const horaLocal = ahora.toTimeString().substring(0, 8)
      const hoy = ahora.toISOString().split('T')[0]
      await supabase.from('marcaciones').insert({
        empleado_id: empleado.id, tipo, fecha: hoy, hora: ahora.toISOString(),
        latitud: lat, longitud: lon, precision_metros: precision,
        dentro_del_area: dentroDelArea, distancia_metros: Math.round(distancia),
        dispositivo: navigator.userAgent.includes('Mobile') ? 'móvil' : 'escritorio',
      })
      // Recargar marcaciones directamente
      const inicioMes = hoy.substring(0, 7) + '-01'
      const { data: marcNuevas } = await supabase.from('marcaciones').select('*')
        .eq('empleado_id', empleado.id).gte('fecha', inicioMes).order('hora', { ascending: false })
      setMarcaciones(marcNuevas ?? [])
      const { data: turnoHoy } = await supabase.from('turnos').select('id')
        .eq('empleado_id', empleado.id).eq('fecha', hoy).single()
      if (turnoHoy) {
        const upd: any = { estado: 'presente' }
        if (tipo === 'entrada') upd.hora_entrada_real = horaLocal
        else upd.hora_salida_real = horaLocal
        await supabase.from('turnos').update(upd).eq('id', turnoHoy.id)
      }
      await loadAll()
    } catch (err: any) {
      setGeoStatus('error')
      if (err.code === 1) alert('Necesitás permitir el acceso a la ubicación para marcar asistencia.')
      else alert('Error al obtener la ubicación. Intentá de nuevo.')
    } finally { setMarcando(false) }
  }

  async function solicitarLicencia() {
    if (!empleado || !licForm.tipo_licencia || !licForm.fecha_inicio || !licForm.fecha_fin) return
    setSavingLic(true)
    try {
      await supabase.from('licencias').insert({
        empleado_id: empleado.id, tipo_licencia: licForm.tipo_licencia,
        fecha_inicio: licForm.fecha_inicio, fecha_fin: licForm.fecha_fin,
        motivo: licForm.motivo, estado: 'pendiente',
      })
      setOpenLic(false); setLicForm({}); loadAll()
    } finally { setSavingLic(false) }
  }

  async function iniciarMediacion() {
    setErrorMed(null)
    if (!empleado) return
    if (!medForm.tipo_conflicto) { setErrorMed('Seleccioná el tipo de caso'); return }
    if (!medForm.descripcion || medForm.descripcion.trim().length < 20) {
      setErrorMed('Describí el caso con más detalle (mínimo 20 caracteres)'); return
    }
    setSavingMed(true)
    try {
      const { error } = await supabase.from('mediaciones').insert({
        empleado_id: empleado.id,
        tipo_conflicto: medForm.tipo_conflicto,
        descripcion: medForm.descripcion,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'abierto',
        confidencial: true,
        origen: 'portal_empleado',
      })
      if (error) { setErrorMed(`Error al enviar: ${error.message}`); return }
      setOpenNuevaMed(false)
      setMedForm({})
      loadAll()
    } finally { setSavingMed(false) }
  }

  const hoy = new Date().toISOString().split('T')[0]
  const marcHoy = marcaciones.filter(m => m.fecha === hoy)
  const entradaHoy = marcHoy.find(m => m.tipo === 'entrada')
  const salidaHoy  = marcHoy.find(m => m.tipo === 'salida')

  if (loading) return (
    <Page><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Spinner size={36} /></div></Page>
  )

  const esRolInsumos = usuario?.rol === 'referente_enfermeria' || usuario?.rol === 'referente_instrumentadores'
  const puedeVerPrestaciones = ['administrativo','enfermeria','instrumentadora','referente_enfermeria','referente_instrumentadores','rrhh','admin'].includes(usuario?.rol ?? '')
  const puedeEditarTurnos = ['referente_empleado','referente_enfermeria','referente_instrumentadores','rrhh','admin'].includes(usuario?.rol ?? '')
  const puedeVerGasesStock = ['referente_enfermeria','referente_instrumentadores','admin'].includes(usuario?.rol ?? '')

  const puedeOperarSinLegajo = esRolInsumos
  if (!empleado && !puedeOperarSinLegajo) return (
    <Page>
      <Card style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '20px', marginBottom: '12px' }}>⚠️</p>
        <p style={{ fontWeight: 600, marginBottom: '8px' }}>Tu cuenta no está vinculada a un legajo</p>
        <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Contactá al área de RRHH para vincular tu usuario al sistema.</p>
      </Card>
    </Page>
  )

  const nombrePortal = empleado
    ? `${empleado.nombre} ${empleado.apellido}`
    : (usuario?.email?.split('@')[0] ?? 'Usuario')
  const subtituloPortal = empleado
    ? `Legajo ${empleado.legajo} · ${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}`
    : `Insumos · ${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}`

  return (
    <Page>
      <PageHeader
        title={`Hola, ${nombrePortal}`}
        subtitle={subtituloPortal}
      />

      {/* Botón cambiar contraseña */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <Button variant="secondary" size="sm" onClick={() => { setPassForm({}); setErrorPass(null); setOpenCambiarPass(true) }}>
          🔒 Cambiar contraseña
        </Button>
      </div>

      {/* Tabs de navegación */}
      <div style={{ overflowX: 'auto', marginBottom: '20px', borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '4px', minWidth: 'max-content' }}>
        {[
          { key: 'inicio', label: '🏠 Inicio' },
          { key: 'turnos', label: '📅 Turnos' },
          ...(puedeVerPrestaciones ? [{ key: 'prestaciones', label: '💰 Prestaciones' }] : []),
          { key: 'mediaciones', label: `⚖️ Mediaciones${mediaciones.length > 0 ? ` (${mediaciones.length})` : ''}` },
          ...(puedeVerGasesStock ? [{ key: 'gases', label: '🫁 Gases medicinales' }] : []),
          ...(puedeVerGasesStock ? [{ key: 'stock', label: '📦 Stock e Insumos' }] : []),
        ].map(tab => (
          <button key={tab.key} onClick={() => setSeccionActiva(tab.key as any)}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: seccionActiva === tab.key ? 700 : 400,
              color: seccionActiva === tab.key ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: seccionActiva === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-2px', fontSize: '13px',
            }}>
            {tab.label}
          </button>
        ))}
        </div>
      </div>

      {/* ── SECCIÓN INICIO ── */}
      {seccionActiva === 'inicio' && (
        <>
          {/* Marcación */}
          <Card style={{ padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '15px', marginBottom: '16px' }}>📍 Marcación de asistencia</h3>
            {geoStatus === 'fuera' && (
              <div style={{ background: 'var(--amber-50)', border: '1px solid #fcd34d', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--amber-600)', fontWeight: 500 }}>⚠️ Estás fuera del área del sanatorio. La marcación se registró pero quedará pendiente de validación.</p>
              </div>
            )}
            {geoStatus === 'ok' && (
              <div style={{ background: 'var(--green-50)', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--green-600)', fontWeight: 500 }}>✅ Marcación registrada y turno actualizado automáticamente.</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>ENTRADA HOY</p>
                {entradaHoy ? (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '20px', fontFamily: 'var(--font-mono)', color: 'var(--green-600)' }}>
                      {new Date(entradaHoy.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <Badge variant={entradaHoy.dentro_del_area ? 'green' : 'amber'}>
                      {entradaHoy.dentro_del_area ? '✓ En sanatorio' : `${Math.round(entradaHoy.distancia_metros)}m del sanatorio`}
                    </Badge>
                  </div>
                ) : <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>Sin registrar</p>}
              </div>
              <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>SALIDA HOY</p>
                {salidaHoy ? (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '20px', fontFamily: 'var(--font-mono)', color: 'var(--red-600)' }}>
                      {new Date(salidaHoy.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <Badge variant={salidaHoy.dentro_del_area ? 'green' : 'amber'}>
                      {salidaHoy.dentro_del_area ? '✓ En sanatorio' : `${Math.round(salidaHoy.distancia_metros)}m del sanatorio`}
                    </Badge>
                  </div>
                ) : <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>Sin registrar</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button style={{ flex: 1, justifyContent: 'center', background: entradaHoy ? 'var(--green-500)' : 'var(--green-600)', fontSize: '15px', padding: '12px' }}
                onClick={() => marcarAsistencia('entrada')} loading={marcando} disabled={!!entradaHoy}>
                {entradaHoy ? '✓ Entrada registrada' : '🟢 Marcar entrada'}
              </Button>
              <Button style={{ flex: 1, justifyContent: 'center', background: salidaHoy ? 'var(--red-500)' : 'var(--red-600)', fontSize: '15px', padding: '12px' }}
                onClick={() => marcarAsistencia('salida')} loading={marcando} disabled={!entradaHoy || !!salidaHoy}>
                {salidaHoy ? '✓ Salida registrada' : '🔴 Marcar salida'}
              </Button>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Próximos turnos */}
            <Card>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontWeight: 600, fontSize: '14px' }}>🗓️ Próximos turnos</h3>
              </div>
              {turnos.length === 0 ? (
                <p style={{ padding: '20px', color: 'var(--text-3)', fontSize: '13px' }}>Sin turnos programados</p>
              ) : (
                <div>
                  {turnos.slice(0, 5).map((t: any) => (
                    <div key={t.id} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '13px' }}>
                          {new Date(t.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                          {t.hora_entrada_programada ? `${t.hora_entrada_programada} — ${t.hora_salida_programada}` : t.tipo_turno}
                        </p>
                        {t.hora_entrada_real && (
                          <p style={{ fontSize: '11px', color: 'var(--green-600)', marginTop: '2px' }}>
                            ✓ Entrada: {t.hora_entrada_real.substring(0,5)} {t.hora_salida_real ? `· Salida: ${t.hora_salida_real.substring(0,5)}` : ''}
                          </p>
                        )}
                      </div>
                      <Badge variant={t.estado === 'presente' ? 'green' : t.estado === 'ausente' ? 'red' : 'slate'}>{t.estado}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Licencias */}
            <Card>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontWeight: 600, fontSize: '14px' }}>🌴 Mis licencias</h3>
                <Button size="sm" onClick={() => { setLicForm({ fecha_inicio: hoy, fecha_fin: hoy }); setOpenLic(true) }}>+ Solicitar</Button>
              </div>
              {licencias.length === 0 ? (
                <p style={{ padding: '20px', color: 'var(--text-3)', fontSize: '13px' }}>Sin licencias registradas</p>
              ) : (
                <div>
                  {licencias.slice(0, 5).map((l: any) => (
                    <div key={l.id} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '13px' }}>{TIPO_LICENCIA[l.tipo_licencia]}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                          {new Date(l.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR')} — {new Date(l.fecha_fin + 'T12:00:00').toLocaleDateString('es-AR')}
                        </p>
                      </div>
                      <Badge variant={l.estado === 'aprobada' ? 'green' : l.estado === 'rechazada' ? 'red' : 'amber'}>{l.estado}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Historial marcaciones */}
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontWeight: 600, fontSize: '14px' }}>📋 Marcaciones del mes</h3>
            </div>
            {marcaciones.length === 0 ? (
              <p style={{ padding: '20px', color: 'var(--text-3)', fontSize: '13px' }}>Sin marcaciones este mes</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Fecha','Tipo','Hora','Distancia','Estado'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', background: 'var(--slate-50)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {marcaciones.map((m: any) => (
                      <tr key={m.id}>
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                          {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                          <Badge variant={m.tipo === 'entrada' ? 'green' : 'red'}>{m.tipo}</Badge>
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                          {new Date(m.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-2)' }}>
                          {m.distancia_metros != null ? `${Math.round(m.distancia_metros)}m` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                          {m.dentro_del_area != null
                            ? <Badge variant={m.dentro_del_area ? 'green' : 'amber'}>{m.dentro_del_area ? '✓ Válida' : 'Fuera de área'}</Badge>
                            : <Badge variant="slate">Sin geo</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── SECCIÓN MEDIACIONES ── */}
      {seccionActiva === 'turnos' && (() => {
        const [y, m] = mesPortal.split('-').map(Number)
        const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
        const totalDias = new Date(y, m, 0).getDate()
        const dias = Array.from({ length: totalDias }, (_, i) => `${mesPortal}-${String(i + 1).padStart(2, '0')}`)
        const TURNOS_LABEL: Record<string, string> = {
          manana: 'M', tarde: 'T', noche: 'N', franco: 'F',
          adm_manana: 'M', adm_tarde1: 'T', adm_tarde2: 'T', adm_partido: 'P',
        }
        const TURNOS_COLOR: Record<string, string> = {
          manana: '#0D9488', tarde: '#D97706', noche: '#4F46E5', franco: '#6B7280',
          adm_manana: '#0D9488', adm_tarde1: '#D97706', adm_tarde2: '#EA580C', adm_partido: '#7C3AED',
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Nav mes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button onClick={() => { const d = new Date(y, m-2, 1); setMesPortal(d.toISOString().substring(0,7)) }}
                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer' }}>◀</button>
              <span style={{ fontWeight: 700, fontSize: '15px', minWidth: 160, textAlign: 'center' }}>{MESES[m-1]} {y}</span>
              <button onClick={() => { const d = new Date(y, m, 1); setMesPortal(d.toISOString().substring(0,7)) }}
                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer' }}>▶</button>
            </div>

            {/* Tabs de sectores */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border)', marginBottom: '16px' }}>
              {[
                { key: 'internacion', label: 'Internación',     sectores: ['Internación'] },
                { key: 'quirofano',   label: 'Quirófano',        sectores: ['Quirófano','Quirófano 1','Quirófano 2','Sala de partos','Recepción del recién nacido'] },
                { key: 'servicios',   label: 'Serv. Generales',  sectores: ['Limpieza','Cocina','Lavadero'] },
                { key: 'admin',       label: 'Administración',   sectores: ['Administración'] },
                { key: 'imagenes',    label: 'Imágenes',         sectores: ['Imágenes'] },
              ].map(tab => (
                <button key={tab.key} onClick={() => setTabSector(tab.key)}
                  style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
                    fontWeight: tabSector === tab.key ? 700 : 400,
                    color: tabSector === tab.key ? 'var(--accent)' : 'var(--text-2)',
                    borderBottom: tabSector === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: '-2px', fontSize: '12px' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {(() => {
              const TABS_SECTORES: Record<string, string[]> = {
                internacion: ['Internación'],
                quirofano:   ['Quirófano','Quirófano 1','Quirófano 2','Sala de partos','Recepción del recién nacido'],
                servicios:   ['Limpieza','Cocina','Lavadero'],
                admin:       ['Administración'],
                imagenes:    ['Imágenes'],
              }
              const sectoresActivos = TABS_SECTORES[tabSector] ?? []
              const empsFiltrados = empleadosTodos.filter((emp: any) => sectoresActivos.includes((emp.sectores as any)?.nombre))
              return (
            <Card style={{ overflow: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--slate-50)', zIndex: 2, padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: 140, fontWeight: 700 }}>Empleado</th>
                    {dias.map(fecha => {
                      const dow = new Date(fecha + 'T12:00:00').getDay()
                      const esFind = dow === 0 || dow === 6
                      const esHoy = fecha === new Date().toISOString().split('T')[0]
                      return (
                        <th key={fecha} style={{ padding: '4px 2px', textAlign: 'center', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: 28,
                          background: esHoy ? '#335955' : esFind ? 'var(--slate-100)' : 'var(--slate-50)',
                          color: esHoy ? '#fff' : esFind ? 'var(--text-3)' : 'var(--text-2)', fontWeight: esHoy ? 700 : 600 }}>
                          <div style={{ fontSize: '9px' }}>{'DLMXJVS'[dow]}</div>
                          <div>{parseInt(fecha.split('-')[2])}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {empsFiltrados.map((emp: any, ei: number) => {
                    // Fetch turnos for this employee in this month from turnosGeneral
                    return (
                      <tr key={emp.id} style={{ background: ei % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                        <td style={{ position: 'sticky', left: 0, zIndex: 1, background: ei % 2 === 0 ? 'white' : 'var(--slate-50)',
                          padding: '4px 12px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          <p style={{ fontWeight: emp.id === empleado?.id ? 700 : 400, fontSize: '11px', color: emp.id === empleado?.id ? 'var(--accent)' : 'var(--text)' }}>
                            {emp.apellido}, {emp.nombre}
                          </p>
                          <p style={{ fontSize: '9px', color: 'var(--text-3)' }}>{(emp.sectores as any)?.nombre}</p>
                        </td>
                        {dias.map(fecha => {
                          const turno = turnosGeneral.find((t: any) => t.empleado_id === emp.id && t.fecha === fecha)
                          const color = turno ? (TURNOS_COLOR[turno.tipo_turno] ?? '#6B7280') : null
                          const label = turno ? (TURNOS_LABEL[turno.tipo_turno] ?? '?') : null
                          const dow = new Date(fecha + 'T12:00:00').getDay()
                          const esFind = dow === 0 || dow === 6
                          return (
                            <td key={fecha} style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                              background: turno ? color + '25' : esFind ? 'var(--slate-100)' : 'transparent' }}>
                              {turno && (
                                <span style={{ display: 'inline-block', width: 22, height: 18, lineHeight: '18px', borderRadius: '3px',
                                  background: color!, color: '#fff', fontSize: '9px', fontWeight: 700 }}>
                                  {label}
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
              )
            })()}

            {/* Leyenda */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {[['#0D9488','M - Mañana'],['#D97706','T - Tarde'],['#4F46E5','N - Noche'],['#7C3AED','P - Partido'],['#6B7280','F - Franco']].map(([c,l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '2px', background: c, display: 'inline-block' }} />{l}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {seccionActiva === 'gases' && (() => {
        const ESTADOS_GAS: Record<string, { label: string; color: string }> = {
          lleno:       { label: 'Lleno',         color: '#0D9488' },
          en_uso:      { label: 'En uso',         color: '#16A34A' },
          en_traslado: { label: 'En traslado',    color: '#D97706' },
          vacio:       { label: 'Vacío',          color: '#6B7280' },
          devuelto:    { label: 'Devuelto',       color: '#0891B2' },
          baja:        { label: 'Baja',           color: '#DC2626' },
          disponible:  { label: 'Disponible',     color: '#059669' },
        }
        const GAS_LABEL: Record<string, string> = {
          oxigeno: 'Oxígeno (O₂)', co2: 'CO₂', oxido_nitroso: 'N₂O',
          aire_medicinal: 'Aire medicinal', nitrogeno: 'N₂', mezcla: 'Mezcla'
        }
        const SECTORES_MOV = ['Depósito central','Internación','Quirófano','Quirófano 1','Quirófano 2','Sala de partos','Recepción del recién nacido','Guardia','Farmacia','Laboratorio','Imágenes']
        const puedeMovEmp = empleado && ['Internación','Quirófano','Quirófano 1','Quirófano 2'].includes(empleado.sector_nombre ?? '')
        const puedeMovInsumos = ['referente_enfermeria','referente_instrumentadores','admin'].includes(usuario?.rol ?? '')
        const puedeMov = puedeMovEmp || puedeMovInsumos

        async function guardarMovTubo() {
          if (!tuboActivo || !movTuboForm.estado_nuevo || !movTuboForm.responsable_nombre) return
          setSavingMovTubo(true)
          try {
            await supabase.from('tubos_gas').update({
              estado_tubo: movTuboForm.estado_nuevo,
              ubicacion_actual: movTuboForm.ubicacion_nueva || tuboActivo.ubicacion_actual,
            }).eq('id', tuboActivo.id)
            await supabase.from('tubos_historial').insert({
              tubo_id: tuboActivo.id,
              estado_anterior: tuboActivo.estado_tubo,
              estado_nuevo: movTuboForm.estado_nuevo,
              ubicacion_anterior: tuboActivo.ubicacion_actual,
              ubicacion_nueva: movTuboForm.ubicacion_nueva || tuboActivo.ubicacion_actual,
              responsable_nombre: movTuboForm.responsable_nombre,
              responsable_sector: movTuboForm.responsable_sector,
              observaciones: movTuboForm.observaciones,
              registrado_por: usuario?.id,
            })
            setOpenMovTubo(false)
            setMovTuboForm({})
            const { data } = await supabase.from('tubos_gas').select('*, proveedores(razon_social), insumos(nombre)').order('numero_serie')
            setTubos(data ?? [])
          } finally { setSavingMovTubo(false) }
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--blue-800)' }}>
                🫁 Estado actual de los tubos de gas medicinal.
                {puedeMov ? ' Podés registrar movimientos de tubos.' : ''}
              </p>
            </div>

            {/* Resumen de estados */}
            {(() => {
              const llenos  = tubos.filter((t: any) => t.estado_tubo === 'lleno').length
              const enUso   = tubos.filter((t: any) => t.estado_tubo === 'en_uso').length
              const vacios  = tubos.filter((t: any) => t.estado_tubo === 'vacio').length
              const alertaPocos = llenos < 2
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {alertaPocos && (
                    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                      <p style={{ fontWeight: 700, color: '#DC2626', fontSize: '13px' }}>
                        ⚠️ Stock bajo — quedan solo {llenos} tubo{llenos !== 1 ? 's' : ''} lleno{llenos !== 1 ? 's' : ''}
                      </p>
                      <p style={{ fontSize: '12px', color: '#991B1B', marginTop: '4px' }}>Se recomienda solicitar reposición de oxígeno.</p>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
                      <p style={{ fontSize: '28px', fontWeight: 700, color: '#16A34A' }}>{llenos}</p>
                      <p style={{ fontSize: '12px', color: '#15803D', fontWeight: 600 }}>Llenos</p>
                    </div>
                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
                      <p style={{ fontSize: '28px', fontWeight: 700, color: '#2563EB' }}>{enUso}</p>
                      <p style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 600 }}>En uso</p>
                    </div>
                    <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
                      <p style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-3)' }}>{vacios}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 600 }}>Vacíos</p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {puedeVerGasesStock && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { setNuevoTuboForm({}); setOpenNuevoTubo(true) }}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                  + Ingresar tubo
                </button>
              </div>
            )}

            <Card style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Nro serie','Gas','Estado','Ubicación actual','Proveedor', puedeMov ? 'Acción' : ''].filter(Boolean).map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', background: 'var(--slate-50)', borderBottom: '2px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tubos.map((t: any, i: number) => {
                    const est = ESTADOS_GAS[t.estado_tubo] ?? { label: t.estado_tubo, color: '#6B7280' }
                    return (
                      <tr key={t.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{t.numero_serie}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>{GAS_LABEL[t.tipo_gas] ?? t.tipo_gas}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '99px', background: est.color + '20', color: est.color, fontWeight: 600, fontSize: '11px' }}>{est.label}</span>
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>{t.ubicacion_actual ?? '—'}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-3)' }}>{t.proveedores?.razon_social ?? '—'}</td>
                        {puedeMov && (
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                            <button onClick={() => { setTuboActivo(t); setMovTuboForm({ estado_nuevo: t.estado_tubo, ubicacion_nueva: t.ubicacion_actual, responsable_nombre: `${empleado?.nombre} ${empleado?.apellido}` }); setOpenMovTubo(true) }}
                              style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                              Mover
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>

            {/* Modal mover tubo */}
            {openMovTubo && tuboActivo && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '16px' }}>Mover tubo — {tuboActivo.numero_serie}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Estado actual: <strong>{ESTADOS_GAS[tuboActivo.estado_tubo]?.label}</strong> · Ubicación: <strong>{tuboActivo.ubicacion_actual}</strong></p>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Nuevo estado</label>
                      <select value={movTuboForm.estado_nuevo ?? ''} onChange={e => setMovTuboForm((p: any) => ({ ...p, estado_nuevo: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', fontSize: '13px' }}>
                        {Object.entries(ESTADOS_GAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Nueva ubicación</label>
                      <select value={movTuboForm.ubicacion_nueva ?? ''} onChange={e => setMovTuboForm((p: any) => ({ ...p, ubicacion_nueva: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', fontSize: '13px' }}>
                        {SECTORES_MOV.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Responsable *</label>
                      <input value={movTuboForm.responsable_nombre ?? ''} onChange={e => setMovTuboForm((p: any) => ({ ...p, responsable_nombre: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Observaciones</label>
                      <input value={movTuboForm.observaciones ?? ''} onChange={e => setMovTuboForm((p: any) => ({ ...p, observaciones: e.target.value }))}
                        placeholder="Motivo del movimiento"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', background: 'var(--surface)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <button onClick={() => setOpenMovTubo(false)}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={guardarMovTubo} disabled={savingMovTubo}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                      {savingMovTubo ? 'Guardando...' : 'Confirmar movimiento'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal nuevo tubo */}
            {openNuevoTubo && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Ingresar tubo</h3>
                  {[
                    { label: 'Nro de serie *', key: 'numero_serie', type: 'text' },
                    { label: 'Gas (ej: Oxígeno, CO2)', key: 'tipo_gas', type: 'text' },
                    { label: 'Ubicación actual', key: 'ubicacion_actual', type: 'text' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                      <input type={f.type} value={nuevoTuboForm[f.key] ?? ''}
                        onChange={e => setNuevoTuboForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Estado inicial</label>
                    <select value={nuevoTuboForm.estado_tubo ?? 'lleno'}
                      onChange={e => setNuevoTuboForm((p: any) => ({ ...p, estado_tubo: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px' }}>
                      <option value="lleno">Lleno</option>
                      <option value="en_uso">En uso</option>
                      <option value="vacio">Vacío</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    <button onClick={() => setOpenNuevoTubo(false)}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={async () => {
                      if (!nuevoTuboForm.numero_serie) return
                      setSavingNuevoTubo(true)
                      try {
                        await supabase.from('tubos_gas').insert({
                          numero_serie: nuevoTuboForm.numero_serie,
                          tipo_gas: nuevoTuboForm.tipo_gas ?? null,
                          ubicacion_actual: nuevoTuboForm.ubicacion_actual ?? null,
                          estado_tubo: nuevoTuboForm.estado_tubo ?? 'lleno',
                        })
                        const { data } = await supabase.from('tubos_gas').select('*, proveedores(razon_social), insumos(nombre)').order('numero_serie')
                        setTubos(data ?? [])
                        setOpenNuevoTubo(false)
                        setNuevoTuboForm({})
                      } finally { setSavingNuevoTubo(false) }
                    }} disabled={savingNuevoTubo || !nuevoTuboForm.numero_serie}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                      {savingNuevoTubo ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {seccionActiva === 'stock' && (() => {
        const SECTORES_DEST = ['Internación','Quirófano','Quirófano 1','Quirófano 2','Sala de partos','Recepción del recién nacido','Guardia','Farmacia','Laboratorio','Imágenes','Administración']
        const alertasStock = stockInsumos.filter((ins: any) => ins.stock_minimo && ins.stock_actual <= ins.stock_minimo)

        async function guardarNuevoInsumo() {
          if (!nuevoInsumoForm.nombre || !nuevoInsumoForm.categoria_id) return
          setSavingNuevoInsumo(true)
          try {
            const { error: insErr } = await supabase.from('insumos').insert({
              nombre: nuevoInsumoForm.nombre,
              descripcion: nuevoInsumoForm.descripcion ?? null,
              unidad_medida: nuevoInsumoForm.unidad_medida ?? 'unidades',
              stock_actual: parseInt(nuevoInsumoForm.stock_actual) || 0,
              stock_minimo: nuevoInsumoForm.stock_minimo ? parseInt(nuevoInsumoForm.stock_minimo) : null,
              categoria_id: nuevoInsumoForm.categoria_id,
              estado: 'activo',
            })
            if (insErr) { alert('Error: ' + insErr.message); return }
            const { data } = await supabase.from('insumos').select('*, categorias_insumo(nombre)').eq('estado', 'activo').order('nombre')
            setStockInsumos(data ?? [])
            setOpenNuevoInsumo(false)
            setNuevoInsumoForm({})
          } finally { setSavingNuevoInsumo(false) }
        }

        async function guardarMovStock() {
          if (!insumoActivo || !movStockForm.cantidad || movStockForm.cantidad <= 0) return
          setSavingMovStock(true)
          try {
            const cant = parseInt(movStockForm.cantidad)
            const delta = movStockForm.tipo_movimiento === 'entrada' || movStockForm.tipo_movimiento === 'devolucion' ? cant : -cant
            await supabase.from('movimientos_stock').insert({
              insumo_id: insumoActivo.id,
              tipo_movimiento: movStockForm.tipo_movimiento,
              cantidad: cant,
              sector_destino: movStockForm.sector_destino ?? null,
              observaciones: movStockForm.observaciones ?? null,
              registrado_por: usuario?.id,
            })
            await supabase.rpc('incrementar_stock', { p_insumo_id: insumoActivo.id, p_cantidad: delta })
            const { data } = await supabase.from('insumos').select('*, categorias_insumo(nombre)').eq('estado', 'activo').order('nombre')
            setStockInsumos(data ?? [])
            setOpenMovStock(false)
            setMovStockForm({ tipo_movimiento: 'salida', cantidad: '' })
          } finally { setSavingMovStock(false) }
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Banner alertas stock bajo */}
            {alertasStock.length > 0 && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <p style={{ fontWeight: 700, color: '#DC2626', marginBottom: '8px', fontSize: '13px' }}>
                  ⚠️ {alertasStock.length} insumo{alertasStock.length > 1 ? 's' : ''} por debajo del stock mínimo
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {alertasStock.map((ins: any) => (
                    <div key={ins.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: '#991B1B', fontWeight: 600 }}>• {ins.nombre}</span>
                      <span style={{ color: '#B91C1C' }}>
                        Stock: <strong>{ins.stock_actual ?? 0}</strong> {ins.unidad_medida} / Mínimo: {ins.stock_minimo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {puedeVerGasesStock && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { setNuevoInsumoForm({}); setOpenNuevoInsumo(true) }}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                  + Nuevo insumo
                </button>
              </div>
            )}

            <Card style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Insumo','Categoría','Stock actual','Mínimo','Estado','Acción'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', background: 'var(--slate-50)', borderBottom: '2px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockInsumos.map((ins: any, i: number) => {
                    const bajo = ins.stock_minimo && ins.stock_actual <= ins.stock_minimo
                    return (
                      <tr key={ins.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--slate-50)' }}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                          {ins.nombre}
                          <p style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 400 }}>{ins.descripcion}</p>
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>{ins.categorias_insumo?.nombre ?? '—'}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: bajo ? '#DC2626' : '#16A34A' }}>
                          {ins.stock_actual ?? 0} {ins.unidad_medida}
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-3)' }}>{ins.stock_minimo ?? '—'}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                            background: bajo ? '#FEF2F2' : '#F0FDF4', color: bajo ? '#DC2626' : '#16A34A' }}>
                            {bajo ? 'Stock bajo' : 'Normal'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                          <button onClick={() => { setInsumoActivo(ins); setMovStockForm({ tipo_movimiento: 'salida', cantidad: '' }); setOpenMovStock(true) }}
                            style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                            Movimiento
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>

            {/* Modal movimiento stock */}
            {openMovStock && insumoActivo && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Movimiento — {insumoActivo.nombre}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '16px' }}>Stock actual: <strong>{insumoActivo.stock_actual} {insumoActivo.unidad_medida}</strong></p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Tipo de movimiento</label>
                      <select value={movStockForm.tipo_movimiento} onChange={e => setMovStockForm((p: any) => ({ ...p, tipo_movimiento: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px' }}>
                        <option value="entrada">Entrada (compra / recepción)</option>
                        <option value="salida">Salida (consumo)</option>
                        <option value="devolucion">Devolución</option>
                        <option value="baja">Baja / descarte</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Cantidad *</label>
                      <input type="number" min="1" value={movStockForm.cantidad} onChange={e => setMovStockForm((p: any) => ({ ...p, cantidad: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    {(movStockForm.tipo_movimiento === 'salida' || movStockForm.tipo_movimiento === 'baja') && (
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Sector destino</label>
                        <select value={movStockForm.sector_destino ?? ''} onChange={e => setMovStockForm((p: any) => ({ ...p, sector_destino: e.target.value }))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px' }}>
                          <option value="">Seleccionar...</option>
                          {SECTORES_DEST.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Observaciones</label>
                      <input value={movStockForm.observaciones ?? ''} onChange={e => setMovStockForm((p: any) => ({ ...p, observaciones: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <button onClick={() => setOpenMovStock(false)}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={guardarMovStock} disabled={savingMovStock || !movStockForm.cantidad}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                      {savingMovStock ? 'Guardando...' : 'Registrar'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal nuevo insumo */}
            {openNuevoInsumo && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 460, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Nuevo insumo</h3>
                  {[
                    { label: 'Nombre *', key: 'nombre', type: 'text' },
                    { label: 'Descripción', key: 'descripcion', type: 'text' },
                    { label: 'Unidad de medida', key: 'unidad_medida', type: 'text', placeholder: 'ej: unidades, cajas, ml' },
                    { label: 'Stock inicial *', key: 'stock_actual', type: 'number' },
                    { label: 'Stock mínimo', key: 'stock_minimo', type: 'number' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                      <input type={f.type} placeholder={f.placeholder ?? ''} value={nuevoInsumoForm[f.key] ?? ''}
                        onChange={e => setNuevoInsumoForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Categoría *</label>
                    <select value={nuevoInsumoForm.categoria_id ?? ''} onChange={e => setNuevoInsumoForm((p: any) => ({ ...p, categoria_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)', fontSize: '13px', boxSizing: 'border-box' }}>
                      <option value="">Seleccionar categoría...</option>
                      <option value="c38993f8-7a6e-48e7-acab-02acf6ce811e">Gases medicinales</option>
                      <option value="89036ffa-ce41-4017-8769-6b8fae589ebe">Limpieza e higiene</option>
                      <option value="300e6b8d-ff52-4dc4-b50e-b4c7a73e1cfe">Material descartable</option>
                      <option value="b8a1c2e9-746b-49bf-aa7f-a375a8c6a0ce">Medicamentos</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    <button onClick={() => setOpenNuevoInsumo(false)}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={guardarNuevoInsumo} disabled={savingNuevoInsumo || !nuevoInsumoForm.nombre || !nuevoInsumoForm.stock_actual}
                      style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                      {savingNuevoInsumo ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {seccionActiva === 'prestaciones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>💰</p>
            <p style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Prestaciones y Cobros</p>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>
              Accedé al módulo completo de prestaciones para registrar y cobrar servicios.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/prestaciones/cobros" style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
                💰 Ir a Cobros
              </a>
              <a href="/prestaciones/catalogo" style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text)', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
                🏥 Ver Catálogo
              </a>
              <a href="/prestaciones/resumen" style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text)', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
                📈 Ver Resumen
              </a>
            </div>
          </div>
        </div>
      )}

      {seccionActiva === 'mediaciones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Aviso confidencialidad */}
          <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🔒</span>
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--blue-800)', marginBottom: '4px' }}>Proceso confidencial</p>
              <p style={{ fontSize: '12px', color: 'var(--blue-700)', lineHeight: 1.5 }}>
                Todo lo que describas es estrictamente confidencial. Tu caso será analizado por el equipo de mediación y recibirás una respuesta con la resolución o propuesta.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setMedForm({}); setErrorMed(null); setOpenNuevaMed(true) }}>
              + Iniciar nuevo caso
            </Button>
          </div>

          {mediaciones.length === 0 ? (
            <Card style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>⚖️</p>
              <p style={{ fontWeight: 600, marginBottom: '8px' }}>No tenés casos iniciados</p>
              <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Si tenés una disconformidad, conflicto o evento adverso para reportar, podés iniciarlo desde aquí.</p>
            </Card>
          ) : (
            mediaciones.map((med: any) => (
              <Card key={med.id} style={{ cursor: 'pointer' }} onClick={() => setDetalleMed(med)}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                        {TIPO_MEDIACION[med.tipo_conflicto] ?? med.tipo_conflicto}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(med.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <Badge variant={ESTADO_MED_BADGE[med.estado]}>{ESTADO_MED_LABEL[med.estado]}</Badge>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {med.descripcion}
                  </p>

                  {med.estado === 'cerrado' && med.resolucion ? (
                    <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green-700)', marginBottom: '4px' }}>✅ RESOLUCIÓN / PROPUESTA</p>
                      <p style={{ fontSize: '12px', color: 'var(--green-800)', lineHeight: 1.5 }}>{med.resolucion}</p>
                    </div>
                  ) : med.estado === 'en_proceso' ? (
                    <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--blue-700)' }}>🔄 Tu caso está siendo analizado por el equipo de mediación.</p>
                    </div>
                  ) : (
                    <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--amber-700)' }}>⏳ Caso recibido. El equipo de mediación tomará contacto pronto.</p>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Modal: Iniciar nuevo caso de mediación */}
      <Modal open={openNuevaMed} onClose={() => setOpenNuevaMed(false)} title="Iniciar caso de mediación" width={540}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <p style={{ fontSize: '12px', color: 'var(--amber-800)', lineHeight: 1.5 }}>
              🔒 Todo lo que describas es <strong>estrictamente confidencial</strong>. Cuanto más detallada sea tu descripción, mejor podremos ayudarte.
            </p>
          </div>

          {errorMed && (
            <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
              <p style={{ fontSize: '13px', color: 'var(--red-700)' }}>⚠️ {errorMed}</p>
            </div>
          )}

          <Select label="Tipo de caso *" value={medForm.tipo_conflicto ?? ''}
            onChange={e => setMedForm((p: any) => ({ ...p, tipo_conflicto: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {Object.entries(TIPO_MEDIACION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
              Descripción del caso *
            </label>
            <textarea
              value={medForm.descripcion ?? ''}
              onChange={e => setMedForm((p: any) => ({ ...p, descripcion: e.target.value }))}
              placeholder="Describí con detalle qué sucedió, cuándo, con quién, y cómo te afectó. Toda la información que brindes es confidencial."
              rows={6}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-2)', background: 'var(--surface)',
                color: 'var(--text)', fontFamily: 'inherit', fontSize: '13px',
                lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
              {(medForm.descripcion ?? '').length} caracteres
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenNuevaMed(false)}>Cancelar</Button>
          <Button onClick={iniciarMediacion} loading={savingMed}>Enviar caso</Button>
        </div>
      </Modal>

      {/* Modal: Detalle de mediación */}
      <Modal open={!!detalleMed} onClose={() => setDetalleMed(null)} title="Detalle del caso" width={500}>
        {detalleMed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '15px' }}>{TIPO_MEDIACION[detalleMed.tipo_conflicto]}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  {new Date(detalleMed.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <Badge variant={ESTADO_MED_BADGE[detalleMed.estado]}>{ESTADO_MED_LABEL[detalleMed.estado]}</Badge>
            </div>

            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '6px' }}>TU DESCRIPCIÓN</p>
              <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, background: 'var(--slate-50)', padding: '12px 14px', borderRadius: 'var(--radius-sm)' }}>
                {detalleMed.descripcion}
              </p>
            </div>

            {detalleMed.estado === 'cerrado' && detalleMed.resolucion ? (
              <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green-700)', marginBottom: '8px' }}>✅ RESOLUCIÓN / PROPUESTA DEL MEDIADOR</p>
                <p style={{ fontSize: '13px', color: 'var(--green-900)', lineHeight: 1.7 }}>{detalleMed.resolucion}</p>
              </div>
            ) : detalleMed.estado === 'en_proceso' ? (
              <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--blue-700)', lineHeight: 1.5 }}>
                  🔄 <strong>Tu caso está siendo analizado.</strong> Recibirás la resolución o propuesta una vez que el proceso de mediación concluya.
                </p>
              </div>
            ) : (
              <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--amber-700)', lineHeight: 1.5 }}>
                  ⏳ <strong>Caso recibido.</strong> El equipo de mediación revisará tu caso y lo tomará en proceso pronto.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal licencia */}
      <Modal open={openLic} onClose={() => setOpenLic(false)} title="Solicitar licencia" width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select label="Tipo de licencia *" value={licForm.tipo_licencia ?? ''} onChange={e => setLicForm((p: any) => ({ ...p, tipo_licencia: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {Object.entries(TIPO_LICENCIA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Input label="Desde *" type="date" value={licForm.fecha_inicio ?? ''} onChange={e => setLicForm((p: any) => ({ ...p, fecha_inicio: e.target.value }))} />
            <Input label="Hasta *" type="date" value={licForm.fecha_fin ?? ''} onChange={e => setLicForm((p: any) => ({ ...p, fecha_fin: e.target.value }))} />
          </div>
          <Textarea label="Motivo (opcional)" value={licForm.motivo ?? ''} onChange={e => setLicForm((p: any) => ({ ...p, motivo: e.target.value }))} style={{ minHeight: 70 }} />
          <div style={{ background: 'var(--amber-50)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', border: '1px solid #fcd34d' }}>
            <p style={{ fontSize: '12px', color: 'var(--amber-600)' }}>La solicitud quedará pendiente hasta que RRHH la apruebe.</p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenLic(false)}>Cancelar</Button>
          <Button onClick={solicitarLicencia} loading={savingLic}>Enviar solicitud</Button>
        </div>
      </Modal>

      {/* Modal cambiar contraseña */}
      <Modal open={openCambiarPass} onClose={() => setOpenCambiarPass(false)} title="Cambiar contraseña" width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorPass && (
            <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
              <p style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {errorPass}</p>
            </div>
          )}
          <Input label="Contraseña actual *" type="password" value={passForm.actual ?? ''}
            onChange={e => setPassForm((p: any) => ({ ...p, actual: e.target.value }))} />
          <Input label="Nueva contraseña *" type="password" value={passForm.nueva ?? ''}
            onChange={e => setPassForm((p: any) => ({ ...p, nueva: e.target.value }))}
            placeholder="Mínimo 6 caracteres" />
          <Input label="Confirmar nueva contraseña *" type="password" value={passForm.confirmar ?? ''}
            onChange={e => setPassForm((p: any) => ({ ...p, confirmar: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenCambiarPass(false)}>Cancelar</Button>
          <Button onClick={cambiarMiPassword} loading={savingPass}>Guardar contraseña</Button>
        </div>
      </Modal>
    </Page>
  )
}
