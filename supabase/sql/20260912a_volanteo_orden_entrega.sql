-- =========================================================
-- Orden de dejada sugerido para cada voluntario del dia (1, 2, 3...),
-- calculado por particionarGrafo como una cadena de vecino mas cercano
-- entre los centros de cada zona repartida -- asi el supervisor puede
-- ir dejando a cada quien en ese orden sin ir y volver por el mapa.
-- Es referencial: no bloquea nada, solo se muestra en el mapa.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_rutas_asignadas
  add column if not exists orden_entrega integer;
