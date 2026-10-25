import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Card, Modal, Spinner } from '@/components/ui'

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

const anioActual = new Date().getFullYear()
const ANIOS = Array.from({ length: 5 }, (_, i) => anioActual - i)

export function RecibosPage() {
  const [recibos,   setRecibos]   = useState<any[]>([])
  const [empleados, setEmpleados] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [openModal, setOpenModal] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [filtroEmp, setFiltroEmp] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAnio,setFiltroAnio]= useState(String(anioActual))

  const [form, setForm] = useState<{
    empleado_id: string; mes: string; anio: string; archivo: File | null
  }>({ empleado_id: '', mes: String(new Date().getMonth() + 1), anio: String(anioActual), archivo: null })

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase
        .from('recibos_sueldo')
        .select('*, empleados(nombre, apellido, legajo)')
        .order('anio', { ascending: false })
        .order('mes',  { ascending: false }),
      supabase
        .from('empleados')
        .select('id, nombre, apellido, legajo')
        .eq('estado', 'activo')
        .order('apellido'),
    ])
    setRecibos(r ?? [])
    setEmpleados(e ?? [])
    setLoading(false)
  }

  async function handleSubir() {
    setError(null)
    if (!form.empleado_id) { setError('Seleccioná un empleado'); return }
    if (!form.archivo)     { setError('Seleccioná un archivo PDF'); return }

    setSaving(true)
    try {
      const ext  = form.archivo.name.split('.').pop()
      const path = `${form.empleado_id}/${form.anio}/${form.mes}/recibo.${ext}`

      // Subir al storage
      const { error: uploadErr } = await supabase.storage
        .from('recibos')
        .upload(path, form.archivo, { upsert: true })

      if (uploadErr) throw uploadErr

      // Registrar en tabla
      const { error: dbErr } = await supabase.from('recibos_sueldo').upsert({
        empleado_id:    form.empleado_id,
        mes:            Number(form.mes),
        anio:           Number(form.anio),
        archivo_path:   path,
        archivo_nombre: form.archivo.name,
        visto_at:       null,
      }, { onConflict: 'empleado_id,mes,anio' })

      if (dbErr) throw dbErr

      setOpenModal(false)
      setForm({ empleado_id: '', mes: String(new Date().getMonth() + 1), anio: String(anioActual), archivo: null })
      await loadAll()
    } catch (e: any) {
      setError(e.message ?? 'Error al subir el recibo')
    } finally {
      setSaving(false)
    }
  }

  async function handleEliminar(recibo: any) {
    if (!confirm(`¿Eliminar el recibo de ${MESES[recibo.mes - 1]} ${recibo.anio} de ${recibo.empleados?.apellido}?`)) return
    await supabase.storage.from('recibos').remove([recibo.archivo_path])
    await supabase.from('recibos_sueldo').delete().eq('id', recibo.id)
    await loadAll()
  }

  async function handleDescargar(recibo: any) {
    const { data } = await supabase.storage
      .from('recibos')
      .createSignedUrl(recibo.archivo_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const filtrados = recibos.filter(r => {
    const emp = r.empleados
    if (filtroEmp && !(`${emp?.nombre} ${emp?.apellido}`.toLowerCase().includes(filtroEmp.toLowerCase()))) return false
    if (filtroMes  && r.mes  !== Number(filtroMes))  return false
    if (filtroAnio && r.anio !== Number(filtroAnio)) return false
    return true
  })

  const vistos    = recibos.filter(r => r.visto_at).length
  const sinVer    = recibos.filter(r => !r.visto_at).length

  return (
    <Page>
      <PageHeader
        title="Recibos de sueldo"
        subtitle={`${recibos.length} recibos cargados · ${vistos} vistos · ${sinVer} sin ver`}
        action={
          <Button onClick={() => { setError(null); setOpenModal(true) }}>
            + Subir recibo
          </Button>
        }
      />

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total cargados', value: recibos.length, color: '#335955' },
          { label: 'Vistos',         value: vistos,         color: '#16a34a' },
          { label: 'Sin ver',        value: sinVer,         color: sinVer > 0 ? '#dc2626' : '#6b7280' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 20px', minWidth: '120px', textAlign: 'center' }}>
            <p style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-2)' }}>{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar empleado…"
          value={filtroEmp}
          onChange={e => setFiltroEmp(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '13px', minWidth: '180px' }}
        />
        <select
          value={filtroMes}
          onChange={e => setFiltroMes(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '13px' }}
        >
          <option value="">Todos los meses</option>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select
          value={filtroAnio}
          onChange={e => setFiltroAnio(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '13px' }}
        >
          <option value="">Todos los años</option>
          {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner size={28} /></div>
      ) : filtrados.length === 0 ? (
        <Card style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ fontSize: '24px', marginBottom: '8px' }}>📄</p>
          <p style={{ color: 'var(--text-2)', fontSize: '14px' }}>No hay recibos cargados todavía</p>
        </Card>
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--slate-50)', borderBottom: '1px solid var(--border)' }}>
                {['Empleado','Legajo','Período','Archivo','Estado','Visto el','Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r, idx) => (
                <tr key={r.id} style={{ borderBottom: idx < filtrados.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                    {r.empleados?.apellido}, {r.empleados?.nombre}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{r.empleados?.legajo ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                    {MESES[r.mes - 1]} {r.anio}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.archivo_nombre}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {r.visto_at ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: '#dcfce7', color: '#16a34a', fontSize: '11px', fontWeight: 600 }}>
                        ✓ Visto
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: '#fef3c7', color: '#d97706', fontSize: '11px', fontWeight: 600 }}>
                        ⏳ Sin ver
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)', fontSize: '12px' }}>
                    {r.visto_at ? new Date(r.visto_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleDescargar(r)}
                        title="Descargar"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ⬇ Ver
                      </button>
                      <button
                        onClick={() => handleEliminar(r)}
                        title="Eliminar"
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', color: '#dc2626' }}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Modal subir */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Subir recibo de sueldo" width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
              <p style={{ color: '#dc2626', fontSize: '13px' }}>⚠️ {error}</p>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Empleado *</label>
            <select
              value={form.empleado_id}
              onChange={e => setForm(f => ({ ...f, empleado_id: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '13px' }}
            >
              <option value="">Seleccionar empleado…</option>
              {empleados.map(e => (
                <option key={e.id} value={e.id}>{e.apellido}, {e.nombre} — Leg. {e.legajo}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Mes *</label>
              <select
                value={form.mes}
                onChange={e => setForm(f => ({ ...f, mes: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '13px' }}
              >
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Año *</label>
              <select
                value={form.anio}
                onChange={e => setForm(f => ({ ...f, anio: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '13px' }}
              >
                {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Archivo PDF *</label>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
                padding: '24px', textAlign: 'center', cursor: 'pointer',
                background: form.archivo ? '#f0fdf4' : 'var(--slate-50)',
                transition: 'background 0.15s',
              }}
            >
              {form.archivo ? (
                <>
                  <p style={{ fontSize: '20px', marginBottom: '4px' }}>📄</p>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>{form.archivo.name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-2)' }}>({(form.archivo.size / 1024).toFixed(0)} KB) — clic para cambiar</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '24px', marginBottom: '6px' }}>⬆️</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>Clic para seleccionar un PDF</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={e => setForm(f => ({ ...f, archivo: e.target.files?.[0] ?? null }))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenModal(false)}>Cancelar</Button>
          <Button onClick={handleSubir} loading={saving}>Subir recibo</Button>
        </div>
      </Modal>
    </Page>
  )
}
