-- Full schema for app-ordenes in Supabase (PostgreSQL)
-- Covers: usuarios, ordenes, liquidaciones, clientes, inventario, catalogos, asignaciones.

create extension if not exists pgcrypto;

-- =========================================================
-- Usuarios
-- =========================================================
create table if not exists public.usuarios (
  id bigint generated always as identity primary key,
  nombre text not null,
  username text not null unique,
  password text not null,
  rol text not null check (rol in ('Administrador','Tecnico','Gestora','Almacen')),
  celular text,
  email text,
  empresa text default 'Americanet',
  activo boolean not null default true,
  fecha_creacion timestamptz default now()
);

-- =========================================================
-- Catalogos
-- =========================================================
create table if not exists public.tipos_equipo_catalogo (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  fecha_creacion timestamptz default now()
);

create table if not exists public.marcas_tipo_equipo (
  id bigint generated always as identity primary key,
  tipo_id bigint not null references public.tipos_equipo_catalogo(id) on delete cascade,
  marca text not null,
  unique (tipo_id, marca)
);

create table if not exists public.modelos_equipo_catalogo (
  id bigint generated always as identity primary key,
  tipo_id bigint not null references public.tipos_equipo_catalogo(id) on delete cascade,
  marca text not null,
  nombre text not null,
  unique (tipo_id, marca, nombre)
);

create table if not exists public.materiales_catalogo (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  unidad_default text not null default 'unidad',
  costo_unitario numeric(12,2) not null default 0,
  fecha_creacion timestamptz default now()
);

-- =========================================================
-- Inventario (equipos)
-- =========================================================
create table if not exists public.equipos_catalogo (
  id bigint generated always as identity primary key,
  empresa text default 'Americanet',
  tipo text not null,
  marca text,
  modelo text,
  precio_unitario numeric(12,2) not null default 0,
  codigo_qr text not null unique,
  serial_mac text,
  foto_referencia text,
  estado text not null default 'almacen' check (estado in ('almacen','asignado','instalado')),
  tecnico_asignado text,
  cliente_dni text,
  cliente_nombre text,
  orden_codigo text,
  fecha_ultima_instalacion timestamptz
);

create index if not exists idx_equipos_estado on public.equipos_catalogo(estado);
create index if not exists idx_equipos_tecnico_asignado on public.equipos_catalogo(tecnico_asignado);
create index if not exists idx_equipos_cliente_dni on public.equipos_catalogo(cliente_dni);

-- =========================================================
-- Ordenes
-- =========================================================
create table if not exists public.ordenes (
  id bigint generated always as identity primary key,
  empresa text default 'Americanet',
  codigo text not null unique,
  generar_usuario text default 'SI' check (generar_usuario in ('SI','NO')),
  orden_tipo text default 'ORDEN DE SERVICIO',
  tipo_actuacion text not null,
  fecha_actuacion date,
  hora time,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Liquidada')),
  prioridad text default 'Normal' check (prioridad in ('Normal','Alta','Urgente')),

  dni text not null,
  nombre text not null,
  direccion text not null,
  celular text,
  email text,
  contacto text,

  velocidad text,
  precio_plan numeric(12,2),
  nodo text,
  usuario_nodo text,
  password_usuario text,
  motivo_cancelacion text,
  cancelado_por text,
  fecha_cancelacion timestamptz,
  usuario_nodo_liberado text,
  sn_onu text,

  ubicacion text,
  descripcion text,
  foto_fachada text,

  solicitar_pago text default 'SI' check (solicitar_pago in ('SI','NO')),
  monto_cobrar numeric(12,2),
  autor_orden text,
  tecnico text,
  fecha_creacion timestamptz default now()
);

create table if not exists public.orden_fotos (
  id bigint generated always as identity primary key,
  orden_id bigint not null references public.ordenes(id) on delete cascade,
  foto_url text not null,
  fecha_creacion timestamptz default now()
);

create index if not exists idx_ordenes_estado on public.ordenes(estado);
create index if not exists idx_ordenes_dni on public.ordenes(dni);
create index if not exists idx_ordenes_tecnico on public.ordenes(tecnico);
create index if not exists idx_ordenes_autor on public.ordenes(autor_orden);
create index if not exists idx_ordenes_cancelada_fecha on public.ordenes(fecha_cancelacion);

