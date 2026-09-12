-- =========================================================
-- Limpieza: borra las funciones de diagnostico temporales creadas mientras
-- se depuraba el trigger de marcar calles cubiertas (ya resuelto -- el
-- problema real era RLS reactivandose solo en volanteo_calles_cubiertas).
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

drop function if exists fn_debug_cobertura(text);
drop function if exists fn_debug_cobertura2(text);
drop function if exists fn_debug_cobertura3(text);
