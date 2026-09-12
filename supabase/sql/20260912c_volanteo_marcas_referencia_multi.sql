-- =========================================================
-- Cambia el destinatario de una marca de referencia de "una sola persona o
-- todos" a "cero, una, varias o todas las personas" -- el supervisor ahora
-- puede dirigir el punto a un subconjunto flexible del equipo.
-- Idempotente: sirve tanto si ya corriste la version anterior de
-- 20260912b (con tecnico_id) como si recien vas a crear la tabla.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_marcas_referencia
  add column if not exists tecnico_ids text[];

alter table volanteo_marcas_referencia
  drop column if exists tecnico_id;
