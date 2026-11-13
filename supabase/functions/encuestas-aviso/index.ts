// Edge Function: encuestas-aviso
// La llama un trigger de la base cuando entra una encuesta con alerta.
// Urgentes (paciente todavía internado): WhatsApp + email.
// Resto de las alertas: solo email (AVISO_EMAIL_SOLO_URGENTES=true para desactivarlo).
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://sanatorio-pringles.vercel.app'
const WA_TOKEN = Deno.env.get('WA_TOKEN') ?? ''
const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID') ?? ''
const WA_DESTINO = Deno.env.get('AVISO_WA_DESTINO') ?? ''
const WA_TEMPLATE = Deno.env.get('WA_TEMPLATE_AVISO') ?? '' // plantilla aprobada en Meta (opcional)
const WA_TEMPLATE_IDIOMA = Deno.env.get('WA_TEMPLATE_IDIOMA') ?? 'es_AR'
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const EMAIL_DESTINO = Deno.env.get('AVISO_EMAIL_DESTINO') ?? ''
const EMAIL_FROM = Deno.env.get('AVISO_EMAIL_FROM') ?? 'Encuestas Sanatorio <onboarding@resend.dev>'
const EMAIL_SOLO_URGENTES = (Deno.env.get('AVISO_EMAIL_SOLO_URGENTES') ?? 'false') === 'true'

const SERVICIOS: Record<string, string> = {
  consultorio: 'Consultorio externo', guardia: 'Guardia', laboratorio: 'Laboratorio', rayos: 'Rayos',
  ecografia: 'Ecografía', kinesiologia: 'Kinesiología', administracion: 'Administración', otro: 'Otro',
  clinica_medica: 'Clínica médica', cirugia: 'Cirugía', terapia_intensiva: 'Terapia intensiva',
  maternidad: 'Maternidad', pediatria: 'Pediatría',
}

// Parámetros de plantilla de WhatsApp: sin saltos de línea ni espacios repetidos
const limpiar = (t: string, max: number) => t.replace(/\s+/g, ' ').trim().slice(0, max) || '-'
const escaparHtml = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

