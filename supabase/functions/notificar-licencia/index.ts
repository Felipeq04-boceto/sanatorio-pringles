/**
 * notificar-licencia — Edge Function llamada desde el frontend
 * cuando un empleado crea una solicitud de licencia.
 *
 * Payload esperado:
 * {
 *   licenciaId: string
 *   empleadoId: string
 *   tipo: string           // e.g. 'vacaciones', 'enfermedad', etc.
 *   fechaInicio: string    // YYYY-MM-DD
 *   fechaFin: string       // YYYY-MM-DD
 *   diasSolicitados: number
 *   motivo?: string
 * }
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SEND_EMAIL_URL            = `${SUPABASE_URL}/functions/v1/send-email`

const TIPOS_LICENCIA: Record<string, string> = {
  vacaciones:    '🏖️ Vacaciones',
  enfermedad:    '🏥 Enfermedad / Accidente',
  maternidad:    '👶 Maternidad / Paternidad',
  estudio:       '📚 Estudio / Examen',
  duelo:         '🕊️ Duelo',
  casamiento:    '💍 Casamiento',
  nacimiento:    '🍼 Nacimiento de hijo',
  sin_goce:      '⏸️ Sin goce de sueldo',
  otro:          '📋 Otro',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const payload = await req.json()
    const { licenciaId, empleadoId, tipo, fechaInicio, fechaFin, diasSolicitados, motivo } = payload

    if (!empleadoId || !tipo || !fechaInicio || !fechaFin) {
      return new Response(JSON.stringify({ error: 'Payload incompleto' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Obtener datos del empleado ─────────────────────────────────────────────
    const { data: emp } = await supabase
      .from('empleados')
      .select('nombre, apellido, legajo, email')
      .eq('id', empleadoId)
      .single()

    if (!emp) {
      return new Response(JSON.stringify({ error: 'Empleado no encontrado' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Configuración ─────────────────────────────────────────────────────────
    const { data: cfg } = await supabase.from('configuracion').select('clave,valor')
    const config = (cfg ?? []).reduce((acc: Record<string, string>, c) => {
      acc[c.clave] = c.valor; return acc
    }, {})
    const emailAdmin = config['email_admin']

    const nombreEmp      = `${emp.nombre} ${emp.apellido}`
    const tipoLabel      = TIPOS_LICENCIA[tipo] ?? tipo
    const fechaInicioFmt = new Date(fechaInicio + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    const fechaFinFmt    = new Date(fechaFin    + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    const hoyFmt         = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

    const results: { admin?: unknown; empleado?: unknown } = {}

    // ── Email al ADMIN ─────────────────────────────────────────────────────────
    if (emailAdmin) {
      const htmlAdmin = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#f9fafb">
  <div style="max-width:580px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:700">🏥 Sanatorio Pringles</h1>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Nueva solicitud de licencia</p>
    </div>
    <div style="padding:28px 32px">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0;font-size:14px;color:#1e40af;font-weight:600">📩 Se recibió una nueva solicitud que requiere tu aprobación.</p>
      </div>

      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0;color:#6b7280;width:140px;vertical-align:top">Empleado</td>
          <td style="padding:10px 0;font-weight:600;color:#111827">${nombreEmp}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Legajo</td>
          <td style="padding:10px 0;color:#111827">${emp.legajo ?? '—'}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Tipo de licencia</td>
          <td style="padding:10px 0;font-weight:600;color:#111827">${tipoLabel}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Período</td>
          <td style="padding:10px 0;color:#111827">${fechaInicioFmt} → ${fechaFinFmt}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Días solicitados</td>
          <td style="padding:10px 0;font-weight:700;font-size:16px;color:#0f172a">${diasSolicitados ?? '—'}</td>
        </tr>
        ${motivo ? `
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280;vertical-align:top">Motivo / Observación</td>
          <td style="padding:10px 0;color:#374151;font-style:italic">${motivo}</td>
        </tr>` : ''}
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Fecha de solicitud</td>
          <td style="padding:10px 0;color:#111827">${hoyFmt}</td>
        </tr>
      </table>

      <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;border-top:1px solid #f3f4f6;padding-top:16px">
        Sanatorio Pringles · Sistema de Recursos Humanos
      </p>
    </div>
  </div>
</body>
</html>`

      const r = await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailAdmin,
          subject: `📋 Licencia solicitada: ${nombreEmp} — ${tipoLabel}`,
          html: htmlAdmin,
        }),
      })
      results.admin = await r.json()
    }

    // ── Email de confirmación al EMPLEADO ──────────────────────────────────────
    if (emp.email) {
      const htmlEmp = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#f9fafb">
  <div style="max-width:580px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:700">🏥 Sanatorio Pringles</h1>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Confirmación de solicitud de licencia</p>
    </div>
    <div style="padding:28px 32px">
      <p style="font-size:15px;color:#111827;margin:0 0 20px">Hola <strong>${emp.nombre}</strong>,</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0;font-size:14px;color:#166534;font-weight:600">✅ Tu solicitud de licencia fue recibida correctamente.</p>
        <p style="margin:6px 0 0;font-size:13px;color:#166534">Quedará pendiente de aprobación por el área de RRHH.</p>
      </div>

      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0;color:#6b7280;width:140px">Tipo de licencia</td>
          <td style="padding:10px 0;font-weight:600;color:#111827">${tipoLabel}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Desde</td>
          <td style="padding:10px 0;color:#111827">${fechaInicioFmt}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Hasta</td>
          <td style="padding:10px 0;color:#111827">${fechaFinFmt}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Días solicitados</td>
          <td style="padding:10px 0;font-weight:700;font-size:16px;color:#0f172a">${diasSolicitados ?? '—'}</td>
        </tr>
      </table>

      <p style="font-size:14px;color:#374151;margin:20px 0 0">
        Podés revisar el estado de tu solicitud en el portal de empleados.
      </p>

      <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;border-top:1px solid #f3f4f6;padding-top:16px">
        Sanatorio Pringles · Portal de Empleados
      </p>
    </div>
  </div>
</body>
</html>`

      const r = await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emp.email,
          subject: `✅ Solicitud de ${tipoLabel.replace(/^[^\w]+/, '')} recibida`,
          html: htmlEmp,
        }),
      })
      results.empleado = await r.json()
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('notificar-licencia error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
