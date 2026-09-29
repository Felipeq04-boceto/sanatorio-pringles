/**
 * alertas-diarias — Edge Function programada via pg_cron
 *
 * Asume el siguiente esquema de marcaciones:
 *   marcaciones(id, empleado_id, fecha, hora, tipo)
 *   tipo: 'entrada' | 'salida'
 *
 *   turnos(id, empleado_id, fecha, hora_inicio, hora_fin)
 *   empleados(id, nombre, apellido, legajo, email)
 *   configuracion(clave, valor)  — clave: 'email_admin', 'minutos_tolerancia'
 *
 * Se invoca desde pg_cron todos los días laborables a las 09:00 AR:
 *   SELECT cron.schedule('alertas-diarias', '0 12 * * 1-6', $$
 *     SELECT net.http_post(
 *       url := 'https://<PROJECT>.supabase.co/functions/v1/alertas-diarias',
 *       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}',
 *       body := '{}'
 *     );
 *   $$);
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SEND_EMAIL_URL           = `${SUPABASE_URL}/functions/v1/send-email`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Configuración ─────────────────────────────────────────────────────────
    const { data: cfg } = await supabase.from('configuracion').select('clave,valor')
    const config = (cfg ?? []).reduce((acc: Record<string, string>, c) => {
      acc[c.clave] = c.valor; return acc
    }, {})

    const emailAdmin       = config['email_admin']
    const toleranciaMinutos = parseInt(config['minutos_tolerancia'] ?? '15', 10)

    if (!emailAdmin) {
      console.warn('alertas-diarias: email_admin no configurado en tabla configuracion')
      return new Response('email_admin faltante', { status: 200 })
    }

    // ── Fecha de ayer ──────────────────────────────────────────────────────────
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    const fechaAyer = ayer.toISOString().split('T')[0]
    const diaAyer   = ayer.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })

    // ── Turno + marcaciones de ayer ────────────────────────────────────────────
    const { data: turnosAyer } = await supabase
      .from('turnos')
      .select('*, empleados(id, nombre, apellido, legajo, email)')
      .eq('fecha', fechaAyer)

    if (!turnosAyer || turnosAyer.length === 0) {
      return new Response(JSON.stringify({ ok: true, msg: 'Sin turnos ayer' }), { status: 200 })
    }

    const { data: marcaciones } = await supabase
      .from('marcaciones')
      .select('*')
      .eq('fecha', fechaAyer)

    const entradas = (marcaciones ?? []).filter(m => m.tipo === 'entrada')
    const salidas  = (marcaciones ?? []).filter(m => m.tipo === 'salida')

    interface AlertaTarde {
      empleado: string
      legajo: string
      turnoInicio: string
      marcacion: string
      demora: number
    }

    interface AlertaSinSalida {
      empleado: string
      legajo: string
      turnoFin: string
    }

    const tarde: AlertaTarde[]       = []
    const sinSalida: AlertaSinSalida[] = []

    for (const turno of turnosAyer) {
      const emp = turno.empleados
      if (!emp) continue

      const nombre = `${emp.nombre} ${emp.apellido}`
      const legajo = emp.legajo ?? '—'

      // ── Llegada tarde ──────────────────────────────────────────────────────
      const entradaEmp = entradas.find(m => m.empleado_id === emp.id)
      if (entradaEmp && turno.hora_inicio) {
        const [hi, mi] = turno.hora_inicio.split(':').map(Number)
        const [hm, mm] = entradaEmp.hora.split(':').map(Number)
        const minutosEsperados = hi * 60 + mi
        const minutosReales    = hm * 60 + mm
        const demora = minutosReales - minutosEsperados

        if (demora > toleranciaMinutos) {
          tarde.push({
            empleado: nombre,
            legajo,
            turnoInicio: turno.hora_inicio,
            marcacion: entradaEmp.hora,
            demora,
          })
        }
      }

      // ── Sin salida ─────────────────────────────────────────────────────────
      const salidaEmp = salidas.find(m => m.empleado_id === emp.id)
      if (!salidaEmp && turno.hora_fin) {
        sinSalida.push({
          empleado: nombre,
          legajo,
          turnoFin: turno.hora_fin,
        })
      }
    }

    // ── Si no hay novedades, no enviar email ───────────────────────────────────
    if (tarde.length === 0 && sinSalida.length === 0) {
      return new Response(JSON.stringify({ ok: true, msg: 'Sin novedades' }), { status: 200 })
    }

    // ── Construir HTML ─────────────────────────────────────────────────────────
    const rowsTarde = tarde.map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.empleado}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.legajo}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.turnoInicio}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.marcacion}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#dc2626;font-weight:600">+${r.demora} min</td>
      </tr>`).join('')

    const rowsSinSalida = sinSalida.map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.empleado}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.legajo}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.turnoFin}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#dc2626;font-weight:600">❌ Sin marcación</td>
      </tr>`).join('')

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#f9fafb">
  <div style="max-width:640px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:700">🏥 Sanatorio Pringles</h1>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Reporte de asistencia — ${diaAyer}</p>
    </div>
    <div style="padding:24px 32px">

      ${tarde.length > 0 ? `
      <h2 style="font-size:15px;font-weight:700;color:#b45309;margin:0 0 12px">
        ⚠️ Llegadas tarde (${tarde.length})
      </h2>
      <p style="font-size:13px;color:#6b7280;margin:0 0 12px">
        Tolerancia configurada: ${toleranciaMinutos} minutos
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px">
        <thead>
          <tr style="background:#fef3c7">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#92400e">Empleado</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#92400e">Legajo</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#92400e">Turno</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#92400e">Marcó</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#92400e">Demora</th>
          </tr>
        </thead>
        <tbody>${rowsTarde}</tbody>
      </table>` : ''}

      ${sinSalida.length > 0 ? `
      <h2 style="font-size:15px;font-weight:700;color:#dc2626;margin:0 0 12px">
        🚨 Sin marcación de salida (${sinSalida.length})
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px">
        <thead>
          <tr style="background:#fee2e2">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#991b1b">Empleado</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#991b1b">Legajo</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#991b1b">Fin de turno</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#991b1b">Estado</th>
          </tr>
        </thead>
        <tbody>${rowsSinSalida}</tbody>
      </table>` : ''}

      <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;border-top:1px solid #f3f4f6;padding-top:16px">
        Generado automáticamente por el sistema de RRHH · Sanatorio Pringles
      </p>
    </div>
  </div>
</body>
</html>`

    // ── Enviar email ────────────────────────────────────────────────────────────
    const sendRes = await fetch(SEND_EMAIL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: emailAdmin,
        subject: `📋 Reporte de asistencia — ${diaAyer}${tarde.length > 0 ? ` (${tarde.length} tarde${tarde.length > 1 ? 's' : ''})` : ''}`,
        html,
      }),
    })

    const sendData = await sendRes.json()
    console.log('Email enviado:', sendData)

    return new Response(JSON.stringify({
      ok: true,
      tarde: tarde.length,
      sinSalida: sinSalida.length,
      emailId: sendData.id,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('alertas-diarias error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
