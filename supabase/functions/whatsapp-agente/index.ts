// Supabase Edge Function: agente comercial del Plan de Socios por WhatsApp
// Meta Cloud API webhook -> Claude con tools -> respuesta por WhatsApp
// Deploy: supabase functions deploy whatsapp-agente --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const WA_TOKEN = Deno.env.get("WA_TOKEN")!;
const WA_PHONE_ID = Deno.env.get("WA_PHONE_ID")!;
const WA_VERIFY_TOKEN = Deno.env.get("WA_VERIFY_TOKEN")!;
const HUMANO_TELEFONO = Deno.env.get("HUMANO_TELEFONO"); // asesor que recibe derivaciones y agendas
const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-5";
const MAX_HISTORIA = 30; // mensajes de contexto por conversación

// ---------- Tools que el agente puede usar ----------
const tools = [
  {
    name: "calcular_cuota",
    description: "Calcula la cuota mensual del plan según el grupo familiar. Usar siempre que la persona pregunte precio o dé las edades. Nunca dar precios de memoria.",
    input_schema: {
      type: "object",
      properties: {
        integrantes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rol: { type: "string", enum: ["titular", "conyuge", "hijo", "otro"] },
              edad: { type: "integer" },
            },
            required: ["rol", "edad"],
          },
        },
      },
      required: ["integrantes"],
    },
  },
  {
    name: "guardar_lead",
    description: "Guarda o actualiza datos del interesado. Llamar apenas se sepa el nombre y cada vez que aparezca un dato nuevo (localidad, nivel de interés, objeciones).",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        localidad: { type: "string" },
        estado: { type: "string", enum: ["en_conversacion", "interesado", "perdido"] },
        notas: { type: "string", description: "Resumen breve: qué le interesa, objeciones, cobertura actual (obra social, prepaga, nada). Sin datos de salud." },
      },
    },
  },
  {
    name: "agendar_contacto",
    description: "Agenda una llamada o visita al sanatorio con un asesor. Pedir antes día y franja horaria preferida.",
    input_schema: {
      type: "object",
      properties: {
        fecha_hora: { type: "string", description: "ISO 8601 con offset -03:00 (America/Argentina/Buenos_Aires)" },
        modalidad: { type: "string", enum: ["llamada", "visita_sanatorio"] },
      },
      required: ["fecha_hora", "modalidad"],
    },
  },
  {
    name: "derivar_humano",
    description: "Pasa la conversación a un asesor humano. Usar si la persona lo pide, si hay una situación médica compleja, un reclamo, o una pregunta cuya respuesta no está en la información del plan.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
];

