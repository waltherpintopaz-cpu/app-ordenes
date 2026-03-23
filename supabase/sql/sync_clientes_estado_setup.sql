-- 1) Estructura para estados de clientes
begin;

alter table public.clientes
  add column if not exists estado_servicio text not null default 'DESCONOCIDO',
  add column if not exists estado_mikrowisp text,
  add column if not exists estado_actualizado_at timestamptz,
  add column if not exists estado_sync_fuente text not null default 'manual',
  add column if not exists estado_sync_pendiente boolean not null default true,
  add column if not exists estado_sync_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clientes_estado_servicio_chk'
  ) then
    alter table public.clientes
      add constraint clientes_estado_servicio_chk
      check (estado_servicio in ('ACTIVO','SUSPENDIDO','INACTIVO','DESCONOCIDO'));
  end if;
end $$;

create index if not exists idx_clientes_nodo on public.clientes (nodo);
create index if not exists idx_clientes_estado_servicio on public.clientes (estado_servicio);
create index if not exists idx_clientes_nodo_estado on public.clientes (nodo, estado_servicio);
create index if not exists idx_clientes_estado_updated on public.clientes (estado_actualizado_at);

commit;

-- 2) Scheduler diario (03:00 AM America/Lima == 08:00 UTC)
-- Requiere extensiones:
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Reemplaza valores:
-- <PROJECT_REF>  => tu ref de Supabase
-- <ANON_KEY>     => tu anon key del proyecto
-- <CRON_SECRET>  => mismo valor que setees en secret CRON_SECRET de la funcion

-- Borra job previo con el mismo nombre si ya existe
select cron.unschedule(jobid)
from cron.job
where jobname = 'sync_clientes_mikrowisp_3am_lima';

-- Programa ejecucion diaria
select cron.schedule(
  'sync_clientes_mikrowisp_3am_lima',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/sync-clientes-mikrowisp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{"onlyStaleHours":24,"batchSize":20,"limit":4000}'::jsonb
  );
  $$
);

-- 4) Ejecucion manual de prueba (opcional)
-- select net.http_post(
--   url := 'https://<PROJECT_REF>.functions.supabase.co/sync-clientes-mikrowisp',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer <ANON_KEY>',
--     'x-cron-secret', '<CRON_SECRET>'
--   ),
--   body := '{"onlyStaleHours":0,"batchSize":10,"limit":100}'::jsonb
-- );
