-- Tareas/pendientes por cliente, asignables a un usuario del panel.
--
-- Mismo patron que notas_clientes (tabla simple, sin RLS -- este repo no usa
-- RLS en public.usuarios/notas_clientes, se gestiona con la anon key desde
-- el sidebar de Chatwoot y desde el panel web). Se crean desde SidebarApp.jsx
-- (boton flotante junto al de notas) y se listan en App.jsx como una
-- campanita "Mis tareas" en el header, filtrando por asignado_a = usuario
-- logueado -- igual que "Solicitudes web" mas simple (sin RPC, porque esta
-- tabla no es publica/expuesta a la web, solo la usa el panel interno).
create table if not exists public.tareas_clientes (
  id bigint generated always as identity primary key,
  dni text not null,
  cliente_nombre text,
  conv_id text,
  account_id text,
  descripcion text not null,
  asignado_a text not null,
  asignado_por text,
  estado text not null default 'pendiente' check (estado in ('pendiente','hecha')),
  created_at timestamptz not null default now(),
  completado_en timestamptz
);

create index if not exists tareas_clientes_asignado_a_estado_idx
  on public.tareas_clientes (asignado_a, estado);

create index if not exists tareas_clientes_dni_idx
  on public.tareas_clientes (dni);

comment on table public.tareas_clientes is
  'Tareas/pendientes creadas desde el sidebar de Chatwoot para un cliente puntual, asignadas por nombre a un usuario del panel (usuarios.nombre). estado: pendiente | hecha.';
