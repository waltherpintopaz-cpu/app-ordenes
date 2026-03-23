-- Reconciliar estados de equipos usando evidencia real de liquidacion.
-- Seguro para constraints distintos (almacen/disponible/libre, instalado/liquidado/usado, etc.).
--
-- Flujo recomendado:
-- 1) Ejecuta la seccion AUDITORIA.
-- 2) Revisa resultados.
-- 3) Ejecuta la seccion CORRECCION.

-- =========================================================
-- AUDITORIA (NO MODIFICA)
-- =========================================================
with base as (
  select
    e.id,
    e.codigo_qr,
    e.serial_mac,
    e.estado,
    e.tecnico_asignado,
    nullif(upper(trim(coalesce(e.codigo_qr, ''))), '') as codigo_norm,
    nullif(upper(trim(coalesce(e.serial_mac, ''))), '') as serial_norm
  from public.equipos_catalogo e
),
evidencia as (
  select
    b.id,
    exists (
      select 1
      from public.liquidacion_equipos le
      join public.liquidaciones l on l.id = le.liquidacion_id
      where
        (b.codigo_norm is not null and upper(trim(coalesce(le.codigo, ''))) = b.codigo_norm)
        or (b.serial_norm is not null and upper(trim(coalesce(le.serial, ''))) = b.serial_norm)
    ) as ev_liq_eq,
    exists (
      select 1
      from public.liquidacion_materiales lm
      join public.liquidaciones l on l.id = lm.liquidacion_id
      where
        (b.codigo_norm is not null and upper(trim(coalesce(lm.codigo_onu, ''))) = b.codigo_norm)
        or (b.serial_norm is not null and upper(trim(coalesce(lm.codigo_onu, ''))) = b.serial_norm)
    ) as ev_liq_mat,
    exists (
      select 1
      from public.liquidaciones l
      where
        (b.serial_norm is not null and upper(trim(coalesce(l.sn_onu_liquidacion, ''))) = b.serial_norm)
        or (b.serial_norm is not null and upper(trim(coalesce(l.sn_onu, ''))) = b.serial_norm)
    ) as ev_liq_sn
  from base b
)
select
  b.id,
  b.codigo_qr,
  b.serial_mac,
  b.estado as estado_actual,
  b.tecnico_asignado,
  (e.ev_liq_eq or e.ev_liq_mat or e.ev_liq_sn) as tiene_evidencia_liquidacion,
  case
    when (e.ev_liq_eq or e.ev_liq_mat or e.ev_liq_sn) then 'debe quedar como LIQUIDADO/INSTALADO'
    when nullif(trim(coalesce(b.tecnico_asignado, '')), '') is not null then 'debe quedar como ASIGNADO'
    else 'debe quedar como ALMACEN/DISPONIBLE'
  end as recomendacion
from base b
join evidencia e on e.id = b.id
where lower(trim(coalesce(b.estado, ''))) ~ '(liquid|instalad|usad)'
order by b.id desc;

-- =========================================================
-- CORRECCION (MODIFICA)
-- =========================================================
begin;

do $$
declare
  v_check text := '';
  v_estado_liquidado text;
  v_estado_asignado text;
  v_estado_almacen text;
  v_rows_fix bigint := 0;
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

  -- Estado para equipos con evidencia de liquidacion
  if v_check like '%' || quote_literal('liquidado') || '%' then
    v_estado_liquidado := 'liquidado';
  elsif v_check like '%' || quote_literal('instalado') || '%' then
    v_estado_liquidado := 'instalado';
  elsif v_check like '%' || quote_literal('usado') || '%' then
    v_estado_liquidado := 'usado';
  else
    raise exception 'El check de estado no permite liquidado/instalado/usado.';
  end if;

  -- Estado para equipos con tecnico
  if v_check like '%' || quote_literal('asignado') || '%' then
    v_estado_asignado := 'asignado';
  elsif v_check like '%' || quote_literal('disponible') || '%' then
    v_estado_asignado := 'disponible';
  elsif v_check like '%' || quote_literal('almacen') || '%' then
    v_estado_asignado := 'almacen';
  elsif v_check like '%' || quote_literal('libre') || '%' then
    v_estado_asignado := 'libre';
  else
    raise exception 'El check de estado no permite un valor para estado asignado.';
  end if;

  -- Estado para equipos sin tecnico
  if v_check like '%' || quote_literal('disponible') || '%' then
    v_estado_almacen := 'disponible';
  elsif v_check like '%' || quote_literal('almacen') || '%' then
    v_estado_almacen := 'almacen';
  elsif v_check like '%' || quote_literal('libre') || '%' then
    v_estado_almacen := 'libre';
  elsif v_check like '%' || quote_literal('asignado') || '%' then
    v_estado_almacen := 'asignado';
  else
    raise exception 'El check de estado no permite un valor para estado almacen/disponible/libre.';
  end if;

  with base as (
    select
      e.id,
      lower(trim(coalesce(e.estado, ''))) as estado_norm,
      nullif(trim(coalesce(e.tecnico_asignado, '')), '') as tecnico_norm,
      nullif(upper(trim(coalesce(e.codigo_qr, ''))), '') as codigo_norm,
      nullif(upper(trim(coalesce(e.serial_mac, ''))), '') as serial_norm
    from public.equipos_catalogo e
  ),
  evidencia as (
    select
      b.id,
      exists (
        select 1
        from public.liquidacion_equipos le
        join public.liquidaciones l on l.id = le.liquidacion_id
        where
          (b.codigo_norm is not null and upper(trim(coalesce(le.codigo, ''))) = b.codigo_norm)
          or (b.serial_norm is not null and upper(trim(coalesce(le.serial, ''))) = b.serial_norm)
      ) as ev_liq_eq,
      exists (
        select 1
        from public.liquidacion_materiales lm
        join public.liquidaciones l on l.id = lm.liquidacion_id
        where
          (b.codigo_norm is not null and upper(trim(coalesce(lm.codigo_onu, ''))) = b.codigo_norm)
          or (b.serial_norm is not null and upper(trim(coalesce(lm.codigo_onu, ''))) = b.serial_norm)
      ) as ev_liq_mat,
      exists (
        select 1
        from public.liquidaciones l
        where
          (b.serial_norm is not null and upper(trim(coalesce(l.sn_onu_liquidacion, ''))) = b.serial_norm)
          or (b.serial_norm is not null and upper(trim(coalesce(l.sn_onu, ''))) = b.serial_norm)
      ) as ev_liq_sn
    from base b
  ),
  fix as (
    select
      b.id,
      case
        when (e.ev_liq_eq or e.ev_liq_mat or e.ev_liq_sn) then v_estado_liquidado
        when b.tecnico_norm is not null then v_estado_asignado
        else v_estado_almacen
      end as nuevo_estado
    from base b
    join evidencia e on e.id = b.id
    where b.estado_norm ~ '(liquid|instalad|usad)'
  )
  update public.equipos_catalogo ec
  set estado = f.nuevo_estado
  from fix f
  where ec.id = f.id
    and lower(trim(coalesce(ec.estado, ''))) <> f.nuevo_estado;

  get diagnostics v_rows_fix = row_count;
  raise notice 'Reconciliacion aplicada: % filas actualizadas.', v_rows_fix;
  raise notice 'Estados usados => liquidado:% | asignado:% | almacen:%', v_estado_liquidado, v_estado_asignado, v_estado_almacen;
end $$;

-- Resumen final
select
  lower(trim(coalesce(estado, 'sin_estado'))) as estado,
  count(*) as total
from public.equipos_catalogo
group by 1
order by 2 desc, 1 asc;

commit;

