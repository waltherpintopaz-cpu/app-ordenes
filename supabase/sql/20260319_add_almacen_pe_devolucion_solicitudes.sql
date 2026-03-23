-- Solicitudes de devolucion para flujo de doble validacion (tecnico solicita, almacen aprueba/rechaza)

begin;

create extension if not exists pgcrypto;

create table if not exists public.almacen_pe_devolucion_solicitudes (
  id uuid primary key default gen_random_uuid(),
  salida_origen_id uuid not null references public.almacen_pe_movimientos(id),
  item_id uuid not null references public.almacen_pe_items(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  unidad text not null default 'unidad',
  estado_material text not null default 'BUENO' check (estado_material in ('BUENO','DANIADO')),
  motivo text not null default '',
  referencia_tipo text not null default 'DEV',
  referencia_id text not null,
  responsable_entrega text not null default '',
  responsable_recepcion text not null default '',
  actor_solicita text not null default '',
  observacion text not null default '',
  evidencias jsonb not null default '[]'::jsonb,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APROBADA','RECHAZADA')),
  aprobado_por text,
  aprobado_at timestamptz,
  rechazo_motivo text,
  procesado_movimiento_id uuid references public.almacen_pe_movimientos(id),
  procesado_merma_id uuid references public.almacen_pe_movimientos(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_almacen_pe_devsol_estado_created
  on public.almacen_pe_devolucion_solicitudes(estado, created_at desc);

create index if not exists idx_almacen_pe_devsol_salida
  on public.almacen_pe_devolucion_solicitudes(salida_origen_id);

create index if not exists idx_almacen_pe_devsol_actor
  on public.almacen_pe_devolucion_solicitudes(actor_solicita);

create or replace function public.fn_almacen_pe_devsol_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_almacen_pe_devsol_touch on public.almacen_pe_devolucion_solicitudes;
create trigger trg_almacen_pe_devsol_touch
before update on public.almacen_pe_devolucion_solicitudes
for each row execute function public.fn_almacen_pe_devsol_touch();

commit;
