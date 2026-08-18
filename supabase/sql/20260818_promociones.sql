-- =========================================================
-- Promociones/planes que los agentes pueden enviar por WhatsApp
-- desde el sidebar de Chatwoot cuando el cliente SI tiene cobertura.
-- Gestionable desde el panel "Promociones" del navegador.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

create table if not exists promociones (
  id bigint generated always as identity primary key,
  titulo text not null,
  mensaje text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists promociones_activo_idx on promociones (activo, orden);
