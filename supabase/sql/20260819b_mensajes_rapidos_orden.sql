-- =========================================================
-- Agrega orden manual (arriba/abajo) a los mensajes rapidos.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table mensajes_rapidos add column if not exists orden integer not null default 0;

create index if not exists mensajes_rapidos_orden_idx on mensajes_rapidos (orden);
