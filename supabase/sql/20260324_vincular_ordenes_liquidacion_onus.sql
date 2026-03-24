-- Vincula ONUsRegistradas -> Liquidaciones -> Ordenes de forma segura e idempotente.
-- No elimina datos. No requiere cambios destructivos en tablas existentes.

begin;

-- 1) Extender tabla puente de relacion ONU-liquidacion para guardar orden.
alter table if exists public.onu_liquidacion_relacion
  add column if not exists orden_codigo text,
  add column if not exists orden_id text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_onu_liq_rel_liquidacion_codigo
  on public.onu_liquidacion_relacion (liquidacion_codigo);

create index if not exists idx_onu_liq_rel_orden_codigo
  on public.onu_liquidacion_relacion (orden_codigo);

-- 2) Funcion de sincronizacion (re-ejecutable).
create or replace function public.sync_onu_orden_liquidacion()
returns jsonb
language plpgsql
as $$
declare
  v_rel_exists boolean := to_regclass('public.onu_liquidacion_relacion') is not null;
  v_liq_exists boolean := to_regclass('public.historial_appsheet_liquidaciones') is not null;
  v_eq_exists boolean := to_regclass('public.equipos_catalogo') is not null;
  v_has_eq_codigo_qr boolean := false;
  v_has_eq_serial_mac boolean := false;
  v_has_eq_orden_codigo boolean := false;
  v_rows_rel integer := 0;
  v_rows_eq integer := 0;
begin
  if not v_rel_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'No existe public.onu_liquidacion_relacion'
    );
  end if;

  if not v_liq_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'No existe public.historial_appsheet_liquidaciones'
    );
  end if;

  -- A) Completar orden_codigo/orden_id dentro de la tabla puente.
  update public.onu_liquidacion_relacion r
  set
    orden_codigo = nullif(trim(l.orden), ''),
    orden_id = nullif(trim(l.orden_id), ''),
    updated_at = now()
  from public.historial_appsheet_liquidaciones l
  where upper(trim(coalesce(r.liquidacion_codigo, ''))) = upper(trim(coalesce(l.codigo, '')))
    and (
      coalesce(r.orden_codigo, '') is distinct from coalesce(nullif(trim(l.orden), ''), '')
      or coalesce(r.orden_id, '') is distinct from coalesce(nullif(trim(l.orden_id), ''), '')
    );

  get diagnostics v_rows_rel = row_count;

  if v_eq_exists then
    select exists(
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'equipos_catalogo'
        and column_name = 'codigo_qr'
    ) into v_has_eq_codigo_qr;

    select exists(
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'equipos_catalogo'
        and column_name = 'serial_mac'
    ) into v_has_eq_serial_mac;

    select exists(
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'equipos_catalogo'
        and column_name = 'orden_codigo'
    ) into v_has_eq_orden_codigo;

    -- B) Actualizar equipos_catalogo.orden_codigo si la columna existe.
    if v_has_eq_codigo_qr and v_has_eq_orden_codigo then
      if v_has_eq_serial_mac then
        update public.equipos_catalogo e
        set orden_codigo = r.orden_codigo
        from public.onu_liquidacion_relacion r
        where coalesce(r.orden_codigo, '') <> ''
          and (
            upper(trim(coalesce(e.codigo_qr, ''))) = upper(trim(coalesce(r.id_onu, '')))
            or upper(trim(coalesce(e.serial_mac, ''))) = upper(trim(coalesce(r.id_onu, '')))
          )
          and coalesce(e.orden_codigo, '') is distinct from coalesce(r.orden_codigo, '');
      else
        update public.equipos_catalogo e
        set orden_codigo = r.orden_codigo
        from public.onu_liquidacion_relacion r
        where coalesce(r.orden_codigo, '') <> ''
          and upper(trim(coalesce(e.codigo_qr, ''))) = upper(trim(coalesce(r.id_onu, '')))
          and coalesce(e.orden_codigo, '') is distinct from coalesce(r.orden_codigo, '');
      end if;

      get diagnostics v_rows_eq = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'relaciones_actualizadas', v_rows_rel,
    'equipos_actualizados', v_rows_eq,
    'equipos_catalogo_detectado', v_eq_exists,
    'columna_orden_codigo_detectada', v_has_eq_orden_codigo
  );
end;
$$;

-- 3) Vista operativa para auditoria rapida.
create or replace view public.v_onu_orden_liquidacion as
select
  r.id_onu,
  r.liquidacion_codigo,
  r.orden_codigo,
  r.orden_id,
  r.regla_match,
  r.confianza,
  r.pendiente_revision,
  r.observacion,
  r.updated_at,
  l.dni,
  l.nodo,
  l.tecnico
from public.onu_liquidacion_relacion r
left join public.historial_appsheet_liquidaciones l
  on upper(trim(coalesce(l.codigo, ''))) = upper(trim(coalesce(r.liquidacion_codigo, '')));

commit;

-- =========================================================
-- EJECUCION
-- =========================================================
-- select public.sync_onu_orden_liquidacion();
--
-- Validacion:
-- select confianza, regla_match, count(*) as total
-- from public.v_onu_orden_liquidacion
-- group by confianza, regla_match
-- order by confianza, regla_match;
--
-- Filas ya vinculadas con orden:
-- select *
-- from public.v_onu_orden_liquidacion
-- where coalesce(orden_codigo, '') <> ''
-- order by updated_at desc
-- limit 100;
