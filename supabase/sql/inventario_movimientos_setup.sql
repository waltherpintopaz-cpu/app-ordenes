-- Historial persistente de movimientos de inventario (auditoria operativa).
-- Ejecutar una sola vez en Supabase SQL Editor.

begin;

create table if not exists public.inventario_movimientos (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  tipo_item text not null default '',
  movimiento text not null default '',
  motivo text not null default '',
  item_nombre text not null default '',
  referencia text not null default '',
  cantidad numeric not null default 0,
  unidad text not null default 'unidad',
  costo_unitario numeric not null default 0,
  tecnico text not null default '',
  actor text not null default ''
);

create index if not exists idx_inventario_movimientos_created_at
  on public.inventario_movimientos (created_at desc);

create index if not exists idx_inventario_movimientos_tipo_mov
  on public.inventario_movimientos (tipo_item, movimiento);

create index if not exists idx_inventario_movimientos_tecnico
  on public.inventario_movimientos (tecnico);

commit;

