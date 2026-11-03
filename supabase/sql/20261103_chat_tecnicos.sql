-- Chat directo tecnico <-> oficina (gestoras + admin), separado del chat
-- por orden. Un solo hilo por tecnico (identificado por su nombre, igual
-- que el campo "tecnico" en la tabla ordenes -- no se usa un id numerico
-- para no depender de resolver usuarios.id en cada pantalla).
create table if not exists public.chat_tecnicos_mensajes (
  id bigint generated always as identity primary key,
  tecnico_nombre text not null,
  texto text,
  foto_url text,
  autor text not null,
  autor_rol text,
  created_at timestamptz not null default now()
);

create index if not exists chat_tecnicos_mensajes_tecnico_idx
  on public.chat_tecnicos_mensajes (tecnico_nombre, created_at);

alter table public.chat_tecnicos_mensajes disable row level security;

alter publication supabase_realtime add table public.chat_tecnicos_mensajes;

comment on table public.chat_tecnicos_mensajes is
  'Chat directo por tecnico (coordinacion general, no atado a una orden). Visible para todas las gestoras + admins + el propio tecnico.';

-- Nota: a diferencia de DIM, Americanet no tiene un servidor de push
-- notifications desplegado (no existe un "notificacionesdim" equivalente
-- para este tenant) -- por eso NO se agrega aqui un trigger de webhook.
-- El aviso de mensajes nuevos funciona igual por Supabase Realtime
-- (ChatOrdenesFlotante.jsx ya se suscribe a esta tabla), solo que no habra
-- push al celular si la app esta cerrada. Si en el futuro se arma ese
-- servidor, agregar aqui el mismo trigger que usa DIM.
