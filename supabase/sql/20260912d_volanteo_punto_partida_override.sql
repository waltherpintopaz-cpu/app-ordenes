-- =========================================================
-- Permite al supervisor arrastrar/ajustar a mano el punto de partida
-- sugerido de un voluntario (desde la app movil, rol Supervisor) sin tocar
-- la ruta ya calculada -- si estas columnas vienen nulas se sigue usando el
-- punto que calculo particionarGrafo (coords[0]); si el supervisor lo
-- movio, se usa este en su lugar. Sigue siendo referencial, no afecta el
-- reparto de calles ni el circuito de cobertura.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_rutas_asignadas
  add column if not exists punto_partida_lat double precision;

alter table volanteo_rutas_asignadas
  add column if not exists punto_partida_lng double precision;
