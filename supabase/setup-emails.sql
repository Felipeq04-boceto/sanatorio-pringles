-- ============================================================
-- SETUP: Notificaciones por email — Sanatorio Pringles
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Email del administrador (destinatario de las alertas)
--    Cambiá el valor por el email real del RRHH / dirección
INSERT INTO configuracion (clave, valor)
VALUES ('email_admin', 'rrhh@sanatoriopringles.com')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- 2. Minutos de tolerancia para considerar llegada tarde (default 15)
INSERT INTO configuracion (clave, valor)
VALUES ('minutos_tolerancia', '15')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- ============================================================
-- 3. Habilitar pg_net (para pg_cron → Edge Functions)
--    Solo si no está habilitada ya
-- ============================================================
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 4. Programar alerta diaria con pg_cron
--    Se ejecuta todos los días lunes a sábado a las 09:00 (hora AR = UTC-3 → 12:00 UTC)
--    Reemplazá <PROJECT_REF> por el ID del proyecto Supabase
--    y <SERVICE_ROLE_KEY> por la clave Service Role (Settings → API)
-- ============================================================
/*
SELECT cron.schedule(
  'alertas-diarias-asistencia',
  '0 12 * * 1-6',
  $$
    SELECT net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/alertas-diarias',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $$
);
*/

-- Para ver las tareas programadas:
-- SELECT * FROM cron.job;

-- Para desactivar:
-- SELECT cron.unschedule('alertas-diarias-asistencia');

-- ============================================================
-- 5. Variable de entorno RESEND_API_KEY
--    No va en SQL — se configura en:
--    Supabase Dashboard → Edge Functions → Secrets
--    Nombre:  RESEND_API_KEY
--    Valor:   re_xxxxxxxxxxxx  (tu API key de resend.com)
--
--    También podés agregarla con la CLI:
--    supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
-- ============================================================

-- ============================================================
-- 6. FROM_EMAIL (opcional — si tu dominio en Resend es distinto)
--    Supabase Dashboard → Edge Functions → Secrets
--    Nombre:  FROM_EMAIL
--    Valor:   Sanatorio Pringles <no-reply@tudominio.com>
-- ============================================================