// ---------- Ejecución de tools ----------
async function ejecutarTool(nombre: string, input: any, lead: any) {
  switch (nombre) {
    case "calcular_cuota": {
      const { data } = await supabase.from("socios_plan_config").select("valor").eq("clave", "tarifario").single();
      const t = data!.valor;
      const integrantes = input.integrantes ?? [];
      const adultos = integrantes.filter((p: any) => p.edad >= 18).length;
      const menores = integrantes.filter((p: any) => p.edad < 18).length;

      // Escala de valores: Individual (1 persona), Familiar (2 adultos + 2 menores),
      // y adicionales por persona. Se cotiza la combinación más conveniente.
      const opciones: { detalle: string[]; total: number }[] = [];

      if (adultos === 0 && menores >= 1) {
        const detalle = [`Menor sin adulto a cargo: $${t.menor_solo.toLocaleString("es-AR")}`];
        let total = t.menor_solo;
        if (menores > 1) {
          const extra = (menores - 1) * t.adicional_menor;
          detalle.push(`${menores - 1} menor/es adicional/es: $${extra.toLocaleString("es-AR")}`);
          total += extra;
        }
        opciones.push({ detalle, total });
      }

      if (adultos >= 1) {
        // Opción A: base individual + adicionales
        const detA = [`Plan Individual: $${t.individual.toLocaleString("es-AR")}`];
        let totA = t.individual;
        if (adultos > 1) {
          const extra = (adultos - 1) * t.adicional_adulto;
          detA.push(`${adultos - 1} adulto/s adicional/es: $${extra.toLocaleString("es-AR")}`);
          totA += extra;
        }
        if (menores > 0) {
          const extra = menores * t.adicional_menor;
          detA.push(`${menores} menor/es: $${extra.toLocaleString("es-AR")}`);
          totA += extra;
        }
        opciones.push({ detalle: detA, total: totA });

        // Opción B: plan familiar (cubre 2 adultos + 2 menores) + adicionales
        if (adultos >= 2) {
          const detB = [`Plan Familiar (2 adultos + 2 menores): $${t.familiar.toLocaleString("es-AR")}`];
          let totB = t.familiar;
          if (adultos > 2) {
            const extra = (adultos - 2) * t.adicional_adulto;
            detB.push(`${adultos - 2} adulto/s adicional/es: $${extra.toLocaleString("es-AR")}`);
            totB += extra;
          }
          if (menores > 2) {
            const extra = (menores - 2) * t.adicional_menor;
            detB.push(`${menores - 2} menor/es adicional/es: $${extra.toLocaleString("es-AR")}`);
            totB += extra;
          }
          opciones.push({ detalle: detB, total: totB });
        }
      }

      if (!opciones.length) return { error: "Faltan los datos del grupo familiar" };
      const mejor = opciones.reduce((a, b) => (b.total < a.total ? b : a));

      await supabase.from("socios_leads").update({
        grupo_familiar: integrantes, cuota_estimada: mejor.total,
      }).eq("id", lead.id);
      return {
        composicion: `${adultos} adulto/s y ${menores} menor/es`,
        detalle: mejor.detalle,
        total_mensual: mejor.total,
        moneda: t.moneda,
      };
    }
    case "guardar_lead": {
      await supabase.from("socios_leads").update({ ...input, ultimo_contacto: new Date().toISOString() }).eq("id", lead.id);
      return { ok: true };
    }
    case "agendar_contacto": {
      await supabase.from("socios_leads").update({
        estado: "agendado", agendado_para: input.fecha_hora,
        notas: `${lead.notas ?? ""}\nAgendado: ${input.modalidad} ${input.fecha_hora}`.trim(),
      }).eq("id", lead.id);
      if (HUMANO_TELEFONO) {
        await enviarWhatsApp(HUMANO_TELEFONO,
          `📅 Nuevo agendado: ${lead.nombre ?? lead.telefono} — ${input.modalidad} ${input.fecha_hora}. Tel: ${lead.telefono}`);
      }
      return { ok: true, confirmado: input.fecha_hora };
    }
    case "derivar_humano": {
      await supabase.from("socios_leads").update({
        estado: "derivado_humano", motivo_derivacion: input.motivo,
      }).eq("id", lead.id);
      if (HUMANO_TELEFONO) {
        await enviarWhatsApp(HUMANO_TELEFONO,
          `🙋 Derivación: ${lead.nombre ?? lead.telefono} (${lead.telefono}). Motivo: ${input.motivo}`);
      }
      return { ok: true, mensaje: "Un asesor va a continuar la conversación" };
    }
    default:
      return { error: "tool desconocida" };
  }
}

// ---------- Prompt del sistema (lee la config del plan desde la DB) ----------
async function systemPrompt() {
  const { data } = await supabase.from("socios_plan_config").select("clave, valor");
  const cfg = Object.fromEntries((data ?? []).map((r) => [r.clave, r.valor]));
  const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "full" });
  return `Sos el asesor comercial del Plan de Socios del Sanatorio Integral de la Comunidad (Coronel Pringles, Buenos Aires). Hoy es ${hoy}.
Hablás por WhatsApp: mensajes cortos, tono cercano y argentino (voseo), sin markdown ni listas largas, máximo 4 líneas por mensaje salvo que te pidan detalle.

Tu objetivo: que la persona entienda el plan, sepa cuánto le costaría y dé el siguiente paso (afiliarse, agendar una llamada o visitar el sanatorio).

INFORMACIÓN DEL PLAN (única fuente de verdad; si algo no está acá, decilo y usá derivar_humano):
${cfg.descripcion_plan ?? "[COMPLETAR socios_plan_config.descripcion_plan: qué cubre, qué no, cómo se usa, horarios, cómo darse de alta, medios de pago]"}

Carencias (días desde el alta): ${JSON.stringify(cfg.carencias_dias)}
Precios: siempre con calcular_cuota, nunca de memoria.

REGLAS:
- Saludá, preguntá el nombre y desde dónde escribe. Guardá con guardar_lead apenas sepas el nombre.
- Para cotizar pedí edad de cada integrante (de a poco, sin interrogar) y usá calcular_cuota.
- No prometas cobertura de casos médicos puntuales ni des opinión médica. Situaciones médicas complejas o reclamos: derivar_humano.
- No pidas DNI, datos bancarios ni datos de salud por acá. Si la persona cuenta datos de salud, no los repitas ni los anotes: decile que eso va en la declaración jurada al afiliarse.
- Si dice que no le interesa, agradecé, cerrá y guardar_lead estado=perdido. No insistas.
- Si pide hablar con una persona: derivar_humano sin discutir.
- Si pide que no le escriban más, confirmalo y cerrá.`;
}

