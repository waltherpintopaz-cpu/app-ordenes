-- Agrega soporte de imagen referencial para items de Planta Externa
alter table if exists public.almacen_pe_items
  add column if not exists foto_referencia text not null default '';

comment on column public.almacen_pe_items.foto_referencia is 'URL publica o data URI de imagen referencial del item';
