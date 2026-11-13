-- =====================================================================
-- Encuestas de satisfacción · Sanatorio Integral de la Comunidad
-- Internación + ambulatorio, respuesta pública (sin login) vía RPC.
-- =====================================================================

-- 1) Quiénes pueden ver y gestionar respuestas (Dirección, Calidad, Jefatura de Enfermería)
create table if not exists public.encuestas_gestores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.encuestas_gestores enable row level security;

create or replace function public.es_gestor_encuestas()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.encuestas_gestores g where g.user_id = auth.uid());
$$;

drop policy if exists "gestores_se_ven" on public.encuestas_gestores;
create policy "gestores_se_ven" on public.encuestas_gestores
  for select to authenticated using (public.es_gestor_encuestas());

-- 2) Invitaciones (un token por envío). NO guardan datos del paciente,
--    así la respuesta sigue siendo anónima; el token solo evita duplicados
--    y precarga el tipo de atención y el canal.
create table if not exists public.encuestas_invitaciones (
  token uuid primary key default gen_random_uuid(),
  tipo text check (tipo in ('internacion','ambulatorio')),
  sector text,
  canal text check (canal in ('whatsapp','email','qr_alta','qr_habitacion','qr_general')),
  creado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  usado_at timestamptz
);
alter table public.encuestas_invitaciones enable row level security;

drop policy if exists "invitaciones_gestores" on public.encuestas_invitaciones;
create policy "invitaciones_gestores" on public.encuestas_invitaciones
  for all to authenticated
  using (public.es_gestor_encuestas())
  with check (public.es_gestor_encuestas());

-- 3) Respuestas
create table if not exists public.encuestas_respuestas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token uuid references public.encuestas_invitaciones(token),
  canal text,
  tipo text not null check (tipo in ('internacion','ambulatorio')),
  respondente text check (respondente in ('paciente','familiar')),
  servicio text,
  respuestas jsonb not null default '{}'::jsonb,
  csat smallint check (csat between 1 and 5),
  nps smallint check (nps between 0 and 10),
  destacar text,
  mejorar text,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  consentimiento_contacto boolean not null default false,
  requiere_alerta boolean not null default false,
  motivos_alerta text[] not null default '{}',
  gestion_estado text not null default 'pendiente'
    check (gestion_estado in ('pendiente','en_curso','resuelta','no_aplica')),
  gestion_notas text,
  gestionada_por uuid references auth.users(id),
  gestionada_at timestamptz
);
create index if not exists encuestas_respuestas_fecha_idx on public.encuestas_respuestas (created_at desc);
create index if not exists encuestas_respuestas_alerta_idx on public.encuestas_respuestas (requiere_alerta, gestion_estado);
alter table public.encuestas_respuestas enable row level security;

drop policy if exists "respuestas_lectura_gestores" on public.encuestas_respuestas;
create policy "respuestas_lectura_gestores" on public.encuestas_respuestas
  for select to authenticated using (public.es_gestor_encuestas());

drop policy if exists "respuestas_gestion_gestores" on public.encuestas_respuestas;
create policy "respuestas_gestion_gestores" on public.encuestas_respuestas
  for update to authenticated
  using (public.es_gestor_encuestas())
  with check (public.es_gestor_encuestas());

-- 4) RPC pública para enviar la encuesta (anon puede ejecutarla, no tocar tablas)
create or replace function public.enviar_encuesta(p_datos jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_token uuid := nullif(p_datos->>'token', '')::uuid;
  v_inv public.encuestas_invitaciones%rowtype;
  v_tipo text := p_datos->>'tipo';
  v_resp jsonb := coalesce(p_datos->'respuestas', '{}'::jsonb);
  v_csat smallint := nullif(p_datos->>'csat', '')::smallint;
  v_nps smallint := nullif(p_datos->>'nps', '')::smallint;
  v_consiente boolean := coalesce((p_datos->>'consentimiento_contacto')::boolean, false);
  v_motivos text[] := '{}';
  v_id uuid;
begin
  if v_tipo not in ('internacion','ambulatorio') then
    raise exception 'Tipo de atención inválido';
  end if;
  if jsonb_typeof(v_resp) <> 'object' or length(v_resp::text) > 10000 then
    raise exception 'Formato de respuestas inválido';
  end if;

  if v_token is not null then
    select * into v_inv from public.encuestas_invitaciones where token = v_token for update;
    if not found then
      raise exception 'Enlace de encuesta inválido';
    end if;
    if v_inv.usado_at is not null then
      raise exception 'ENCUESTA_YA_RESPONDIDA';
    end if;
  end if;

  -- Motivos de alerta
  if v_nps is not null and v_nps <= 6 then
    v_motivos := v_motivos || 'Recomendación baja (NPS 0-6)';
  end if;
  if v_csat is not null and v_csat <= 2 then
    v_motivos := v_motivos || 'Satisfacción general baja';
  end if;
  if exists (
    select 1 from jsonb_each(v_resp) e
    where jsonb_typeof(e.value) = 'number' and (e.value)::text::numeric <= 2
  ) then
    v_motivos := v_motivos || 'Algún aspecto calificado con 1 o 2';
  end if;
  if exists (
    select 1 from jsonb_each_text(v_resp) e
    where e.key in ('seg_identificacion','seg_higiene_manos') and e.value = 'no'
  ) then
    v_motivos := v_motivos || 'Seguridad del paciente: respuesta negativa';
  end if;
  if v_resp->>'alta_sabe_a_quien_llamar' = 'no' then
    v_motivos := v_motivos || 'Alta: no sabía a quién llamar';
  end if;

  insert into public.encuestas_respuestas (
    token, canal, tipo, respondente, servicio, respuestas, csat, nps,
    destacar, mejorar,
    contacto_nombre, contacto_telefono, contacto_email, consentimiento_contacto,
    requiere_alerta, motivos_alerta
  ) values (
    v_token,
    coalesce(v_inv.canal, left(p_datos->>'canal', 30)),
    v_tipo,
    nullif(p_datos->>'respondente', ''),
    left(nullif(p_datos->>'servicio', ''), 60),
    v_resp, v_csat, v_nps,
    left(nullif(p_datos->>'destacar', ''), 2000),
    left(nullif(p_datos->>'mejorar', ''), 2000),
    case when v_consiente then left(nullif(p_datos->>'contacto_nombre', ''), 120) end,
    case when v_consiente then left(nullif(p_datos->>'contacto_telefono', ''), 40) end,
    case when v_consiente then left(nullif(p_datos->>'contacto_email', ''), 160) end,
    v_consiente,
    cardinality(v_motivos) > 0,
    v_motivos
  ) returning id into v_id;

  if v_token is not null then
    update public.encuestas_invitaciones set usado_at = now() where token = v_token;
  end if;

  return v_id;
end;
$$;

revoke all on function public.enviar_encuesta(jsonb) from public;
grant execute on function public.enviar_encuesta(jsonb) to anon, authenticated;

-- 5) Resumen mensual para el tablero (respeta RLS: solo gestores)
create or replace view public.encuestas_resumen_mensual
with (security_invoker = true) as
select
  date_trunc('month', created_at)::date as mes,
  tipo,
  coalesce(servicio, '(sin dato)') as servicio,
  count(*) as respuestas,
  round(avg(csat), 2) as csat_promedio,
  round(
    100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6))
    / nullif(count(nps), 0), 1
  ) as nps,
  count(*) filter (where requiere_alerta) as alertas,
  count(*) filter (where requiere_alerta and gestion_estado = 'pendiente') as alertas_pendientes
from public.encuestas_respuestas
group by 1, 2, 3;
