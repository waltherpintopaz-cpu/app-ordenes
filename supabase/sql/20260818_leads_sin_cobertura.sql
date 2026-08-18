-- =========================================================
-- Leads sin cobertura: prospectos que consultaron y su ubicacion
-- cayo fuera de las zonas registradas. Se guardan para poder
-- notificarlos (mapa interactivo) cuando la red se expanda ahi.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

create table if not exists leads_sin_cobertura (
  id bigint generated always as identity primary key,
  telefono text not null,
  nombre text,
  coordenadas text,
  conversation_id text,
  account_id text,
  mensaje_enviado boolean not null default false,
  notificado boolean not null default false,
  notificado_en timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists leads_sin_cobertura_telefono_idx on leads_sin_cobertura (telefono);
create index if not exists leads_sin_cobertura_notificado_idx on leads_sin_cobertura (notificado);
