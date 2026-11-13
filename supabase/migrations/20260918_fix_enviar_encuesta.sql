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
  v_hab text := left(nullif(trim(v_resp->>'int_habitacion'), ''), 20);
  v_motivos text[] := array[]::text[];
  v_urgente boolean := false;
  v_id uuid;
begin
  if v_tipo is null or v_tipo not in ('internacion','ambulatorio') then
    raise exception 'Tipo de atención inválido';
  end if;
  if jsonb_typeof(v_resp) <> 'object' or length(v_resp::text) > 10000 then
    raise exception 'Formato de respuestas inválido';
  end if;

  if v_token is not null then
    select * into v_inv from public.encuestas_invitaciones where token = v_token for update;
    if not found then raise exception 'Enlace de encuesta inválido'; end if;
    if v_inv.usado_at is not null then raise exception 'ENCUESTA_YA_RESPONDIDA'; end if;
  end if;

  if v_nps is not null and v_nps <= 6 then
    v_motivos := array_append(v_motivos, 'Recomendación baja (NPS 0-6)');
  end if;
  if v_csat is not null and v_csat <= 2 then
    v_motivos := array_append(v_motivos, 'Satisfacción general baja');
  end if;
  if exists (select 1 from jsonb_each(v_resp) e
             where jsonb_typeof(e.value) = 'number' and (e.value)::text::numeric <= 2) then
    v_motivos := array_append(v_motivos, 'Algún aspecto calificado con 1 o 2');
  end if;
  if exists (select 1 from jsonb_each_text(v_resp) e
             where e.key in ('seg_identificacion','seg_higiene_manos') and e.value = 'no') then
    v_motivos := array_append(v_motivos, 'Seguridad del paciente: respuesta negativa');
  end if;
  if v_resp->>'alta_sabe_a_quien_llamar' = 'no' then
    v_motivos := array_append(v_motivos, 'Alta: no sabía a quién llamar');
  end if;
  if v_resp->>'adm_resuelto' = 'no' then
    v_motivos := array_append(v_motivos, 'Administración: trámite no resuelto');
  end if;

  v_urgente := cardinality(v_motivos) > 0 and coalesce(v_resp->>'int_estado', '') = 'internado';
  if v_urgente then
    v_motivos := array_prepend(
      'URGENTE: paciente todavía internado' || coalesce(' (habitación ' || v_hab || ')', ' (habitación no indicada)'),
      v_motivos);
  end if;

  insert into public.encuestas_respuestas (
    token, canal, lugar, tipo, respondente, servicio, respuestas, csat, nps,
    destacar, mejorar,
    contacto_nombre, contacto_telefono, contacto_email, consentimiento_contacto,
    requiere_alerta, urgente, motivos_alerta
  ) values (
    v_token,
    coalesce(v_inv.canal, left(nullif(p_datos->>'canal', ''), 30)),
    coalesce(case when v_hab is not null then 'hab-' || v_hab end, left(nullif(p_datos->>'lugar', ''), 40)),
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
    v_urgente,
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
notify pgrst, 'reload schema';
