-- Plan de Socios: leads, conversaciones y configuración del plan
-- Ejecutar en el SQL Editor de Supabase o con `supabase db push`

create type lead_estado as enum (
  'nuevo', 'en_conversacion', 'interesado', 'agendado', 'derivado_humano', 'afiliado', 'perdido'
);

create table if not exists socios_leads (
  id            uuid primary key default gen_random_uuid(),
  telefono      text not null unique,          -- E.164 sin '+', como lo entrega Meta (549291...)
  nombre        text,
  localidad     text,
  grupo_familiar jsonb,                        -- [{"rol":"titular","edad":45}, ...]
  cuota_estimada numeric(12,2),
  estado        lead_estado not null default 'nuevo',
  origen        text default 'whatsapp',
  opt_in        boolean not null default false, -- consentimiento para mensajes (Ley 25.326 / Meta)
  opt_in_at     timestamptz,
  notas         text,
  agendado_para timestamptz,
  motivo_derivacion text,
  ultimo_contacto timestamptz default now(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists socios_conversaciones (
  id          bigserial primary key,
  lead_id     uuid not null references socios_leads(id) on delete cascade,
  rol         text not null check (rol in ('user','assistant')),
  contenido   jsonb not null,                   -- bloques de contenido de la API (texto / tool_use / tool_result)
  wa_message_id text,
  created_at  timestamptz default now()
);
create index on socios_conversaciones (lead_id, created_at);

-- Configuración del plan editable sin redeploy (precios, coberturas, carencias)
create table if not exists socios_plan_config (
  clave   text primary key,
  valor   jsonb not null,
  updated_at timestamptz default now()
);

-- Ejemplo de tarifario: REEMPLAZAR con los valores reales del plan
insert into socios_plan_config (clave, valor) values
  ('tarifario', '{
     "titular": 25000,
     "adicional_adulto": 18000,
     "menor_hasta_17": 9000,
     "adulto_mayor_65": 30000,
     "descuento_grupo_familiar_pct": 10,
     "moneda": "ARS"
   }'),
  ('carencias_dias', '{"consultas": 0, "practicas": 30, "internacion": 90, "cirugias_programadas": 180}')
on conflict (clave) do nothing;

-- RLS: solo la service role (Edge Function) y usuarios con rol comercial acceden
alter table socios_leads enable row level security;
alter table socios_conversaciones enable row level security;
alter table socios_plan_config enable row level security;

-- Ajustar el nombre del claim de rol al que ya usás en la app
create policy "comercial lee leads" on socios_leads
  for select using (auth.jwt() ->> 'rol' in ('admin','comercial'));
create policy "comercial edita leads" on socios_leads
  for update using (auth.jwt() ->> 'rol' in ('admin','comercial'));
create policy "comercial lee conversaciones" on socios_conversaciones
  for select using (auth.jwt() ->> 'rol' in ('admin','comercial'));
create policy "admin config" on socios_plan_config
  for all using (auth.jwt() ->> 'rol' = 'admin');

-- Trigger updated_at
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger socios_leads_updated before update on socios_leads
  for each row execute function set_updated_at();