Deno.serve(async (req) => {
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: valido } = await supa.rpc('encuestas_aviso_valido', { p_secret: req.headers.get('x-aviso-secret') ?? '' })
  if (!valido) return new Response('No autorizado', { status: 401 })

  let id = ''
  try { id = (await req.json()).id } catch { /* cuerpo inválido */ }
  if (!id) return new Response('Falta id', { status: 400 })

  const { data: r, error } = await supa.from('encuestas_respuestas').select('*').eq('id', id).single()
  if (error || !r) return new Response('Encuesta no encontrada', { status: 404 })
  if (!r.requiere_alerta || r.aviso_enviado_at) return new Response('Nada para avisar', { status: 200 })

  const servicio = r.tipo === 'internacion'
    ? `Internación${r.respuestas?.int_sector ? ` (${SERVICIOS[r.respuestas.int_sector] ?? r.respuestas.int_sector})` : ''}`
    : SERVICIOS[r.servicio] ?? r.servicio ?? 'Servicio sin indicar'
  const habitacion = r.lugar?.startsWith('hab-') ? `Habitación ${r.lugar.slice(4)}` : ''
  const donde = [servicio, habitacion].filter(Boolean).join(' · ')
  const motivos: string[] = (r.motivos_alerta ?? []).filter((m: string) => !m.startsWith('URGENTE'))
  const comentario = (r.mejorar ?? '').trim()
  const pideContacto = r.consentimiento_contacto && (r.contacto_telefono || r.contacto_email)
  const enlace = `${APP_URL}/encuestas`
  const resultado: string[] = []

  // ── WhatsApp (solo urgentes) ──────────────────────────────────────────
  if (r.urgente && WA_TOKEN && WA_PHONE_ID && WA_DESTINO) {
    const cuerpo = WA_TEMPLATE
      ? {
          messaging_product: 'whatsapp', to: WA_DESTINO, type: 'template',
          template: {
            name: WA_TEMPLATE, language: { code: WA_TEMPLATE_IDIOMA },
            components: [{ type: 'body', parameters: [
              { type: 'text', text: limpiar(donde, 120) },
              { type: 'text', text: limpiar(motivos.join(', '), 300) },
              { type: 'text', text: limpiar(comentario || 'Sin comentario', 400) },
            ] }],
          },
        }
      : {
          messaging_product: 'whatsapp', to: WA_DESTINO, type: 'text',
          text: { body: [
            '🚨 *Encuesta URGENTE – paciente internado*',
            `📍 ${donde}`,
            motivos.length ? `⚠️ ${motivos.join(' · ')}` : '',
            comentario ? `💬 "${comentario.slice(0, 500)}"` : '',
            pideContacto ? '📞 Pidió que lo contacten (datos en la app)' : '',
            `👉 ${enlace}`,
          ].filter(Boolean).join('\n') },
        }
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const txt = await res.text()
      resultado.push(res.ok ? 'whatsapp: ok' : `whatsapp: error ${res.status} ${txt.slice(0, 300)}`)
    } catch (e) {
      resultado.push(`whatsapp: error ${String(e).slice(0, 200)}`)
    }
  } else if (r.urgente) {
    resultado.push('whatsapp: sin configurar')
  }

  // ── Email ─────────────────────────────────────────────────────────────
  if ((r.urgente || !EMAIL_SOLO_URGENTES) && RESEND_KEY && EMAIL_DESTINO) {
    const asunto = r.urgente ? `🚨 URGENTE: encuesta de paciente internado – ${donde}` : `Alerta de encuesta – ${donde}`
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;color:#1C2B36">
        <h2 style="color:${r.urgente ? '#B42318' : '#3A6B67'};margin:0 0 12px">${r.urgente ? 'Encuesta urgente: el paciente sigue internado' : 'Nueva alerta de encuesta'}</h2>
        <p style="margin:0 0 8px"><strong>Lugar:</strong> ${escaparHtml(donde)}</p>
        <p style="margin:0 0 8px"><strong>Fecha:</strong> ${new Date(r.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
        ${motivos.length ? `<p style="margin:0 0 8px"><strong>Motivos:</strong></p><ul style="margin:0 0 12px">${motivos.map(m => `<li>${escaparHtml(m)}</li>`).join('')}</ul>` : ''}
        <p style="margin:0 0 8px"><strong>Satisfacción:</strong> ${r.csat ?? '—'} / 5 &nbsp; <strong>Recomendación:</strong> ${r.nps ?? '—'} / 10</p>
        ${comentario ? `<p style="margin:12px 0 4px"><strong>Qué deberíamos mejorar:</strong></p><blockquote style="margin:0;padding:8px 12px;background:#F1F4F3;border-left:3px solid #3A6B67">${escaparHtml(comentario)}</blockquote>` : ''}
        ${pideContacto ? '<p style="margin:12px 0 0"><strong>Pidió que lo contacten.</strong> Los datos están en la app.</p>' : ''}
        <p style="margin:20px 0"><a href="${enlace}" style="background:#3A6B67;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir encuestas en la app</a></p>
        <p style="font-size:12px;color:#6B8480">Sanatorio Integral de la Comunidad · El Sanatorio te escucha</p>
      </div>`
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: EMAIL_DESTINO.split(',').map(s => s.trim()), subject: asunto, html }),
      })
      const txt = await res.text()
      resultado.push(res.ok ? 'email: ok' : `email: error ${res.status} ${txt.slice(0, 300)}`)
    } catch (e) {
      resultado.push(`email: error ${String(e).slice(0, 200)}`)
    }
  } else if (r.urgente || !EMAIL_SOLO_URGENTES) {
    resultado.push('email: sin configurar')
  }

  await supa.from('encuestas_respuestas')
    .update({ aviso_enviado_at: new Date().toISOString(), aviso_resultado: resultado.join(' | ') })
    .eq('id', id)

  return new Response(JSON.stringify({ resultado }), { headers: { 'Content-Type': 'application/json' } })
})
