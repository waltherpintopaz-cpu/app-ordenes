-- =========================================================
-- Agrega la columna "segmentos" -- una ruta puede venir partida en varias
-- islas de calles sin conexion real entre si dentro de lo asignado a una
-- persona (repartir calles por cercania/carga no garantiza que el
-- resultado sea un solo bloque conectado). Antes se guardaba una sola
-- linea (coords) que fingia que todo estaba conectado, produciendo lineas
-- rectas fantasma cruzando manzanas al dibujarla. Ahora "coords" sigue
-- siendo el segmento principal (compatibilidad), y "segmentos" trae la
-- lista completa para dibujar cada isla como su propia linea, nunca
-- conectadas entre si.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_rutas_asignadas
  add column if not exists segmentos jsonb;
