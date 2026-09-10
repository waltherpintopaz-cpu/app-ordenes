-- =========================================================
-- Guarda el % de avance de la ruta asignada de cada volanteador,
-- calculado y actualizado desde su propio celular a medida que camina
-- (antes solo vivia en AsyncStorage local, invisible para el supervisor).
-- Permite mostrar el avance de cada persona en el mapa del supervisor sin
-- tener que preguntarle o pedirle captura.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_rutas_asignadas
  add column if not exists porcentaje_avance integer default 0;
