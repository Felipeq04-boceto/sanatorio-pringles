import React, { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Card, Modal, Input, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const SeccionInicio      = React.lazy(() => import('@/components/empleado-portal/SeccionInicio').then(m => ({ default: m.SeccionInicio })))
const SeccionTurnos      = React.lazy(() => import('@/components/empleado-portal/SeccionTurnos').then(m => ({ default: m.SeccionTurnos })))
const SeccionGases       = React.lazy(() => import('@/components/empleado-portal/SeccionGases').then(m => ({ default: m.SeccionGases })))
const SeccionStock       = React.lazy(() => import('@/components/empleado-portal/SeccionStock').then(m => ({ default: m.SeccionStock })))
const SeccionMediaciones = React.lazy(() => import('@/components/empleado-portal/SeccionMediaciones').then(m => ({ default: m.SeccionMediaciones })))

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

function SectionSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
      <Spinner size={28} />
    </div>
  )
}

function SeccionRecibos({ empleadoId }: { empleadoId: string }) {
  const [recibos,  setRecibos]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { loadRecibos() }, [empleadoId])

  async function loadRecibos() {
    setLoading(true)
    const { data } = await supabase
      .from('recibos_sueldo')
      .select('*')
      .eq('empleado_id', empleadoId)
      .order('anio', { ascending: false })
      .order('mes',  { ascending: false })
    setRecibos(data ?? [])
    setLoading(false)
  }

  async function handleAbrir(recibo: any) {
    // Marcar como visto si es la primera vez
    if (!recibo.visto_at) {
      await supabase
        .from('recibos_sueldo')
        .update({ visto_at: new Date().toISOString() })
        .eq('id', recibo.id)
      setRecibos(prev => prev.map(r => r.id === recibo.id ? { ...r, visto_at: new Date().toISOString() } : r))
    }

    // Generar URL firmada y abrir
    const { data } = await supabase.storage
      .from('recibos')
      .createSignedUrl(recibo.archivo_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading) return <SectionSpinner />

  if (recibos.length === 0) {
    return (
      <Card style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '28px', marginBottom: '8px' }}>📄</p>
        <p style={{ fontWeight: 600, marginBottom: '6px' }}>No hay recibos disponibles</p>
        <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>Cuando RRHH suba tus recibos de sueldo, aparecerán aquí.</p>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '4px' }}>
        {recibos.length} recibo{recibos.length !== 1 ? 's' : ''} disponible{recibos.length !== 1 ? 's' : ''}
      </p>
      {recibos.map(r => (
        <Card key={r.id} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '24px' }}>📄</div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
              {MESES[r.mes - 1]} {r.anio}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-2)' }}>
              Subido el {new Date(r.subido_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {r.visto_at ? (
              <span style={{ fontSize: '12px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ✓ Visto el {new Date(r.visto_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
              </span>
            ) : (
              <span style={{
                padding: '3px 10px', borderRadius: '999px',
                background: '#fef3c7', color: '#d97706',
                fontSize: '11px', fontWeight: 700
              }}>
                NUEVO
              </span>
            )}
            <Button size="sm" variant={r.visto_at ? 'secondary' : 'primary'} onClick={() => handleAbrir(r)}>
              {r.visto_at ? '⬇ Descargar' : '👁 Ver recibo'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function EmpleadoPortalPage() {
  const { usuario } = useAuth()

  const [empleado,    setEmpleado]    = useState<any>(null)
  const [marcaciones, setMarcaciones] = useState<any[]>([])
  const [turnos,      setTurnos]      = useState<any[]>([])
  const [licencias,   setLicencias]   = useState<any[]>([])
  const [mediaciones, setMediaciones] = useState<any[]>([])
  const [recibosNuevos, setRecibosNuevos] = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [config,      setConfig]      = useState<any>({})

  const [seccionActiva, setSeccionActiva] = useState<'inicio'|'mediaciones'|'turnos'|'gases'|'stock'|'prestaciones'|'recibos'>(
    ['referente_enfermeria','referente_quirofano','referente_instrumentadores'].includes(usuario?.rol ?? '') ? 'gases' : 'inicio'
  )

  const [openCambiarPass, setOpenCambiarPass] = useState(false)
  const [passForm,        setPassForm]        = useState<any>({})
  const [savingPass,      setSavingPass]      = useState(false)
  const [errorPass,       setErrorPass]       = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (usuario) loadAll() }, [usuario])

  async function loadAll(silent = false) {
    if (!silent) setLoading(true)

    const { data: cfg } = await supabase.from('configuracion').select('*')
    const cfgMap = (cfg ?? []).reduce((acc: any, c: any) => { acc[c.clave] = c.valor; return acc }, {})
    setConfig(cfgMap)

    const { data: emp } = await supabase
      .from('empleados').select('*').eq('usuario_id', usuario!.id).single()
    setEmpleado(emp)

    const esRolInsumos = ['referente_enfermeria','referente_quirofano','referente_instrumentadores'].includes(usuario?.rol ?? '')

    if (!emp) {
      setLoading(false)
      void esRolInsumos
      return
    }

    const hoy = new Date().toISOString().split('T')[0]
    const inicioMes = hoy.substring(0, 7) + '-01'

    const [{ data: marc }, { data: turn }, { data: lic }, { data: med }, { data: recibos }] = await Promise.all([
      supabase.from('marcaciones').select('*').eq('empleado_id', emp.id)
        .gte('fecha', inicioMes).order('hora', { ascending: false }),
      supabase.from('turnos').select('*').eq('empleado_id', emp.id)
        .gte('fecha', hoy).lte('fecha', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0])
        .order('fecha'),
      supabase.from('licencias').select('*').eq('empleado_id', emp.id)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('mediaciones').select('*').eq('empleado_id', emp.id)
        .order('created_at', { ascending: false }),
      supabase.from('recibos_sueldo').select('id, visto_at').eq('empleado_id', emp.id).is('visto_at', null),
    ])
    setMarcaciones(marc ?? [])
    setTurnos(turn ?? [])
    setLicencias(lic ?? [])
    setMediaciones(med ?? [])
    setRecibosNuevos((recibos ?? []).length)

    setLoading(false)
  }

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

  if (loading) return (
    <Page><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Spinner size={36} /></div></Page>
  )

  const esRolInsumos = ['referente_enfermeria','referente_quirofano','referente_instrumentadores'].includes(usuario?.rol ?? '')
  const puedeVerPrestaciones = ['administrativo','enfermeria','instrumentadora','referente_enfermeria','referente_quirofano','referente_instrumentadores','rrhh','admin'].includes(usuario?.rol ?? '')
  const puedeVerGasesStock = ['referente_enfermeria','referente_quirofano','referente_instrumentadores','admin'].includes(usuario?.rol ?? '')

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

  const tabs = [
    { key: 'inicio',       label: '🏠 Inicio' },
    { key: 'turnos',       label: '📅 Turnos' },
    ...(puedeVerPrestaciones ? [{ key: 'prestaciones', label: '💰 Prestaciones' }] : []),
    { key: 'mediaciones',  label: `⚖️ Mediaciones${mediaciones.length > 0 ? ` (${mediaciones.length})` : ''}` },
    ...(empleado ? [{
      key: 'recibos',
      label: `📄 Recibos${recibosNuevos > 0 ? ` · ${recibosNuevos} nuevo${recibosNuevos !== 1 ? 's' : ''}` : ''}`
    }] : []),
    ...(puedeVerGasesStock ? [{ key: 'gases', label: '🫁 Gases medicinales' }] : []),
    ...(puedeVerGasesStock ? [{ key: 'stock', label: '📦 Stock e Insumos' }] : []),
  ]

  return (
    <Page>
      <PageHeader title={`Hola, ${nombrePortal}`} subtitle={subtituloPortal} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <Button variant="secondary" size="sm" onClick={() => { setPassForm({}); setErrorPass(null); setOpenCambiarPass(true) }}>
          🔒 Cambiar contraseña
        </Button>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: '20px', borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '4px', minWidth: 'max-content' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setSeccionActiva(tab.key as any)}
              style={{
                padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: seccionActiva === tab.key ? 700 : 400,
                color: seccionActiva === tab.key ? 'var(--accent)' : 'var(--text-2)',
                borderBottom: seccionActiva === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-2px', fontSize: '13px',
                ...(tab.key === 'recibos' && recibosNuevos > 0 && seccionActiva !== 'recibos'
                  ? { color: '#d97706' }
                  : {}),
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<SectionSpinner />}>
        {seccionActiva === 'inicio' && (
          <SeccionInicio empleado={empleado} config={config} marcaciones={marcaciones} turnos={turnos} licencias={licencias} onRefresh={() => loadAll(true)} />
        )}
        {seccionActiva === 'turnos' && <SeccionTurnos empleado={empleado} />}
        {seccionActiva === 'gases' && <SeccionGases empleado={empleado} />}
        {seccionActiva === 'stock' && <SeccionStock empleado={empleado} />}
        {seccionActiva === 'mediaciones' && (
          <SeccionMediaciones empleado={empleado} mediaciones={mediaciones} onMediacionCreada={() => loadAll(true)} />
        )}
      </Suspense>

      {seccionActiva === 'recibos' && empleado && (
        <SeccionRecibos empleadoId={empleado.id} />
      )}

      {seccionActiva === 'prestaciones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>💰</p>
            <p style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Prestaciones y Cobros</p>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>Accedé al módulo completo de prestaciones para registrar y cobrar servicios.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/prestaciones/cobros" style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>💰 Ir a Cobros</a>
              <a href="/prestaciones/catalogo" style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text)', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>🏥 Ver Catálogo</a>
              <a href="/prestaciones/resumen" style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', color: 'var(--text)', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>📈 Ver Resumen</a>
            </div>
          </div>
        </div>
      )}

      <Modal open={openCambiarPass} onClose={() => setOpenCambiarPass(false)} title="Cambiar contraseña" width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorPass && (
            <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
              <p style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {errorPass}</p>
            </div>
          )}
          <Input label="Contraseña actual *" type="password" value={passForm.actual ?? ''} onChange={e => setPassForm((p: any) => ({ ...p, actual: e.target.value }))} />
          <Input label="Nueva contraseña *" type="password" value={passForm.nueva ?? ''} onChange={e => setPassForm((p: any) => ({ ...p, nueva: e.target.value }))} placeholder="Mínimo 6 caracteres" />
          <Input label="Confirmar nueva contraseña *" type="password" value={passForm.confirmar ?? ''} onChange={e => setPassForm((p: any) => ({ ...p, confirmar: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenCambiarPass(false)}>Cancelar</Button>
          <Button onClick={cambiarMiPassword} loading={savingPass}>Guardar contraseña</Button>
        </div>
      </Modal>
    </Page>
  )
}
