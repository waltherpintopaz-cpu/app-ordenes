-- Reconciliar estados de equipos_catalogo segun liquidaciones vigentes.
-- Uso:
-- 1) Ejecuta todo este script en Supabase SQL Editor.
-- 2) Al final revisa el resumen y la tabla de conteos.
--
-- Regla aplicada:
-- - Si un equipo aparece en liquidacion_equipos (con liquidacion existente), queda en estado "liquidado" (o su sinonimo permitido).
-- - Si NO aparece liquidado:
--   - con tecnico_asignado => "asignado" (o sinonimo permitido)
--   - sin tecnico_asignado => "disponible/almacen/libre" (el primero permitido por tu check constraint)

begin;

do $$
declare
  v_check text := '';
  v_estado_liquidado text;
  v_estado_asignado text;
  v_estado_almacen text;
  v_rows_liq bigint := 0;
  v_rows_no_liq bigint := 0;
begin
  select lower(pg_get_constraintdef(c.oid))
    into v_check
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'equipos_catalogo'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%estado%'
  order by c.oid desc
  limit 1;

  if coalesce(v_check, '') = '' then
    raise exception 'No se encontro check constraint de estado en public.equipos_catalogo';
  end if;

  -- Elegir estado "liquidado" permitido
  if v_check like '%' || quote_literal('liquidado') || '%' then
    v_estado_liquidado := 'liquidado';
  elsif v_check like '%' || quote_literal('instalado') || '%' then
    v_estado_liquidado := 'instalado';
  elsif v_check like '%' || quote_literal('usado') || '%' then
    v_estado_liquidado := 'usado';
  else
    raise exception 'Tu check de estado no permite ningun valor para "liquidado/instalado/usado".';
  end if;

  -- Elegir estado "asignado" permitido
  if v_check like '%' || quote_literal('asignado') || '%' then
    v_estado_asignado := 'asignado';
  elsif v_check like '%' || quote_literal('disponible') || '%' then
    v_estado_asignado := 'disponible';
  elsif v_check like '%' || quote_literal('almacen') || '%' then
    v_estado_asignado := 'almacen';
  elsif v_check like '%' || quote_literal('libre') || '%' then
    v_estado_asignado := 'libre';
  else
    raise exception 'Tu check de estado no permite ningun valor para "asignado".';
  end if;

  -- Elegir estado "almacen" permitido
  if v_check like '%' || quote_literal('disponible') || '%' then
    v_estado_almacen := 'disponible';
  elsif v_check like '%' || quote_literal('almacen') || '%' then
    v_estado_almacen := 'almacen';
  elsif v_check like '%' || quote_literal('libre') || '%' then
    v_estado_almacen := 'libre';
  elsif v_check like '%' || quote_literal('asignado') || '%' then
    -- fallback extremo si la tabla solo permite "asignado"
    v_estado_almacen := 'asignado';
  else
    raise exception 'Tu check de estado no permite ningun valor para "almacen/disponible/libre".';
  end if;

  -- 1) Equipos realmente liquidados (por detalle existente)
  with eq_liq as (
    select distinct le.id_inventario::bigint as id
    from public.liquidacion_equipos le
    join public.liquidaciones l on l.id = le.liquidacion_id
    where le.id_inventario is not null
  )
  update public.equipos_catalogo e
     set estado = v_estado_liquidado
   where e.id in (select id from eq_liq)
     and lower(trim(coalesce(e.estado, ''))) <> v_estado_liquidado;

  get diagnostics v_rows_liq = row_count;

  -- 2) Equipos sin liquidacion vigente => asignado o almacen segun tecnico_asignado
  with eq_liq as (
    select distinct le.id_inventario::bigint as id
    from public.liquidacion_equipos le
    join public.liquidaciones l on l.id = le.liquidacion_id
    where le.id_inventario is not null
  )
  update public.equipos_catalogo e
     set estado = case
                    when nullif(trim(coalesce(e.tecnico_asignado, '')), '') is not null
                      then v_estado_asignado
                    else v_estado_almacen
                  end
   where e.id not in (select id from eq_liq)
     and lower(trim(coalesce(e.estado, ''))) <> case
       when nullif(trim(coalesce(e.tecnico_asignado, '')), '') is not null then v_estado_asignado
       else v_estado_almacen
     end;

  get diagnostics v_rows_no_liq = row_count;

  raise notice 'Reconciliacion completada. Actualizados liquidados=% y no_liquidados=%', v_rows_liq, v_rows_no_liq;
  raise notice 'Estados usados: liquidado=% | asignado=% | almacen=%', v_estado_liquidado, v_estado_asignado, v_estado_almacen;
end $$;

-- Resumen final
select
  lower(trim(coalesce(estado, 'sin_estado'))) as estado,
  count(*) as total
from public.equipos_catalogo
group by 1
order by 2 desc, 1 asc;

commit;

