-- =========================================================
-- Borra los 3 power banks duplicados que se insertaron por error --
-- resulta que los 3 reales ya existian desde antes (pb_10k_1, pb_25k_1,
-- pb_25k_2), solo estaban ocultos por el RLS que bloqueaba la lectura.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

delete from volanteo_power_banks
where id in (
  '65c84f86-b944-40b4-b454-b1b78999c822',
  '9ca750ea-cd52-4f74-9264-2005b190622c',
  '5c1f8cf3-1ce3-4efd-9f86-9478cefa872f'
);