// ---------- Llamada a Claude con loop de tools ----------
async function responder(lead: any, historial: any[]) {
  const system = await systemPrompt();
  const messages = [...historial];
  for (let i = 0; i < 6; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system, tools, messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    await supabase.from("socios_conversaciones").insert({ lead_id: lead.id, rol: "assistant", contenido: data.content });
    messages.push({ role: "assistant", content: data.content });

    if (data.stop_reason !== "tool_use") {
      return data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    }
    const results = [];
    for (const b of data.content.filter((b: any) => b.type === "tool_use")) {
      const out = await ejecutarTool(b.name, b.input, lead);
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
    }
    await supabase.from("socios_conversaciones").insert({ lead_id: lead.id, rol: "user", contenido: results });
    messages.push({ role: "user", content: results });
  }
  return "Dame un momento que lo confirmo con un asesor.";
}

// ---------- WhatsApp Cloud API ----------
// Argentina: WhatsApp identifica a los celulares como 549XXXXXXXXXX, pero la API
// de Meta sólo acepta enviar a 54XXXXXXXXXX (sin el 9). Probamos sin el 9 y,
// si falla, reintentamos con el número tal cual vino.
function variantesDestino(to: string): string[] {
  if (/^549\d{10}$/.test(to)) return ["54" + to.slice(3), to];
  return [to];
}

async function postWhatsApp(to: string, text: string) {
  const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${WA_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  return { ok: r.ok, body: await r.text() };
}

async function enviarWhatsApp(to: string, text: string) {
  for (const destino of variantesDestino(to)) {
    const res = await postWhatsApp(destino, text);
    if (res.ok) return;
    console.error(`WA error (to=${destino})`, res.body);
  }
}

async function obtenerLead(telefono: string, nombrePerfil?: string) {
  const { data } = await supabase.from("socios_leads").select("*").eq("telefono", telefono).maybeSingle();
  if (data) return data;
  const { data: nuevo } = await supabase.from("socios_leads").insert({
    telefono, nombre: nombrePerfil ?? null, estado: "en_conversacion",
    opt_in: true, opt_in_at: new Date().toISOString(), // escribió primero: opt-in
  }).select().single();
  return nuevo;
}

async function cargarHistorial(leadId: string) {
  const { data } = await supabase.from("socios_conversaciones")
    .select("rol, contenido").eq("lead_id", leadId)
    .order("created_at", { ascending: false }).limit(MAX_HISTORIA);
  const msgs = (data ?? []).reverse().map((m) => ({ role: m.rol, content: m.contenido }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift(); // debe empezar con user
  return msgs;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificación del webhook (Meta la hace una vez al configurarlo)
  if (req.method === "GET") {
    if (url.searchParams.get("hub.verify_token") === WA_VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  const body = await req.json();
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg || msg.type !== "text") return new Response("ok"); // statuses, audio, imágenes, etc.

  const telefono = msg.from as string;
  const texto = msg.text.body as string;
  const nombrePerfil = value?.contacts?.[0]?.profile?.name;

  // Idempotencia: Meta reintenta webhooks
  const { data: dup } = await supabase.from("socios_conversaciones").select("id").eq("wa_message_id", msg.id).maybeSingle();
  if (dup) return new Response("ok");

  try {
    const lead = await obtenerLead(telefono, nombrePerfil);
    if (lead.estado === "derivado_humano") return new Response("ok"); // el bot se calla

    await supabase.from("socios_conversaciones").insert({
      lead_id: lead.id, rol: "user", wa_message_id: msg.id, contenido: [{ type: "text", text: texto }],
    });
    const historial = await cargarHistorial(lead.id);
    const respuesta = await responder(lead, historial);
    if (respuesta) await enviarWhatsApp(telefono, respuesta);
    await supabase.from("socios_leads").update({ ultimo_contacto: new Date().toISOString() }).eq("id", lead.id);
  } catch (e) {
    console.error(e);
  }
  return new Response("ok"); // siempre 200 para que Meta no reintente
});
