-- =========================================================
-- Fix: la tabla volanteo_rutas_asignadas quedo con RLS activado por
-- defecto (Supabase la activa sola en tablas nuevas), bloqueando el
-- insert/delete que hace el panel con la anon key. Mismo criterio que el
-- resto de tablas del proyecto (ver 20260819_mensajes_rapidos.sql).
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_rutas_asignadas disable row level security;
