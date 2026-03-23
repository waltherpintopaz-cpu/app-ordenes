alter table public.clientes
  add column if not exists fecha_instalo timestamptz;

create index if not exists idx_clientes_fecha_instalo on public.clientes (fecha_instalo);
