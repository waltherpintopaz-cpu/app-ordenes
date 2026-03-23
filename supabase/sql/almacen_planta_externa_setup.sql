-- =========================================================
-- ALMACEN PLANTA EXTERNA + DEVOLUCIONES
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

begin;

create extension if not exists pgcrypto;

-- 1) Catalogo de items de planta externa
create table if not exists public.almacen_pe_items (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  categoria text not null default 'general', -- fibra/adss/ferreteria/herramienta/accesorio
  unidad_base text not null default 'unidad' check (unidad_base in ('unidad','m','rollo','caja','kg','lt')),
  stock_actual numeric(14,2) not null default 0 check (stock_actual >= 0),
  stock_minimo numeric(14,2) not null default 0 check (stock_minimo >= 0),
  costo_unitario_ref numeric(14,2) not null default 0,
  ubicacion text not null default '',
  foto_referencia text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.almacen_pe_items add column if not exists foto_referencia text not null default '';

create index if not exists idx_almacen_pe_items_categoria on public.almacen_pe_items(categoria);
create index if not exists idx_almacen_pe_items_activo on public.almacen_pe_items(activo);

-- 2) Kardex de movimientos
create table if not exists public.almacen_pe_movimientos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.almacen_pe_items(id),
  tipo text not null check (tipo in ('INGRESO','SALIDA','DEVOLUCION','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','MERMA')),
  cantidad numeric(14,2) not null check (cantidad > 0),
  unidad text not null check (unidad in ('unidad','m','rollo','caja','kg','lt')),
  costo_unitario numeric(14,2),
  motivo text not null default '',
  referencia_tipo text not null default '', -- OBRA/OT/REQ/etc
  referencia_id text not null default '',
  salida_origen_id uuid references public.almacen_pe_movimientos(id), -- obligatorio en DEVOLUCION
  estado_material text, -- BUENO / DANIADO
  responsable_entrega text not null default '',
  responsable_recepcion text not null default '',
  observacion text not null default '',
  actor text not null default '',
  fecha_mov timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_almacen_pe_mov_item_fecha on public.almacen_pe_movimientos(item_id, fecha_mov desc);
create index if not exists idx_almacen_pe_mov_tipo on public.almacen_pe_movimientos(tipo);
create index if not exists idx_almacen_pe_mov_salida on public.almacen_pe_movimientos(salida_origen_id);

-- 3) updated_at automatica
create or replace function public.fn_almacen_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_almacen_pe_items_touch on public.almacen_pe_items;
create trigger trg_almacen_pe_items_touch
before update on public.almacen_pe_items
for each row execute function public.fn_almacen_touch_updated_at();

-- 4) Validaciones + impacto de stock por movimiento
create or replace function public.fn_almacen_pe_mov_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_stock numeric(14,2);
  v_delta numeric(14,2);
  v_origen record;
  v_devuelto_acumulado numeric(14,2);
  v_stock_nuevo numeric(14,2);
begin
  -- lock de item para evitar carreras concurrentes
  select stock_actual into v_stock
  from public.almacen_pe_items
  where id = new.item_id
  for update;

  if v_stock is null then
    raise exception 'Item no existe en almacen_pe_items';
  end if;

  -- Reglas de devolucion
  if new.tipo = 'DEVOLUCION' then
    if new.salida_origen_id is null then
      raise exception 'DEVOLUCION requiere salida_origen_id';
    end if;

    select * into v_origen
    from public.almacen_pe_movimientos
    where id = new.salida_origen_id;

    if v_origen.id is null then
      raise exception 'salida_origen_id no existe';
    end if;

    if v_origen.tipo <> 'SALIDA' then
      raise exception 'salida_origen_id debe apuntar a un movimiento SALIDA';
    end if;

    if v_origen.item_id <> new.item_id then
      raise exception 'La DEVOLUCION debe ser del mismo item que la SALIDA origen';
    end if;

    if v_origen.unidad <> new.unidad then
      raise exception 'La DEVOLUCION debe tener la misma unidad de la SALIDA origen';
    end if;

    select coalesce(sum(cantidad), 0)
      into v_devuelto_acumulado
    from public.almacen_pe_movimientos
    where salida_origen_id = v_origen.id
      and tipo = 'DEVOLUCION';

    if (v_devuelto_acumulado + new.cantidad) > v_origen.cantidad then
      raise exception 'Devolucion excede lo retirado. Retirado: %, Devuelto acumulado: %, Intento: %',
        v_origen.cantidad, v_devuelto_acumulado, new.cantidad;
    end if;

    if coalesce(trim(new.estado_material), '') = '' then
      new.estado_material := 'BUENO';
    end if;

    if new.estado_material not in ('BUENO','DANIADO') then
      raise exception 'estado_material en DEVOLUCION debe ser BUENO o DANIADO';
    end if;
  end if;

  -- Delta de stock
  if new.tipo in ('INGRESO','DEVOLUCION','AJUSTE_POSITIVO') then
    v_delta := new.cantidad;
  else
    v_delta := -new.cantidad; -- SALIDA/MERMA/AJUSTE_NEGATIVO
  end if;

  v_stock_nuevo := v_stock + v_delta;
  if v_stock_nuevo < 0 then
    raise exception 'Stock insuficiente. Actual: %, movimiento: % %', v_stock, new.tipo, new.cantidad;
  end if;

  update public.almacen_pe_items
  set stock_actual = v_stock_nuevo
  where id = new.item_id;

  return new;
