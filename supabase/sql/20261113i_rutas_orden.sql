-- Orden de visita elegido a mano por el tecnico en "Mi ruta de hoy" (por dia).
-- La oficina lo ve al abrir la ruta de ese tecnico.
create table if not exists public.rutas_orden (
  tecnico text not null,
  fecha date not null,
  orden_ids bigint[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tecnico, fecha)
);
alter table public.rutas_orden enable row level security;
drop policy if exists rutas_orden_todo on public.rutas_orden;
create policy rutas_orden_todo on public.rutas_orden for all using (true) with check (true);
grant select, insert, update, delete on public.rutas_orden to anon, authenticated;
notify pgrst, 'reload schema';
