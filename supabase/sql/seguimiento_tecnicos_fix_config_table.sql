-- Fix puntual para modulo "Seguimiento tecnicos"
-- Crea la tabla faltante tecnico_seguimiento_config y precarga tecnicos activos.
-- Ejecutar en Supabase SQL Editor (proyecto: vgwbqbzpjlbkmxtfghdm).

begin;

create table if not exists public.tecnico_seguimiento_config (
  tecnico_id text primary key,
  tecnico_nombre text,
  habilitado boolean not null default false,
  modo_turno text not null default 'manual' check (modo_turno in ('manual', 'auto')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tecnico_seguimiento_config_habilitado
  on public.tecnico_seguimiento_config (habilitado);

comment on table public.tecnico_seguimiento_config is
  'Configuracion manual por tecnico: si se rastrea y si el turno inicia manual o automatico.';

-- Si el proyecto trabaja con anon key sin RLS, mantenerlo alineado al resto.
alter table public.tecnico_seguimiento_config disable row level security;

grant select, insert, update, delete on public.tecnico_seguimiento_config
  to anon, authenticated, service_role;

-- Precarga de tecnicos activos para que aparezcan en la pantalla admin.
insert into public.tecnico_seguimiento_config (tecnico_id, tecnico_nombre, habilitado, modo_turno, updated_at)
select
  u.id::text as tecnico_id,
  coalesce(nullif(trim(u.nombre), ''), u.id::text) as tecnico_nombre,
  false as habilitado,
  'manual' as modo_turno,
  now() as updated_at
from public.usuarios u
where coalesce(u.activo, false) = true
  and lower(trim(coalesce(u.rol, ''))) = 'tecnico'
on conflict (tecnico_id) do nothing;

commit;

-- Fuerza recarga del schema cache de PostgREST.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end
$$;
