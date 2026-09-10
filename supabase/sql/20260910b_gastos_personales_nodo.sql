-- =========================================================
-- Agrega la columna "nodo" a gastos_personales, para poder filtrar los
-- gastos por nodo de red (Nodo_01, Nodo_02, etc.) ademas de por
-- categoria/entidad. Es opcional -- no todo gasto esta ligado a un nodo.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table gastos_personales
  add column if not exists nodo text;
