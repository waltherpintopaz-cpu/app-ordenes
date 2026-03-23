-- Schema for clientes migration from localStorage to Supabase (PostgreSQL)
-- Safe to run in Supabase SQL Editor.

create table if not exists public.clientes (
  id bigint generated always as identity primary key,
  codigo_cliente text,
  dni text not null unique,
  nombre text not null,
  direccion text,
  celular text,
  email text,
  contacto text,
  empresa text,
  velocidad text,
  precio_plan numeric(10,2),
  nodo text,
  usuario_nodo text,
  password_usuario text,
  ubicacion text,
  descripcion text,
  foto_fachada text,
  codigo_etiqueta text,
  sn_onu text,
  tecnico text,
  autor_orden text,
  fecha_instalo timestamptz,
  fecha_registro timestamptz default now(),
  ultima_actualizacion timestamptz default now()
);

create table if not exists public.cliente_fotos_liquidacion (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  foto_url text not null,
  fecha_creacion timestamptz default now()
);

create table if not exists public.cliente_historial_instalaciones (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  orden_original_id bigint,
  codigo_orden text,
  fecha_liquidacion timestamptz,
  tipo_actuacion text,
  resultado_final text,
  tecnico text,
  observacion_final text,
  codigo_etiqueta text,
  sn_onu text,
  fecha_creacion timestamptz default now()
);

create table if not exists public.cliente_equipos_historial (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  orden_id bigint,
  codigo_orden text,
  fecha timestamptz,
  tipo text,
  codigo text,
  serial text,
  accion text,
  marca text,
  modelo text,
  foto_referencia text,
  precio_unitario numeric(10,2) default 0,
  costo_total numeric(10,2) default 0,
  empresa text,
  fecha_creacion timestamptz default now()
);

create index if not exists idx_clientes_dni on public.clientes(dni);
create index if not exists idx_clientes_sn_onu on public.clientes(sn_onu);
create index if not exists idx_cliente_historial_cliente_id on public.cliente_historial_instalaciones(cliente_id);
create index if not exists idx_cliente_equipos_cliente_id on public.cliente_equipos_historial(cliente_id);
create index if not exists idx_cliente_fotos_cliente_id on public.cliente_fotos_liquidacion(cliente_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.ultima_actualizacion = now();
  return new;
end;
$$;

drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();
