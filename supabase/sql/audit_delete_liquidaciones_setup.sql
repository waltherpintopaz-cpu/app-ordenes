-- Proteccion de datos delicados para borrados de liquidaciones.
-- Ejecutar una sola vez en Supabase SQL Editor.

begin;

create table if not exists public.audit_deletes (
  id bigserial primary key,
  event_at timestamptz not null default now(),
  table_name text not null,
  row_id text,
  related_liquidacion_id bigint,
  actor text,
  txid bigint not null default txid_current(),
  payload jsonb not null
);

create index if not exists idx_audit_deletes_table_time
  on public.audit_deletes (table_name, event_at desc);

create index if not exists idx_audit_deletes_liq_time
  on public.audit_deletes (related_liquidacion_id, event_at desc);

create or replace function public.fn_audit_backup_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  oldj jsonb;
  liq_id bigint;
  actor_txt text;
begin
  oldj := to_jsonb(OLD);
  actor_txt := coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );

  if (oldj ? 'liquidacion_id') then
    begin
      liq_id := nullif(oldj->>'liquidacion_id', '')::bigint;
    exception when others then
      liq_id := null;
    end;
  elsif TG_TABLE_NAME = 'liquidaciones' then
    begin
      liq_id := nullif(oldj->>'id', '')::bigint;
    exception when others then
      liq_id := null;
    end;
  else
    liq_id := null;
  end if;

  insert into public.audit_deletes (
    table_name,
    row_id,
    related_liquidacion_id,
    actor,
    payload
  )
  values (
    TG_TABLE_NAME,
    nullif(oldj->>'id', ''),
    liq_id,
    actor_txt,
    oldj
  );

  return OLD;
end;
$$;

drop trigger if exists trg_audit_delete_liquidaciones on public.liquidaciones;
create trigger trg_audit_delete_liquidaciones
before delete on public.liquidaciones
for each row execute function public.fn_audit_backup_delete();

drop trigger if exists trg_audit_delete_liquidacion_equipos on public.liquidacion_equipos;
create trigger trg_audit_delete_liquidacion_equipos
before delete on public.liquidacion_equipos
for each row execute function public.fn_audit_backup_delete();

drop trigger if exists trg_audit_delete_liquidacion_materiales on public.liquidacion_materiales;
create trigger trg_audit_delete_liquidacion_materiales
before delete on public.liquidacion_materiales
for each row execute function public.fn_audit_backup_delete();

drop trigger if exists trg_audit_delete_liquidacion_fotos on public.liquidacion_fotos;
create trigger trg_audit_delete_liquidacion_fotos
before delete on public.liquidacion_fotos
for each row execute function public.fn_audit_backup_delete();

drop trigger if exists trg_audit_delete_cliente_fotos_liquidacion on public.cliente_fotos_liquidacion;
create trigger trg_audit_delete_cliente_fotos_liquidacion
before delete on public.cliente_fotos_liquidacion
for each row execute function public.fn_audit_backup_delete();

create or replace function public.restore_liquidacion_full(p_liquidacion_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_liq int := 0;
  c_eq int := 0;
  c_mat int := 0;
  c_foto int := 0;
begin
  insert into public.liquidaciones
  select (jsonb_populate_record(null::public.liquidaciones, s.payload)).*
  from (
    select payload
    from public.audit_deletes
    where table_name = 'liquidaciones'
      and related_liquidacion_id = p_liquidacion_id
    order by id desc
    limit 1
  ) s
  on conflict (id) do nothing;
  get diagnostics c_liq = row_count;

  insert into public.liquidacion_equipos
  select (jsonb_populate_record(null::public.liquidacion_equipos, payload)).*
  from public.audit_deletes
  where table_name = 'liquidacion_equipos'
    and related_liquidacion_id = p_liquidacion_id
  on conflict (id) do nothing;
  get diagnostics c_eq = row_count;

  insert into public.liquidacion_materiales
  select (jsonb_populate_record(null::public.liquidacion_materiales, payload)).*
  from public.audit_deletes
  where table_name = 'liquidacion_materiales'
    and related_liquidacion_id = p_liquidacion_id
  on conflict (id) do nothing;
  get diagnostics c_mat = row_count;

  insert into public.liquidacion_fotos
  select (jsonb_populate_record(null::public.liquidacion_fotos, payload)).*
  from public.audit_deletes
  where table_name = 'liquidacion_fotos'
    and related_liquidacion_id = p_liquidacion_id
  on conflict (id) do nothing;
  get diagnostics c_foto = row_count;

  return jsonb_build_object(
    'liquidacion_id', p_liquidacion_id,
    'restored_liquidaciones', c_liq,
    'restored_equipos', c_eq,
    'restored_materiales', c_mat,
    'restored_fotos', c_foto
  );
end;
$$;

commit;

-- CONSULTAS DE AUDITORIA
-- 1) Ultimos borrados:
-- select id,event_at,table_name,row_id,related_liquidacion_id,actor
-- from public.audit_deletes
-- order by id desc
-- limit 100;
--
-- 2) Restaurar liquidacion completa:
-- select public.restore_liquidacion_full(1234);
