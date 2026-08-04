import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  empleado: any
}

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
  aire_medicinal: 'Aire medicinal', nitrogeno: 'N₂', mezcla: 'Mezcla',
}
const SECTORES_MOV = ['Depósito central','Internación','Quirófano','Quirófano 1','Quirófano 2','Sala de partos','Recepción del recién nacido','Guardia','Farmacia','Laboratorio','Imágenes']

export function SeccionGases({ empleado }: Props) {
  const { usuario } = useAuth()

  const puedeMovEmp = empleado && ['Internación','Quirófano','Quirófano 1','Quirófano 2'].includes(empleado.sector_nombre ?? '')
  const puedeMovInsumos = ['referente_enfermeria','referente_instrumentadores','admin'].includes(usuario?.rol ?? '')
  const puedeMov = puedeMovEmp || puedeMovInsumos
  const puedeGestionar = ['referente_enfermeria','referente_instrumentadores','admin'].includes(usuario?.rol ?? '')
  const puedeVerGasesStock = ['referente_enfermeria','referente_instrumentadores','admin'].includes(usuario?.rol ?? '')

  const [tubos,                setTubos]                = useState<any[]>([])
  const [openMovTubo,          setOpenMovTubo]          = useState(false)
  const [tuboActivo,           setTuboActivo]           = useState<any>(null)
  const [movTuboForm,          setMovTuboForm]          = useState<any>({})
  const [savingMovTubo,        setSavingMovTubo]        = useState(false)
  const [openNuevoTubo,        setOpenNuevoTubo]        = useState(false)
  const [nuevoTuboForm,        setNuevoTuboForm]        = useState<any>({})
  const [savingNuevoTubo,      setSavingNuevoTubo]      = useState(false)
  const [openHistorialTubo,    setOpenHistorialTubo]    = useState(false)
  const [historialTubo,        setHistorialTubo]        = useState<any[]>([])
  const [openConfirmBorrarTubo, setOpenConfirmBorrarTubo] = useState(false)
  const [savingBorrarTubo,     setSavingBorrarTubo]     = useState(false)

  useEffect(() => {
    supabase.from('tubos_gas')
      .select('*, proveedores(razon_social), insumos(nombre)')
      .order('numero_serie')
      .then(({ data }) => setTubos(data ?? []))
  }, [])

  async function recargarTubos() {
    const { data } = await supabase.from('tubos_gas').select('*, proveedores(razon_social), insumos(nombre)').order('numero_serie')
    setTubos(data ?? [])
  }

  async function loadHistorialTubo(tuboId: string) {
    const { data } = await supabase.from('tubos_historial').select('*').eq('tubo_id', tuboId).order('fecha', { ascending: false })
    setHistorialTubo(data ?? [])
  }

  async function verHistorialTubo(tubo: any) {
    setTuboActivo(tubo)
    await loadHistorialTubo(tubo.id)
    setOpenHistorialTubo(true)
  }

  async function handleBorrarTubo() {
    if (!tuboActivo) return
    setSavingBorrarTubo(true)
    try {
      await supabase.from('tubos_historial').delete().eq('tubo_id', tuboActivo.id)
      const { error: errDel } = await supabase.from('tubos_gas').delete().eq('id', tuboActivo.id)
      if (errDel) { alert('Error al borrar: ' + errDel.message); return }
      if (tuboActivo.insumo_id) await supabase.rpc('incrementar_stock', { p_insumo_id: tuboActivo.insumo_id, p_cantidad: -1 })
      setOpenConfirmBorrarTubo(false)
      setTuboActivo(null)
      await recargarTubos()
    } finally { setSavingBorrarTubo(false) }
  }

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
      await recargarTubos()
    } finally { setSavingMovTubo(false) }
  }

  const llenos = tubos.filter((t: any) => t.estado_tubo === 'lleno').length
  const enUso  = tubos.filter((t: any) => t.estado_tubo === 'en_uso').length
  const vacios = tubos.filter((t: any) => t.estado_tubo === 'vacio').length
  const alertaPocos = llenos < 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--blue-800)' }}>
          🫁 Estado actual de los tubos de gas medicinal.
          {puedeMov ? ' Podés registrar movimientos de tubos.' : ''}
        </p>
      </div>

      {/* Resumen de estados */}
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
              {['Nro serie','Gas','Estado','Ubicación actual','Proveedor', (puedeMov || puedeGestionar) ? 'Acción' : ''].filter(Boolean).map(h => (
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
                  {(puedeMov || puedeGestionar) && (
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {puedeMov && (
                          <button onClick={() => { setTuboActivo(t); setMovTuboForm({ estado_nuevo: t.estado_tubo, ubicacion_nueva: t.ubicacion_actual, responsable_nombre: `${empleado?.nombre} ${empleado?.apellido}` }); setOpenMovTubo(true) }}
                            style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                            Mover
                          </button>
                        )}
                        {puedeGestionar && (
                          <button onClick={() => verHistorialTubo(t)}
                            style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>
                            Historial
                          </button>
                        )}
                        {puedeGestionar && (
                          <button onClick={() => { setTuboActivo(t); setOpenConfirmBorrarTubo(true) }}
                            style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid #FECACA', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: '#DC2626' }}>
                            Borrar
                          </button>
                        )}
                      </div>
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

      {/* Modal historial tubo */}
      {openHistorialTubo && tuboActivo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 620, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700 }}>Historial — Tubo {tuboActivo.numero_serie}</h3>
              <button onClick={() => setOpenHistorialTubo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-3)' }}>✕</button>
            </div>
            {historialTubo.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: '32px', fontSize: '13px' }}>Sin movimientos registrados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {historialTubo.map((h, i) => (
                  <div key={h.id} style={{ background: i === 0 ? '#EFF6FF' : 'var(--slate-50)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', border: `1px solid ${i === 0 ? '#BFDBFE' : 'var(--border)'}`, position: 'relative' }}>
                    {i === 0 && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', background: '#2563EB', color: '#fff', padding: '2px 6px', borderRadius: '99px' }}>ÚLTIMO</span>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600 }}>{h.estado_anterior ? `${h.estado_anterior} → ` : ''}{h.estado_nuevo}</p>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(h.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {(h.ubicacion_anterior || h.ubicacion_nueva) && <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>📍 {h.ubicacion_anterior && h.ubicacion_anterior !== h.ubicacion_nueva ? `${h.ubicacion_anterior} → ` : ''}{h.ubicacion_nueva}</p>}
                    <p style={{ fontSize: '12px', fontWeight: 500 }}>👤 {h.responsable_nombre}{h.responsable_sector ? ` — ${h.responsable_sector}` : ''}</p>
                    {h.observaciones && <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px', fontStyle: 'italic' }}>{h.observaciones}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal confirmar borrar tubo */}
      {openConfirmBorrarTubo && tuboActivo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius)', padding: '24px', width: 440, maxWidth: '90vw' }}>
            <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
              <p style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>¿Borrar tubo <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--slate-100)', padding: '2px 6px', borderRadius: '4px' }}>{tuboActivo.numero_serie}</code>?</p>
              <p style={{ color: 'var(--text-2)', fontSize: '13px' }}>Se eliminará el tubo y todo su historial. Esta acción no se puede deshacer.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setOpenConfirmBorrarTubo(false)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleBorrarTubo} disabled={savingBorrarTubo} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: '#DC2626', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {savingBorrarTubo ? 'Borrando...' : 'Sí, borrar'}
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
                  await recargarTubos()
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
}
