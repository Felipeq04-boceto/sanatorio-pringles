import React from 'react'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Badge, Card, Modal } from '@/components/ui'
import { Select } from '@/components/ui'
import { TIPO_MEDIACION, ESTADO_MED_BADGE, ESTADO_MED_LABEL } from '@/lib/empleado-portal-constants'

interface Props {
  empleado: any
  mediaciones: any[]
  onMediacionCreada: () => void
}

export function SeccionMediaciones({ empleado, mediaciones, onMediacionCreada }: Props) {
  const [openNuevaMed, setOpenNuevaMed] = useState(false)
  const [medForm,      setMedForm]      = useState<any>({})
  const [savingMed,    setSavingMed]    = useState(false)
  const [errorMed,     setErrorMed]     = useState<string | null>(null)
  const [detalleMed,   setDetalleMed]   = useState<any>(null)

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
      onMediacionCreada()
    } finally { setSavingMed(false) }
  }

  return (
    <>
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
    </>
  )
}
