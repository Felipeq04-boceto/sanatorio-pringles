/**
 * alerta-stock-minimo — llamada desde el frontend tras cada movimiento de stock
 *
 * Payload: { insumoId: string }
 *
 * Verifica si el insumo quedó por debajo del mínimo y envía email al admin.
 * Fire-and-forget desde el frontend — no bloquea la UI.
 */
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SEND_EMAIL_URL            = `${SUPABASE_URL}/functions/v1/send-email`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { insumoId } = await req.json()
    if (!insumoId) return new Response(JSON.stringify({ error: 'insumoId requerido' }), { status: 400 })

    // Obtener estado del insumo
    const { data: ins } = await supabase
      .from('insumos')
      .select('*, categorias_insumo(nombre)')
      .eq('id', insumoId)
      .single()

    if (!ins) return new Response(JSON.stringify({ error: 'Insumo no encontrado' }), { status: 404 })

    // Solo alertar si está por debajo del mínimo o sin stock
    const sinStock   = ins.stock_actual === 0
    const bajoMinimo = ins.stock_minimo > 0 && ins.stock_actual <= ins.stock_minimo

    if (!sinStock && !bajoMinimo) {
      return new Response(JSON.stringify({ ok: true, alerta: false }), { status: 200 })
    }

    // Obtener email admin
    const { data: cfg } = await supabase.from('configuracion').select('clave,valor')
    const config = (cfg ?? []).reduce((acc: Record<string, string>, c) => { acc[c.clave] = c.valor; return acc }, {})
    const emailAdmin = config['email_admin']
    if (!emailAdmin) return new Response(JSON.stringify({ ok: true, alerta: true, msg: 'Sin email_admin configurado' }), { status: 200 })

    const areaLabel = ins.area === 'quirofano' ? '🔵 Quirófano' : ins.area === 'enfermeria' ? '🟢 Enfermería' : ins.area ?? '—'
    const estadoLabel = sinStock ? '🔴 SIN STOCK' : '🟡 Stock bajo'
    const colorBg = sinStock ? '#fef2f2' : '#fffbeb'
    const colorBorder = sinStock ? '#fecaca' : '#fde68a'
    const colorText = sinStock ? '#991b1b' : '#92400e'

    const html = `
<!DOCTYPE html><html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#f9fafb">
  <div style="max-width:540px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:700">🏥 Sanatorio Pringles</h1>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Alerta de stock</p>
    </div>
    <div style="padding:28px 32px">
      <div style="background:${colorBg};border:1px solid ${colorBorder};border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0;font-size:15px;color:${colorText};font-weight:700">${estadoLabel}: ${ins.nombre}</p>
        <p style="margin:6px 0 0;font-size:13px;color:${colorText}">${areaLabel} · ${ins.categorias_insumo?.nombre ?? '—'}</p>
      </div>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0;color:#6b7280;width:160px">Stock actual</td>
          <td style="padding:10px 0;font-weight:700;font-size:18px;color:${colorText}">${ins.stock_actual} ${ins.unidad_medida}</td>
        </tr>
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">Stock mínimo</td>
          <td style="padding:10px 0;color:#374151">${ins.stock_minimo} ${ins.unidad_medida}</td>
        </tr>
        ${ins.ubicacion ? `<tr style="border-top:1px solid #f3f4f6"><td style="padding:10px 0;color:#6b7280">Ubicación</td><td style="padding:10px 0;color:#374151">${ins.ubicacion}</td></tr>` : ''}
      </table>
      <p style="font-size:13px;color:#374151;margin:20px 0 0">Se recomienda generar un pedido de reposición a la brevedad.</p>
      <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;border-top:1px solid #f3f4f6;padding-top:16px">Sanatorio Pringles · Sistema de Insumos</p>
    </div>
  </div>
</body></html>`

    const r = await fetch(SEND_EMAIL_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: emailAdmin,
        subject: `${estadoLabel.split(' ')[0]} ${sinStock ? 'Sin stock' : 'Stock bajo'}: ${ins.nombre} (${areaLabel.replace(/^[^\w]+/, '')})`,
        html,
      }),
    })
    const result = await r.json()
    return new Response(JSON.stringify({ ok: true, alerta: true, emailId: result.id }), { status: 200 })

  } catch (err) {
    console.error('alerta-stock-minimo:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
