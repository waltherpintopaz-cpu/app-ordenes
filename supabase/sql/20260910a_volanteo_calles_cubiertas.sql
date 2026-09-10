-- =========================================================
-- Tabla compartida de "quien cubrio cada calle" -- la pieza que hace
-- posible separar, por persona: lo que cubrio en SU propia zona, la ayuda
-- que RECIBIO de otros, y la ayuda que DIO en zona ajena.
--
-- Antes cada celular solo sabia "que calles cubri yo" (en AsyncStorage
-- local, contra su propio grafo). Ahora se guarda en Supabase, por calle,
-- quien la cubrio de verdad (cubierto_por) y de quien era esa calle
-- originalmente segun la ruta asignada (dueño) -- si son la misma persona
-- fue cobertura propia, si son distintas fue ayuda.
--
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

create table if not exists volanteo_calles_cubiertas (
  id uuid primary key default gen_random_uuid(),
  grupo text not null,
  fecha date not null,
  arista_id text not null,
  way_id text,
  dueno_tecnico_id text,
  dueno_tecnico_nombre text,
  cubierto_por_id text not null,
  cubierto_por_nombre text,
  cubierto_en timestamptz not null default now(),
  unique (grupo, fecha, arista_id)
);

alter table volanteo_calles_cubiertas disable row level security;

create index if not exists idx_volanteo_calles_cubiertas_grupo_fecha
  on volanteo_calles_cubiertas (grupo, fecha);
