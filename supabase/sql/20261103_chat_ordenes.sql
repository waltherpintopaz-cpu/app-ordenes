-- Chat compartido por orden de trabajo (no atado a un cliente ni a una
-- persona especifica) -- un solo hilo por orden donde el tecnico asignado,
-- las gestoras con acceso al nodo de esa orden, y el administrador pueden
-- escribirse texto y fotos de evidencia. Igual patron que notas_clientes
-- (tabla simple, sin RLS -- este repo no usa RLS en sus tablas propias) mas
-- Supabase Realtime (mismo canal postgres_changes que ya usa OrdersScreen.js
-- para refrescar la lista de ordenes).
create table if not exists public.chat_ordenes_mensajes (
  id bigint generated always as identity primary key,
  orden_id bigint not null,
  texto text,
  foto_url text,
  autor text not null,
  autor_rol text,
  created_at timestamptz not null default now()
);

create index if not exists chat_ordenes_mensajes_orden_id_idx
  on public.chat_ordenes_mensajes (orden_id, created_at);

comment on table public.chat_ordenes_mensajes is
  'Chat compartido (texto y/o foto) dentro de una orden de trabajo -- visible para el tecnico asignado, las gestoras con acceso al nodo de la orden, y el administrador. Un solo hilo por orden, no 1 a 1.';

-- Habilitar Realtime para esta tabla (igual que la tabla "ordenes" ya la
-- tiene, usada en OrdersScreen.js canal "ordenes-realtime").
alter publication supabase_realtime add table public.chat_ordenes_mensajes;
