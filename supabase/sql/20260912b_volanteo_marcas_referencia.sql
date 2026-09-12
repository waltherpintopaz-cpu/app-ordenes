-- =========================================================
-- Puntos de referencia que el supervisor deja en el mapa durante el dia de
-- volanteo (ej. "Punto de almuerzo", "Nos juntamos aca a las 3") para que
-- los voluntarios los vean en su celular y sepan a donde ir.
-- tecnico_ids nulo = visible para todo el grupo ese dia; si trae uno o mas
-- ids, solo esas personas lo ven (flexible: uno, varios, o todos).
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

create table if not exists volanteo_marcas_referencia (
  id uuid primary key default gen_random_uuid(),
  grupo text not null,
  fecha date not null,
  lat double precision not null,
  lng double precision not null,
  etiqueta text not null,
  tecnico_ids text[],
  creado_por text,
  creado_en timestamptz not null default now()
);

alter table volanteo_marcas_referencia disable row level security;

create index if not exists idx_volanteo_marcas_referencia_grupo_fecha
  on volanteo_marcas_referencia (grupo, fecha);
