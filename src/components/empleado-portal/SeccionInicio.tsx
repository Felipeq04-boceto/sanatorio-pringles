import React from 'react'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Badge, Card, Modal, Input, Textarea } from '@/components/ui'
import { Select } from '@/components/ui'
import { TIPO_LICENCIA } from '@/lib/empleado-portal-constants'

interface Props {
  empleado: any
  config: any
  marcaciones: any[]
  turnos: any[]
  licencias: any[]
  onRefresh: () => void
}

function calcDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function horaCorta(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function SeccionInicio({ empleado, config, marcaciones, turnos, licencias, onRefresh }: Props) {
  const [marcando,   setMarcando]   = useState<'entrada' | 'salida' | null>(null)
  const [geoFase,    setGeoFase]    = useState<'idle' | 'geolocating' | 'inserting' | 'ok' | 'fuera' | 'error'>('idle')
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)
  const [lastTipo,   setLastTipo]   = useState<'entrada' | 'salida' | null>(null)
  const [openLic,    setOpenLic]    = useState(false)
  const [licForm,    setLicForm]    = useState<any>({})
  const [savingLic,  setSavingLic]  = useState(false)

  // Optimistic updates — agrega la marcación localmente sin esperar el re-fetch del padre
  const [marcacionesOpt, setMarcacionesOpt] = useState<any[]>([])
  const prevMarcRef = useRef(marcaciones)
  useEffect(() => {
    if (marcaciones !== prevMarcRef.current) {
      prevMarcRef.current = marcaciones
      setMarcacionesOpt([])   // prop actualizado → limpiamos el optimista
    }
  }, [marcaciones])

  // ── Derivados del día de hoy ──────────────────────────────────────────────
  const hoy = new Date().toISOString().split('T')[0]
  const todasMarcaciones = [...marcaciones, ...marcacionesOpt]
  const marcHoy = todasMarcaciones.filter(m => m.fecha === hoy)

  // Cronológico ascendente (más antiguo primero)
  const marcHoyOrdenadas = [...marcHoy].sort((a, b) => a.hora.localeCompare(b.hora))

  // Última marcación del día — decide el estado actual
  const ultimaMarcHoy = marcHoyOrdenadas[marcHoyOrdenadas.length - 1]

  // Máquina de estados alternante: entrada→salida→entrada→salida…
  const puedeMarcarEntrada = !ultimaMarcHoy || ultimaMarcHoy.tipo === 'salida'
  const puedeMarcarSalida  = !!ultimaMarcHoy && ultimaMarcHoy.tipo === 'entrada'

  // Cuántos ciclos completos (entrada + salida) lleva hoy
  const ciclosCompletos = marcHoy.filter(m => m.tipo === 'salida').length
  const esHorarioPartido = ciclosCompletos >= 1

  // ── Marcación ─────────────────────────────────────────────────────────────
  async function marcarAsistencia(tipo: 'entrada' | 'salida') {
    if (!empleado || marcando) return
    setMarcando(tipo)
    setGeoFase('geolocating')
    setErrorMsg(null)
    setLastTipo(tipo)

    try {
      let lat: number, lon: number, precision: number
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,  // más rápido/confiable en interiores
            timeout: 12000,
            maximumAge: 60000,
          })
        )
        lat = pos.coords.latitude
        lon = pos.coords.longitude
        precision = pos.coords.accuracy
      } catch (geoErr: any) {
        lat = 0; lon = 0; precision = 0
        if (geoErr.code === 1) {
          // Sin permiso — marcamos igual, sin coordenadas
          setErrorMsg('⚠️ Ubicación no disponible — la marcación se registrará sin coordenadas.')
        }
      }

      const sanLat = parseFloat(config.geo_latitud    ?? '-37.9925')
      const sanLon = parseFloat(config.geo_longitud   ?? '-61.3667')
      const radio  = parseFloat(config.geo_radio_metros ?? '150')

      let dentroDelArea = false
      let distancia = 0
      if (lat !== 0 || lon !== 0) {
        distancia = calcDistancia(lat, lon, sanLat, sanLon)
        dentroDelArea = distancia <= radio
      }

      setGeoFase('inserting')
      const ahora     = new Date()
      const horaLocal = ahora.toTimeString().substring(0, 8)
      const diaHoy    = ahora.toISOString().split('T')[0]

      const payload: any = {
        empleado_id: empleado.id,
        tipo,
        fecha:       diaHoy,
        hora:        ahora.toISOString(),
        dispositivo: navigator.userAgent.includes('Mobile') ? 'móvil' : 'escritorio',
      }
      if (lat !== 0 || lon !== 0) {
        payload.latitud          = lat
        payload.longitud         = lon
        payload.precision_metros = precision
        payload.dentro_del_area  = dentroDelArea
        payload.distancia_metros = Math.round(distancia)
      }

      const { error: insertError } = await supabase.from('marcaciones').insert(payload)
      if (insertError) {
        setGeoFase('error')
        setErrorMsg(`❌ No se pudo registrar la ${tipo}: ${insertError.message}`)
        return
      }

      // ACTUALIZACIÓN OPTIMISTA — cambia el estado de los botones inmediatamente
      const marcacionNueva = {
        id:              'opt-' + Date.now(),
        empleado_id:     empleado.id,
        tipo,
        fecha:           diaHoy,
        hora:            ahora.toISOString(),
        dentro_del_area: (lat !== 0 || lon !== 0) ? dentroDelArea : null,
        distancia_metros:(lat !== 0 || lon !== 0) ? Math.round(distancia) : null,
      }
      setMarcacionesOpt(prev => [...prev, marcacionNueva])

      // Actualizar el turno del día si existe
      const { data: turnoHoy } = await supabase.from('turnos').select('id')
        .eq('empleado_id', empleado.id).eq('fecha', diaHoy).single()
      if (turnoHoy) {
        const upd: any = { estado: 'presente' }
        if (tipo === 'entrada') upd.hora_entrada_real = horaLocal
        else                    upd.hora_salida_real  = horaLocal
        await supabase.from('turnos').update(upd).eq('id', turnoHoy.id)
      }

      if (lat === 0 && lon === 0) setGeoFase('idle')
      else setGeoFase(dentroDelArea ? 'ok' : 'fuera')

      onRefresh()
    } catch (err: any) {
      setGeoFase('error')
      setErrorMsg('❌ Ocurrió un error inesperado. Intentá de nuevo.')
    } finally {
      setMarcando(null)
    }
  }

  // ── Licencias ─────────────────────────────────────────────────────────────
  async function solicitarLicencia() {
    if (!empleado || !licForm.tipo_licencia || !licForm.fecha_inicio || !licForm.fecha_fin) return
    setSavingLic(true)
    try {
      await supabase.from('licencias').insert({
        empleado_id:   empleado.id,
        tipo_licencia: licForm.tipo_licencia,
        fecha_inicio:  licForm.fecha_inicio,
        fecha_fin:     licForm.fecha_fin,
        motivo:        licForm.motivo,
        estado:        'pendiente',
      })
      setOpenLic(false)
      setLicForm({})
      onRefresh()
    } finally { setSavingLic(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Marcación ── */}
      <Card style={{ padding: '24px', marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '15px', marginBottom: '16px' }}>📍 Marcación de asistencia</h3>

        {/* Banners de estado / error */}
        {errorMsg && (
          <div style={{ background: 'var(--amber-50)', border: '1px solid #fcd34d', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', color: 'var(--amber-700)', fontWeight: 500 }}>{errorMsg}</p>
          </div>
        )}
        {geoFase === 'fuera' && !errorMsg && (
          <div style={{ background: 'var(--amber-50)', border: '1px solid #fcd34d', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', color: 'var(--amber-600)', fontWeight: 500 }}>⚠️ Estás fuera del área del sanatorio. La marcación se registró pero quedará pendiente de validación.</p>
          </div>
        )}
        {geoFase === 'ok' && (
          <div style={{ background: 'var(--green-50)', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', color: 'var(--green-600)', fontWeight: 500 }}>✅ {lastTipo === 'entrada' ? 'Entrada' : 'Salida'} registrada correctamente.</p>
          </div>
        )}
        {geoFase === 'error' && !errorMsg && (
          <div style={{ background: 'var(--red-50)', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', color: 'var(--red-600)', fontWeight: 500 }}>❌ Error al registrar la marcación.</p>
          </div>
        )}

        {/* ── Estado actual del día ── */}
        <div style={{
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          marginBottom: '16px',
          border: `1px solid ${puedeMarcarSalida ? '#86efac' : 'var(--border)'}`,
          background: puedeMarcarSalida ? 'var(--green-50)' : 'var(--slate-50)',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '24px', lineHeight: 1 }}>
            {!ultimaMarcHoy ? '🕐' : puedeMarcarSalida ? '🟢' : '⚫'}
          </span>
          <div style={{ flex: 1 }}>
            {!ultimaMarcHoy && (
              <>
                <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-2)' }}>Sin marcaciones hoy</p>
                <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>Marcá tu entrada cuando llegues al sanatorio</p>
              </>
            )}
            {puedeMarcarSalida && (
              <>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--green-700)' }}>
                  En turno{ciclosCompletos > 0 ? ` · Turno ${ciclosCompletos + 1}` : ''}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--green-600)', marginTop: '2px' }}>
                  Entrada: {horaCorta(ultimaMarcHoy.hora)}
                </p>
              </>
            )}
            {puedeMarcarEntrada && ultimaMarcHoy && (
              <>
                <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
                  Fuera de turno
                  {ciclosCompletos > 0 && ` · ${ciclosCompletos} ${ciclosCompletos === 1 ? 'turno' : 'turnos'} completados`}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                  Última salida: {horaCorta(ultimaMarcHoy.hora)}
                  {esHorarioPartido && ' · Podés marcar tu entrada para el segundo turno'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Historial del día (chips cronológicos) ── */}
        {marcHoyOrdenadas.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: '8px' }}>MARCACIONES DE HOY</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {marcHoyOrdenadas.map((m: any, i: number) => (
                <React.Fragment key={m.id}>
                  {i > 0 && m.tipo === 'entrada' && (
                    <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>·</span>
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: m.tipo === 'entrada' ? '#f0fdf4' : '#fff1f2',
                    border: `1px solid ${m.tipo === 'entrada' ? '#86efac' : '#fca5a5'}`,
                    borderRadius: '20px', padding: '4px 10px',
                  }}>
                    <span style={{ fontSize: '10px' }}>{m.tipo === 'entrada' ? '🟢' : '🔴'}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: m.tipo === 'entrada' ? '#15803d' : '#b91c1c' }}>
                      {horaCorta(m.hora)}
                    </span>
                    {m.dentro_del_area === false && (
                      <span style={{ fontSize: '10px', color: 'var(--amber-600)', fontWeight: 600 }}>⚠</span>
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* ── Botones de marcación ── */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            style={{
              flex: 1, justifyContent: 'center',
              background: puedeMarcarEntrada ? 'var(--green-600)' : 'var(--slate-300)',
              fontSize: '15px', padding: '12px',
              cursor: puedeMarcarEntrada ? 'pointer' : 'not-allowed',
            }}
            onClick={() => marcarAsistencia('entrada')}
            loading={marcando === 'entrada'}
            disabled={!puedeMarcarEntrada || marcando !== null}
          >
            {marcando === 'entrada'
              ? geoFase === 'geolocating' ? '📡 Obteniendo ubicación…'
              : geoFase === 'inserting'  ? '💾 Registrando…'
              : '🟢 Marcar entrada'
              : '🟢 Marcar entrada'}
          </Button>
          <Button
            style={{
              flex: 1, justifyContent: 'center',
              background: puedeMarcarSalida ? 'var(--red-600)' : 'var(--slate-300)',
              fontSize: '15px', padding: '12px',
              cursor: puedeMarcarSalida ? 'pointer' : 'not-allowed',
            }}
            onClick={() => marcarAsistencia('salida')}
            loading={marcando === 'salida'}
            disabled={!puedeMarcarSalida || marcando !== null}
          >
            {marcando === 'salida'
              ? geoFase === 'geolocating' ? '📡 Obteniendo ubicación…'
              : geoFase === 'inserting'  ? '💾 Registrando…'
              : '🔴 Marcar salida'
              : '🔴 Marcar salida'}
          </Button>
        </div>

        {/* Ayuda contextual para horario partido */}
        {esHorarioPartido && puedeMarcarEntrada && (
          <p style={{ fontSize: '11px', color: 'var(--text-3)', textAlign: 'center', marginTop: '10px' }}>
            Horario partido: podés marcar entrada para tu segundo turno
          </p>
        )}
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
                      {t.hora_entrada_programada
                        ? `${t.hora_entrada_programada}${t.hora_salida_programada ? ` — ${t.hora_salida_programada}` : ' (salida flex)'}`
                        : t.tipo_turno}
                    </p>
                    {t.hora_entrada_real && (
                      <p style={{ fontSize: '11px', color: 'var(--green-600)', marginTop: '2px' }}>
                        ✓ Entrada: {t.hora_entrada_real.substring(0, 5)}
                        {t.hora_salida_real ? ` · Salida: ${t.hora_salida_real.substring(0, 5)}` : ''}
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

      {/* Historial marcaciones del mes */}
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
                  {['Fecha', 'Tipo', 'Hora', 'Distancia', 'Estado'].map(h => (
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
    </>
  )
}
