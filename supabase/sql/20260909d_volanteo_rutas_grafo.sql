-- =========================================================
-- Agrega el grafo de calles (nodos + aristas) a la ruta asignada -- antes
-- solo se guardaba la linea final (coords), suficiente para mostrarla,
-- pero no para recalcular "la mejor ruta desde aqui" en el celular cuando
-- el volanteador se desvia. Con el grafo guardado, el celular puede volver
-- a correr el algoritmo de cobertura sobre las calles que aun falten,
-- partiendo de la posicion actual, en vez de depender de seguir el orden
-- exacto sugerido originalmente.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_rutas_asignadas
  add column if not exists grafo_nodos jsonb,
  add column if not exists grafo_aristas jsonb;