create table if not exists public.ordenes_usuario_liberaciones (
  id bigint generated always as identity primary key,
  orden_id bigint,
  orden_codigo text,
  dni text,
  cliente text,
  nodo text,
  usuario_nodo_liberado text,
  motivo text,
  actor text,
  fecha_evento timestamptz default now()
);

create index if not exists idx_liberaciones_orden_codigo on public.ordenes_usuario_liberaciones(orden_codigo);
create index if not exists idx_liberaciones_fecha_evento on public.ordenes_usuario_liberaciones(fecha_evento);

-- =========================================================
-- Liquidaciones
-- =========================================================
create table if not exists public.liquidaciones (
  id bigint generated always as identity primary key,
  orden_original_id bigint references public.ordenes(id) on delete set null,

  -- snapshot base de la orden
  codigo text,
  empresa text,
  tipo_actuacion text,
  dni text,
  nombre text,
  direccion text,
  celular text,
  email text,
  contacto text,
  velocidad text,
  precio_plan numeric(12,2),
  nodo text,
  usuario_nodo text,
  password_usuario text,
  ubicacion text,
  descripcion text,
  foto_fachada text,
  autor_orden text,
  tecnico text,
  sn_onu text,

  -- datos liquidacion
  tecnico_liquida text not null,
  resultado_final text default 'Completada',
  observacion_final text,
  cobro_realizado text default 'NO' check (cobro_realizado in ('SI','NO')),
  monto_cobrado numeric(12,2) default 0,
  medio_pago text,
  codigo_etiqueta text,
  sn_onu_liquidacion text,
  costo_equipos numeric(12,2) default 0,
  estado text default 'Liquidada',
  fecha_liquidacion timestamptz default now(),

  -- control de edición
  editado boolean not null default false,
  fecha_edicion timestamptz,
  editado_por text
);

create table if not exists public.liquidacion_equipos (
  id bigint generated always as identity primary key,
  liquidacion_id bigint not null references public.liquidaciones(id) on delete cascade,
  id_inventario bigint references public.equipos_catalogo(id) on delete set null,
  tipo text,
  codigo text,
  serial text,
  accion text,
  marca text,
  modelo text,
  foto_referencia text,
  empresa text,
  precio_unitario numeric(12,2) default 0,
  costo_total numeric(12,2) default 0
);

create table if not exists public.liquidacion_materiales (
  id bigint generated always as identity primary key,
  liquidacion_id bigint not null references public.liquidaciones(id) on delete cascade,
  material text not null,
  cantidad numeric(12,2) not null default 0,
  unidad text not null default 'unidad'
);

create table if not exists public.liquidacion_fotos (
  id bigint generated always as identity primary key,
  liquidacion_id bigint not null references public.liquidaciones(id) on delete cascade,
  foto_url text not null,
  fecha_creacion timestamptz default now()
);

create index if not exists idx_liq_fecha on public.liquidaciones(fecha_liquidacion);
create index if not exists idx_liq_tecnico on public.liquidaciones(tecnico_liquida);
create index if not exists idx_liq_dni on public.liquidaciones(dni);
create index if not exists idx_liq_codigo on public.liquidaciones(codigo);

-- =========================================================
-- Clientes (derivado de liquidaciones de instalación)
-- =========================================================
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
  precio_plan numeric(12,2),
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
  precio_unitario numeric(12,2) default 0,
  costo_total numeric(12,2) default 0,
  empresa text,
  fecha_creacion timestamptz default now()
);

create index if not exists idx_clientes_dni on public.clientes(dni);
create index if not exists idx_clientes_sn_onu on public.clientes(sn_onu);

-- =========================================================
-- Asignaciones de materiales por técnico
-- =========================================================
create table if not exists public.materiales_asignados_tecnicos (
  id bigint generated always as identity primary key,
  tecnico text not null,
  material_id bigint references public.materiales_catalogo(id) on delete set null,
  material_nombre text not null,
  cantidad_asignada numeric(12,2) not null default 0,
  cantidad_disponible numeric(12,2) not null default 0,
  unidad text not null default 'unidad',
  fecha_asignacion timestamptz default now()
);

create index if not exists idx_mat_asig_tecnico on public.materiales_asignados_tecnicos(tecnico);

-- =========================================================
-- Trigger updated_at para clientes
-- =========================================================
create or replace function public.set_updated_at_clientes()
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
for each row execute function public.set_updated_at_clientes();
