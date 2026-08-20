-- =========================================================
-- Mensajes rapidos (canned responses) personalizados: cada uno
-- tiene dueño (creado_por) y puede ser personal (solo el dueño lo
-- ve) o compartido con todos los agentes. Editable desde el panel
-- "Mensajes Rapidos" del navegador; se envian con un clic desde
-- el sidebar de Chatwoot.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

create table if not exists mensajes_rapidos (
  id bigint generated always as identity primary key,
  titulo text not null,
  descripcion text not null,
  mensaje text not null,
  creado_por text not null,
  compartido boolean not null default false,
  created_at timestamptz not null default now()
);

alter table mensajes_rapidos disable row level security;

create index if not exists mensajes_rapidos_creado_por_idx on mensajes_rapidos (creado_por);
create index if not exists mensajes_rapidos_compartido_idx on mensajes_rapidos (compartido);
