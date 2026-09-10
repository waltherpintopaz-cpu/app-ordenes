-- =========================================================
-- Registra los power banks fisicos del equipo de volanteo. La tabla
-- volanteo_power_banks solo tenia la logica de "tomarlo"/"dejarlo", pero
-- nadie habia dado de alta los power banks en si -- por eso la app siempre
-- mostraba "No hay power banks registrados todavia".
-- Ajusta nombre/capacidad si no corresponde exactamente a lo que tienen.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

insert into volanteo_power_banks (nombre, capacidad_mah)
values
  ('Power bank 1', 25000),
  ('Power bank 2', 25000),
  ('Power bank 3', 10000);
