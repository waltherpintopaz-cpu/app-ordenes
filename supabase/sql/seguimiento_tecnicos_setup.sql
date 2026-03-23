-- Seguimiento de ubicacion de tecnicos
-- Ejecutar este script en Supabase SQL Editor.

create table if not exists public.tecnico_turnos (
  id bigserial primary key,
  tecnico_id text not null,
  tecnico_nombre text,
  tecnico_rol text,
  inicio timestamptz not null default now(),
  fin timestamptz,
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tecnico_ubicaciones (
  id bigserial primary key,
  tecnico_id text not null,
  tecnico_nombre text,
  tecnico_rol text,
  turno_id bigint references public.tecnico_turnos(id) on delete set null,
  orden_id text,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  speed_mps double precision,
  battery_pct int,
  source text not null default 'ping_manual',
  created_at timestamptz not null default now()
);

create table if not exists public.tecnico_ubicacion_actual (
  tecnico_id text primary key,
  tecnico_nombre text,
  tecnico_rol text,
  turno_id bigint references public.tecnico_turnos(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  speed_mps double precision,
  battery_pct int,
  source text,
  updated_at timestamptz not null default now()
);

create table if not exists public.tecnico_seguimiento_config (
  tecnico_id text primary key,
  tecnico_nombre text,
  habilitado boolean not null default false,
  modo_turno text not null default 'manual' check (modo_turno in ('manual', 'auto')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tecnico_turnos_tecnico_inicio
  on public.tecnico_turnos (tecnico_id, inicio desc);

create index if not exists idx_tecnico_ubicaciones_tecnico_fecha
  on public.tecnico_ubicaciones (tecnico_id, created_at desc);

create index if not exists idx_tecnico_ubicaciones_turno
  on public.tecnico_ubicaciones (turno_id, created_at desc);

create index if not exists idx_tecnico_ubicacion_actual_updated
  on public.tecnico_ubicacion_actual (updated_at desc);

create index if not exists idx_tecnico_seguimiento_config_habilitado
  on public.tecnico_seguimiento_config (habilitado);

create or replace function public.set_updated_at_tecnico_turnos()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tecnico_turnos_updated_at on public.tecnico_turnos;

create trigger trg_tecnico_turnos_updated_at
before update on public.tecnico_turnos
for each row
execute function public.set_updated_at_tecnico_turnos();

comment on table public.tecnico_turnos is
  'Registro de turnos para seguimiento de tecnicos.';

comment on table public.tecnico_ubicaciones is
  'Historial de pings y checkpoints de ubicacion por tecnico.';

comment on table public.tecnico_ubicacion_actual is
  'Ultima ubicacion consolidada por tecnico para vista de seguimiento.';

comment on table public.tecnico_seguimiento_config is
  'Configuracion manual por tecnico: si se rastrea y si el turno inicia manual o automatico.';

-- Realtime para ver actualizaciones en vivo en el mapa admin.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tecnico_ubicacion_actual'
  ) then
    alter publication supabase_realtime add table public.tecnico_ubicacion_actual;
  end if;
end $$;
