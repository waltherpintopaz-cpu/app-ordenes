-- Solicitudes de inventario con aprobacion por almacen/admin
-- Flujo: Tecnico solicita -> Almacen/Admin aprueba o rechaza
-- Incluye: devolucion, merma y recuperacion (legacy sin QR)

begin;

create extension if not exists pgcrypto;

create table if not exists public.inventario_devolucion_solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo_solicitud text not null default 'DEVOLUCION' check (tipo_solicitud in ('DEVOLUCION','MERMA','RECUPERACION')),
  tipo_item text not null check (tipo_item in ('equipo','material')),
  equipo_id text,
  material_asig_id text,
  material_id text,
  codigo_qr text not null default '',
  material_nombre text not null default '',
  cantidad numeric not null check (cantidad > 0),
  unidad text not null default 'unidad',
  es_legacy_sin_qr boolean not null default false,
  identificador_alterno text not null default '',
  nodo_origen text not null default '',
  estado_retorno text not null default 'BUENO' check (estado_retorno in ('BUENO','DANIADO')),
  motivo text not null default '',
  tecnico text not null default '',
  actor_solicita text not null default '',
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APROBADA','RECHAZADA')),
  aprobado_por text,
  aprobado_at timestamptz,
  rechazo_motivo text,
  movimiento_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.inventario_devolucion_solicitudes
  add column if not exists tipo_solicitud text not null default 'DEVOLUCION',
  add column if not exists es_legacy_sin_qr boolean not null default false,
  add column if not exists identificador_alterno text not null default '',
  add column if not exists nodo_origen text not null default '';

create index if not exists idx_inv_devsol_estado_fecha
  on public.inventario_devolucion_solicitudes(estado, created_at desc);

create index if not exists idx_inv_devsol_tecnico
  on public.inventario_devolucion_solicitudes(tecnico);

create index if not exists idx_inv_devsol_tipo_item
  on public.inventario_devolucion_solicitudes(tipo_item);

create index if not exists idx_inv_devsol_tipo_solicitud
  on public.inventario_devolucion_solicitudes(tipo_solicitud);

create index if not exists idx_inv_devsol_nodo_origen
  on public.inventario_devolucion_solicitudes(nodo_origen);

create or replace function public.fn_inventario_devsol_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_inventario_devsol_touch on public.inventario_devolucion_solicitudes;
create trigger trg_inventario_devsol_touch
before update on public.inventario_devolucion_solicitudes
for each row execute function public.fn_inventario_devsol_touch();

commit;
