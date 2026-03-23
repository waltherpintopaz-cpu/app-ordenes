create table if not exists public.inventario_articulos (
  id bigint generated always as identity primary key,
  tipo text not null,
  marca text not null,
  modelo text not null,
  descripcion text,
  foto_referencia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventario_articulos_tipo on public.inventario_articulos(tipo);
create index if not exists idx_inventario_articulos_marca on public.inventario_articulos(marca);
create index if not exists idx_inventario_articulos_modelo on public.inventario_articulos(modelo);

create unique index if not exists uq_inventario_articulos_tipo_marca_modelo
  on public.inventario_articulos (
    lower(trim(tipo)),
    lower(trim(marca)),
    lower(trim(modelo))
  );
