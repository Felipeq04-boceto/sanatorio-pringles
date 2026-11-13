-- =====================================================================
-- Avisos automáticos de encuestas con alerta (WhatsApp + email)
-- =====================================================================

create extension if not exists pg_net with schema extensions;

alter table public.encuestas_respuestas add column if not exists aviso_enviado_at timestamptz;
alter table public.encuestas_respuestas add column if not exists aviso_resultado text;

-- Secreto compartido entre el trigger y la Edge Function (se genera acá, nunca sale de la base)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'encuestas_aviso_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'encuestas_aviso_secret',
      'Autoriza al trigger de encuestas a llamar a la función encuestas-aviso'
    );
  end if;
end $$;

-- La Edge Function valida el secreto con esta función (solo service_role puede usarla)
create or replace function public.encuestas_aviso_valido(p_secret text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
    where name = 'encuestas_aviso_secret' and decrypted_secret = p_secret
  );
$$;
revoke all on function public.encuestas_aviso_valido(text) from public, anon, authenticated;
grant execute on function public.encuestas_aviso_valido(text) to service_role;

-- Trigger: cada encuesta con alerta dispara el aviso
create or replace function public.encuestas_disparar_aviso()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_secret text;
begin
  if new.requiere_alerta then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'encuestas_aviso_secret';
    perform net.http_post(
      url := 'https://chwcytrexetekcryndqy.supabase.co/functions/v1/encuestas-aviso',
      body := jsonb_build_object('id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-aviso-secret', coalesce(v_secret, '')),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end;
$$;

drop trigger if exists encuestas_aviso_trg on public.encuestas_respuestas;
create trigger encuestas_aviso_trg
  after insert on public.encuestas_respuestas
  for each row execute function public.encuestas_disparar_aviso();