end;
$$;

drop trigger if exists trg_almacen_pe_mov_before_insert on public.almacen_pe_movimientos;
create trigger trg_almacen_pe_mov_before_insert
before insert on public.almacen_pe_movimientos
for each row execute function public.fn_almacen_pe_mov_before_insert();

-- 5) Auditoria fuerte: no editar/eliminar movimientos
create or replace function public.fn_almacen_pe_no_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'No se permite UPDATE/DELETE en movimientos. Use contramovimiento.';
end;
$$;

drop trigger if exists trg_almacen_pe_mov_no_update on public.almacen_pe_movimientos;
create trigger trg_almacen_pe_mov_no_update
before update on public.almacen_pe_movimientos
for each row execute function public.fn_almacen_pe_no_update_delete();

drop trigger if exists trg_almacen_pe_mov_no_delete on public.almacen_pe_movimientos;
create trigger trg_almacen_pe_mov_no_delete
before delete on public.almacen_pe_movimientos
for each row execute function public.fn_almacen_pe_no_update_delete();

-- 6) Vista para UI: salidas y saldo pendiente de devolucion
create or replace view public.vw_almacen_pe_salidas_saldo as
select
  s.id as salida_id,
  s.item_id,
  i.codigo,
  i.nombre,
  i.categoria,
  s.cantidad as cantidad_salida,
  coalesce(sum(d.cantidad), 0) as cantidad_devuelta,
  (s.cantidad - coalesce(sum(d.cantidad), 0)) as saldo_pendiente,
  s.unidad,
  s.fecha_mov as fecha_salida,
  s.referencia_tipo,
  s.referencia_id,
  s.responsable_entrega,
  s.responsable_recepcion
from public.almacen_pe_movimientos s
join public.almacen_pe_items i on i.id = s.item_id
left join public.almacen_pe_movimientos d
  on d.salida_origen_id = s.id
 and d.tipo = 'DEVOLUCION'
where s.tipo = 'SALIDA'
group by
  s.id, s.item_id, i.codigo, i.nombre, i.categoria, s.cantidad, s.unidad,
  s.fecha_mov, s.referencia_tipo, s.referencia_id, s.responsable_entrega, s.responsable_recepcion;

commit;

-- =========================================================
-- DEMO DE USO (ejecutar despues del setup)
-- =========================================================

-- A) Crear items base (si no existen)
insert into public.almacen_pe_items (codigo, nombre, categoria, unidad_base, stock_minimo, costo_unitario_ref, ubicacion)
values
  ('PE-FIBRA-ADSS-12', 'Cable Fibra ADSS 12H', 'fibra', 'm', 100, 2.80, 'Rack A1'),
  ('PE-HERRA-GANCHO', 'Gancho de retencion', 'ferreteria', 'unidad', 20, 6.50, 'Rack B2')
on conflict (codigo) do nothing;

-- B) Ingreso de fibra (1000m)
insert into public.almacen_pe_movimientos (
  item_id, tipo, cantidad, unidad, costo_unitario, motivo,
  referencia_tipo, referencia_id, responsable_recepcion, actor
)
select id, 'INGRESO', 1000, 'm', 2.90, 'Compra proveedor',
       'COMPRA', 'FAC-2026-0001', 'Almacen Central', 'Admin General'
from public.almacen_pe_items
where codigo = 'PE-FIBRA-ADSS-12'
limit 1;

-- C) Salida a cuadrilla (350m)
insert into public.almacen_pe_movimientos (
  item_id, tipo, cantidad, unidad, motivo,
  referencia_tipo, referencia_id, responsable_entrega, responsable_recepcion, actor
)
select id, 'SALIDA', 350, 'm', 'Trabajo instalacion sector 01',
       'OT', 'OT-4783-2026', 'Almacen Central', 'Luis Pacsi', 'Admin General'
from public.almacen_pe_items
where codigo = 'PE-FIBRA-ADSS-12'
limit 1;

-- D) Devolucion de sobrante (40m) enlazada a la ultima salida
insert into public.almacen_pe_movimientos (
  item_id, tipo, cantidad, unidad, motivo,
  salida_origen_id, estado_material, responsable_entrega, responsable_recepcion, actor
)
select
  s.item_id,
  'DEVOLUCION',
  40,
  s.unidad,
  'Sobrante de obra OT-4783-2026',
  s.id,
  'BUENO',
  'Luis Pacsi',
  'Almacen Central',
  'Luis Pacsi'
from public.almacen_pe_movimientos s
join public.almacen_pe_items i on i.id = s.item_id
where s.tipo = 'SALIDA'
  and i.codigo = 'PE-FIBRA-ADSS-12'
order by s.fecha_mov desc
limit 1;

-- E) Consultas de control
-- stock actual por item
-- select codigo, nombre, stock_actual, unidad_base from public.almacen_pe_items order by codigo;

-- salidas con saldo pendiente de devolucion
-- select * from public.vw_almacen_pe_salidas_saldo order by fecha_salida desc;

