import React from 'react'
import { useState } from 'react'
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

export function SeccionInicio({ empleado, config, marcaciones, turnos, licencias, onRefresh }: Props) {
  const [marcando,  setMarcando]  = useState(false)
  const [openLic,   setOpenLic]   = useState(false)
  const [licForm,   setLicForm]   = useState<any>({})
  const [savingLic, setSavingLic] = useState(false)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'ok' | 'fuera' | 'error'>('idle')

  const hoy = new Date().toISOString().split('T')[0]
  const marcHoy = marcaciones.filter(m => m.fecha === hoy)
  const entradaHoy = [...marcHoy].filter(m => m.tipo === 'entrada').sort((a, b) => b.hora.localeCompare(a.hora))[0]
  const salidaHoy  = [...marcHoy].filter(m => m.tipo === 'salida').sort((a, b) => b.hora.localeCompare(a.hora))[0]
  const ultimaMarcHoy = [...marcHoy].sort((a, b) => b.hora.localeCompare(a.hora))[0]
  const puedeMarcarEntrada = !ultimaMarcHoy || ultimaMarcHoy.tipo === 'salida'
  const puedeMarcarSalida  = !!ultimaMarcHoy && ultimaMarcHoy.tipo === 'entrada'

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
      const diaHoy = ahora.toISOString().split('T')[0]
      await supabase.from('marcaciones').insert({
        empleado_id: empleado.id, tipo, fecha: diaHoy, hora: ahora.toISOString(),
        latitud: lat, longitud: lon, precision_metros: precision,
        dentro_del_area: dentroDelArea, distancia_metros: Math.round(distancia),
        dispositivo: navigator.userAgent.includes('Mobile') ? 'móvil' : 'escritorio',
      })
      const { data: turnoHoy } = await supabase.from('turnos').select('id')
        .eq('empleado_id', empleado.id).eq('fecha', diaHoy).single()
      if (turnoHoy) {
        const upd: any = { estado: 'presente' }
        if (tipo === 'entrada') upd.hora_entrada_real = horaLocal
        else upd.hora_salida_real = horaLocal
        await supabase.from('turnos').update(upd).eq('id', turnoHoy.id)
      }
      onRefresh()
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
      setOpenLic(false)
      setLicForm({})
      onRefresh()
    } finally { setSavingLic(false) }
  }

  return (
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
            onClick={() => marcarAsistencia('entrada')} loading={marcando} disabled={!puedeMarcarEntrada}>
            {entradaHoy ? '✓ Entrada registrada' : '🟢 Marcar entrada'}
          </Button>
          <Button style={{ flex: 1, justifyContent: 'center', background: salidaHoy ? 'var(--red-500)' : 'var(--red-600)', fontSize: '15px', padding: '12px' }}
            onClick={() => marcarAsistencia('salida')} loading={marcando} disabled={!puedeMarcarSalida}>
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
                        ✓ Entrada: {t.hora_entrada_real.substring(0, 5)} {t.hora_salida_real ? `· Salida: ${t.hora_salida_real.substring(0, 5)}` : ''}
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
