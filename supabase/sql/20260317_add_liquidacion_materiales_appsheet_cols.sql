-- Campos extra para conservar detalle completo de AppSheet (DetalleLiquidacion)
-- Ejecutar en Supabase SQL editor.

alter table if exists public.liquidacion_materiales
  add column if not exists orden_codigo text,
  add column if not exists source_id_liqui text,
  add column if not exists codigo_onu text,
  add column if not exists tipo text,
  add column if not exists precio_unitario_usado numeric(12,4) default 0,
  add column if not exists costo_material numeric(12,2) default 0,
  add column if not exists nodo text;

create index if not exists idx_liq_mat_orden_codigo on public.liquidacion_materiales(orden_codigo);
create index if not exists idx_liq_mat_source_id_liqui on public.liquidacion_materiales(source_id_liqui);
create index if not exists idx_liq_mat_nodo on public.liquidacion_materiales(nodo);
