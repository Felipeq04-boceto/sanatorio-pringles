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

function SectionSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
      <Spinner size={28} />
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
  const [loading,     setLoading]     = useState(true)
  const [config,      setConfig]      = useState<any>({})

  const [seccionActiva, setSeccionActiva] = useState<'inicio'|'mediaciones'|'turnos'|'gases'|'stock'|'prestaciones'>(
    usuario?.rol === 'referente_enfermeria' || usuario?.rol === 'referente_instrumentadores' ? 'gases' : 'inicio'
  )

  const [openCambiarPass, setOpenCambiarPass] = useState(false)
  const [passForm,        setPassForm]        = useState<any>({})
  const [savingPass,      setSavingPass]      = useState(false)
  const [errorPass,       setErrorPass]       = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (usuario) loadAll() }, [usuario])

  async function loadAll() {
    setLoading(true)

    const { data: cfg } = await supabase.from('configuracion').select('*')
    const cfgMap = (cfg ?? []).reduce((acc: any, c: any) => { acc[c.clave] = c.valor; return acc }, {})
    setConfig(cfgMap)

    const { data: emp } = await supabase
      .from('empleados').select('*').eq('usuario_id', usuario!.id).single()
    setEmpleado(emp)

    const esRolInsumos = usuario?.rol === 'referente_enfermeria' || usuario?.rol === 'referente_instrumentadores'

    if (!emp) {
      // Rol insumos puede operar sin legajo — SeccionGases/Stock cargan sus propios datos
      setLoading(false)
      void esRolInsumos
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

  const esRolInsumos = usuario?.rol === 'referente_enfermeria' || usuario?.rol === 'referente_instrumentadores'
  const puedeVerPrestaciones = ['administrativo','enfermeria','instrumentadora','referente_enfermeria','referente_instrumentadores','rrhh','admin'].includes(usuario?.rol ?? '')
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
      <PageHeader title={`Hola, ${nombrePortal}`} subtitle={subtituloPortal} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <Button variant="secondary" size="sm" onClick={() => { setPassForm({}); setErrorPass(null); setOpenCambiarPass(true) }}>
          🔒 Cambiar contraseña
        </Button>
      </div>

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

      <Suspense fallback={<SectionSpinner />}>
        {seccionActiva === 'inicio' && (
          <SeccionInicio empleado={empleado} config={config} marcaciones={marcaciones} turnos={turnos} licencias={licencias} onRefresh={loadAll} />
        )}
        {seccionActiva === 'turnos' && <SeccionTurnos empleado={empleado} />}
        {seccionActiva === 'gases' && <SeccionGases empleado={empleado} />}
        {seccionActiva === 'stock' && <SeccionStock empleado={empleado} />}
        {seccionActiva === 'mediaciones' && (
          <SeccionMediaciones empleado={empleado} mediaciones={mediaciones} onMediacionCreada={loadAll} />
        )}
      </Suspense>

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
