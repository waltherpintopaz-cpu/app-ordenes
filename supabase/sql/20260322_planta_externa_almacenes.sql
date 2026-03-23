-- Planta Externa + Almacenes (idempotente)
-- Fecha: 2026-03-22

create table if not exists public.almacenes (
  id text primary key,
  nombre text not null,
  ubicacion text,
  direccion text,
  estado text not null default 'activo',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_almacenes_nombre on public.almacenes (nombre);
create index if not exists idx_almacenes_estado on public.almacenes (estado);

insert into public.almacenes (id, nombre, ubicacion, direccion, estado, activo)
values ('ALM-PRINCIPAL', 'Almacen principal', 'Principal', '', 'activo', true)
on conflict (id) do update
set nombre = excluded.nombre,
    estado = excluded.estado,
    activo = excluded.activo,
    updated_at = now();

alter table if exists public.almacen_pe_items
  add column if not exists almacen_id text,
  add column if not exists almacen_nombre text;

alter table if exists public.almacen_pe_movimientos
  add column if not exists almacen_id text,
  add column if not exists almacen_nombre text;

create index if not exists idx_almacen_pe_items_almacen_id on public.almacen_pe_items (almacen_id);
create index if not exists idx_almacen_pe_items_almacen_nombre on public.almacen_pe_items (almacen_nombre);
create index if not exists idx_almacen_pe_movs_almacen_id on public.almacen_pe_movimientos (almacen_id);
create index if not exists idx_almacen_pe_movs_almacen_nombre on public.almacen_pe_movimientos (almacen_nombre);

-- Backfill simple para registros historicos sin almacen
update public.almacen_pe_items
set almacen_id = coalesce(nullif(almacen_id, ''), 'ALM-PRINCIPAL'),
    almacen_nombre = coalesce(nullif(almacen_nombre, ''), 'Almacen principal')
where coalesce(almacen_id, '') = '' or coalesce(almacen_nombre, '') = '';

update public.almacen_pe_movimientos
set almacen_id = coalesce(nullif(almacen_id, ''), 'ALM-PRINCIPAL'),
    almacen_nombre = coalesce(nullif(almacen_nombre, ''), 'Almacen principal')
where coalesce(almacen_id, '') = '' or coalesce(almacen_nombre, '') = '';
