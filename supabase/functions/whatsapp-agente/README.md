# Agente comercial del Plan de Socios — WhatsApp

Meta Cloud API → Supabase Edge Function → Claude (con tools) → respuesta por WhatsApp.
Los leads y conversaciones quedan en Supabase, dentro del mismo proyecto de Sanatorio Pringles.

## Estructura
```
supabase/
  migrations/20260902_plan_socios_leads.sql   # tablas socios_leads, socios_conversaciones, socios_plan_config
  functions/whatsapp-agente/index.ts          # webhook + agente
```

## Requisitos previos (una sola vez)
1. Meta for Developers → app tipo Business → producto WhatsApp. Obtenés `Phone Number ID` y un token permanente (System User en Meta Business Suite).
2. API key de Anthropic (console.anthropic.com).
3. Supabase CLI: `brew install supabase/tap/supabase && supabase login && supabase link --project-ref <ref>`

## Instalación (copiar todo el bloque parado en el repo de Sanatorio Pringles)
```bash
cp -r ~/Downloads/agente-socios/supabase/migrations/* supabase/migrations/
cp -r ~/Downloads/agente-socios/supabase/functions/whatsapp-agente supabase/functions/
supabase db push
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  WA_TOKEN=EAAG... \
  WA_PHONE_ID=1234567890 \
  WA_VERIFY_TOKEN=pringles-socios-2026 \
  HUMANO_TELEFONO=549291XXXXXXX
supabase functions deploy whatsapp-agente --no-verify-jwt
```
(Si no usás migraciones con CLI, pegá el SQL en el SQL Editor del dashboard.)

## Conectar el webhook en Meta
App de Meta → WhatsApp → Configuration → Webhook:
- Callback URL: `https://<project-ref>.supabase.co/functions/v1/whatsapp-agente`
- Verify token: el mismo `WA_VERIFY_TOKEN`
- Suscribirse al campo `messages`.

## Cargar la información real del plan (sin redeploy)
```sql
update socios_plan_config set valor = '{
  "titular": 25000, "adicional_adulto": 18000, "menor_hasta_17": 9000,
  "adulto_mayor_65": 30000, "descuento_grupo_familiar_pct": 10, "moneda": "ARS"
}' where clave = 'tarifario';

update socios_plan_config set valor = '{"consultas":0,"practicas":30,"internacion":90,"cirugias_programadas":180}'
where clave = 'carencias_dias';

insert into socios_plan_config (clave, valor) values ('descripcion_plan', to_jsonb($$
QUÉ CUBRE: ...
QUÉ NO CUBRE: ...
CÓMO SE USA (turnos, guardia, credencial): ...
MEDIOS DE PAGO: ...
CÓMO AFILIARSE: ...
HORARIO DE ATENCIÓN HUMANA / TELÉFONO: ...
$$::text)) on conflict (clave) do update set valor = excluded.valor;
```
Si la lógica de precios es distinta a titular/adicional/menor/mayor, se ajusta `calcular_cuota` en `index.ts`.

## Probar
- Mandar un mensaje desde el número de prueba de Meta.
- Leads: `select nombre, telefono, estado, cuota_estimada, notas from socios_leads order by updated_at desc;`
- Conversación: `select rol, contenido from socios_conversaciones where lead_id = '...' order by created_at;`
- Logs: `supabase functions logs whatsapp-agente`

## Comportamiento
- Cada número nuevo crea un lead con `opt_in = true` (escribió primero).
- Si el lead pasa a `derivado_humano`, el bot deja de responder y el asesor sigue desde WhatsApp Business. Reactivar: `update socios_leads set estado='en_conversacion' where telefono='...'`.
- Agendas y derivaciones avisan por WhatsApp a `HUMANO_TELEFONO`.
- Costo de Claude: centavos de dólar por conversación completa.

## Fase 2
- Panel de leads en la app React (la tabla ya tiene RLS para roles admin/comercial).
- Afiliación online: lead `interesado` → link con datos precargados → DNI + DDJJ + Mercado Pago.
- Mensajes proactivos (recordatorios, seguimiento) requieren plantillas aprobadas por Meta.
