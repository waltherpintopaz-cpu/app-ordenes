-- =========================================================
-- Rutas de volanteo asignadas por el supervisor: reparto de las calles de
-- una zona entre los volanteadores del grupo, generado con el algoritmo de
-- src/utils/rutaVolanteo.js (OpenStreetMap + particion de grafo + ruta de
-- cobertura), y ajustable/confirmable a mano antes de que el volanteador
-- la vea lista en su app.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

create table if not exists volanteo_rutas_asignadas (
  id bigint generated always as identity primary key,
  fecha date not null,
  grupo text not null,
  zona_id bigint references zonas_cobertura(id) on delete set null,
  tecnico_id text not null,
  tecnico_nombre text,
  coords jsonb not null default '[]'::jsonb,
  distancia_m numeric,
  calles_cubiertas integer,
  confirmada boolean not null default false,
  creado_en timestamptz not null default now(),
  creado_por text
);

create index if not exists volanteo_rutas_asignadas_fecha_grupo_idx on volanteo_rutas_asignadas (fecha, grupo);
create index if not exists volanteo_rutas_asignadas_tecnico_idx on volanteo_rutas_asignadas (tecnico_id, fecha);
