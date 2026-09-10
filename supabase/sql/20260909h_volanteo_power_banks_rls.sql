-- =========================================================
-- La tabla volanteo_power_banks quedo con RLS activado por defecto (como
-- toda tabla nueva en Supabase) y nunca se le aplico el mismo ajuste que al
-- resto de tablas del proyecto -- por eso el insert se veia bien desde el
-- SQL Editor (corre como admin, se salta RLS) pero la app (que usa la
-- llave publica/anon) no podia leer las filas.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_power_banks disable row level security;
