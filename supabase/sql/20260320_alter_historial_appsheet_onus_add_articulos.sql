alter table if exists public.historial_appsheet_onus
  add column if not exists producto_codigo text,
  add column if not exists info_producto text,
  add column if not exists marca text,
  add column if not exists modelo text,
  add column if not exists foto_producto_raw text,
  add column if not exists foto_producto_url text,
  add column if not exists precio_unitario numeric(12,2);

create index if not exists idx_historial_appsheet_onus_producto_codigo
  on public.historial_appsheet_onus (producto_codigo);
