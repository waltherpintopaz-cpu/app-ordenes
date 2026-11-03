-- Tareas/pendientes por cliente, asignables a un usuario del panel.
--
-- Mismo patron que notas_clientes (tabla simple, sin RLS -- este repo no usa
-- RLS en public.usuarios/notas_clientes, se gestiona con la anon key desde
-- el sidebar de Chatwoot y desde el panel web). Se crean desde SidebarApp.jsx
-- (boton flotante junto al de notas) y se listan en App.jsx como una
-- campanita "Mis tareas" en el header, filtrando por asignado_a = usuario
-- logueado.
--
-- dni es opcional: un prospecto sin DNI resuelto (contacto de Chatwoot que
-- todavia no es cliente registrado) tambien puede recibir una tarea -- se
-- liga por conv_id en vez de dni. Se exige que exista al menos uno de los
-- dos (check constraint).
-- prioridad: 'normal' | 'alta' -- las urgentes saltan a la vista (borde/
-- fondo rojo) y disparan aviso sonoro + notificacion de escritorio al
-- agente asignado via Supabase Realtime (ver App.jsx).
create table if not exists public.tareas_clientes (
  id bigint generated always as identity primary key,
  dni text,
  cliente_nombre text,
  conv_id text,
  account_id text,
  descripcion text not null,
  asignado_a text not null,
  asignado_por text,
  estado text not null default 'pendiente' check (estado in ('pendiente','hecha')),
  prioridad text not null default 'normal' check (prioridad in ('normal','alta')),
  created_at timestamptz not null default now(),
  completado_en timestamptz,
  constraint tareas_clientes_dni_o_conv_id_chk check (dni is not null or conv_id is not null)
);

create index if not exists tareas_clientes_asignado_a_estado_idx
  on public.tareas_clientes (asignado_a, estado);

create index if not exists tareas_clientes_asignado_a_prioridad_idx
  on public.tareas_clientes (asignado_a, estado, prioridad);

create index if not exists tareas_clientes_dni_idx
  on public.tareas_clientes (dni);

create index if not exists tareas_clientes_conv_id_idx
  on public.tareas_clientes (conv_id);

comment on table public.tareas_clientes is
  'Tareas/pendientes creadas desde el sidebar de Chatwoot para un cliente puntual (o un prospecto sin DNI, ligado por conv_id), asignadas por nombre a un usuario del panel (usuarios.nombre). estado: pendiente | hecha. prioridad: normal | alta.';
