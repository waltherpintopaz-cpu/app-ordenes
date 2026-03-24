-- DRY-RUN seguro para relacionar ONUsRegistradas con ARTICULOS y Liquidaciones AppSheet.
-- Este script NO toca inventario final. Solo crea tablas puente y propuestas de relacion.

begin;

-- 1) Puente producto origen -> articulo oficial
create table if not exists public.onu_producto_equivalencia (
  id bigserial primary key,
  producto_origen text not null,
  articulo_id text null,
  articulo_nombre text null,
  articulo_marca text null,
  articulo_modelo text null,
  articulo_info text null,
  tipo_match text not null default 'sin_match', -- exacto_id|normalizado_nombre|normalizado_modelo|sin_match
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (producto_origen)
);

-- 2) Puente de tecnicos por codigo origen (se completa destino de forma controlada)
create table if not exists public.onu_tecnico_equivalencia (
  id bigserial primary key,
  codigo_origen text not null,
  origen_campo text not null, -- tecnico_asignado_codigo|liquidado_por_codigo
  usuario_destino_id text null,
  usuario_destino_nombre text null,
  tipo_match text not null default 'pendiente',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo_origen, origen_campo)
);

-- 3) Relacion ONU -> liquidacion (AppSheet), con confianza.
create table if not exists public.onu_liquidacion_relacion (
  id bigserial primary key,
  id_onu text not null,
  liquidacion_codigo text null,
  regla_match text not null, -- id_onu_detalle|id_onu_sn|dni_nodo|sin_match
  confianza text not null,   -- alta|media|baja
  pendiente_revision boolean not null default false,
  observacion text null,
  created_at timestamptz not null default now(),
  unique (id_onu)
);

commit;

-- =========================================================
-- CARGA PROPUESTA (NO INVENTARIO): ejecutar manualmente
-- =========================================================

-- A) Poblar equivalencias de producto.
insert into public.onu_producto_equivalencia (
  producto_origen,
  articulo_id,
  articulo_nombre,
  articulo_marca,
  articulo_modelo,
  articulo_info,
  tipo_match,
  updated_at
)
select
  o.producto as producto_origen,
  coalesce(a1.id_articulo, a2.id_articulo, a3.id_articulo) as articulo_id,
  coalesce(a1.nombre, a2.nombre, a3.nombre) as articulo_nombre,
  coalesce(a1.marca, a2.marca, a3.marca) as articulo_marca,
  coalesce(a1.modelo, a2.modelo, a3.modelo) as articulo_modelo,
  coalesce(a1.info, a2.info, a3.info) as articulo_info,
  case
    when a1.id_articulo is not null then 'exacto_id'
    when a2.id_articulo is not null then 'normalizado_nombre'
    when a3.id_articulo is not null then 'normalizado_modelo'
    else 'sin_match'
  end as tipo_match,
  now() as updated_at
from (
  select distinct trim(producto) as producto
  from public.historial_appsheet_onus
  where trim(coalesce(producto, '')) <> ''
) o
left join lateral (
  select id_articulo, nombre, marca, modelo, info
  from public.historial_appsheet_articulos a
  where upper(trim(a.id_articulo)) = upper(trim(o.producto))
  limit 1
) a1 on true
left join lateral (
  select id_articulo, nombre, marca, modelo, info
  from public.historial_appsheet_articulos a
  where regexp_replace(upper(trim(a.nombre)), '[^A-Z0-9]+', ' ', 'g')
      = regexp_replace(upper(trim(o.producto)), '[^A-Z0-9]+', ' ', 'g')
  limit 1
) a2 on true
left join lateral (
  select id_articulo, nombre, marca, modelo, info
  from public.historial_appsheet_articulos a
  where regexp_replace(upper(trim(a.modelo)), '[^A-Z0-9]+', ' ', 'g')
      = regexp_replace(upper(trim(o.producto)), '[^A-Z0-9]+', ' ', 'g')
  limit 1
) a3 on true
on conflict (producto_origen) do update
set
  articulo_id = excluded.articulo_id,
  articulo_nombre = excluded.articulo_nombre,
  articulo_marca = excluded.articulo_marca,
  articulo_modelo = excluded.articulo_modelo,
  articulo_info = excluded.articulo_info,
  tipo_match = excluded.tipo_match,
  updated_at = now();

-- B) Poblar tecnicos detectados en ONUsRegistradas.
insert into public.onu_tecnico_equivalencia (
  codigo_origen,
  origen_campo,
  tipo_match,
  updated_at
)
select distinct trim(codigo_origen), origen_campo, 'pendiente', now()
from (
  select tecnico_asignado_codigo as codigo_origen, 'tecnico_asignado_codigo' as origen_campo
  from public.historial_appsheet_onus
  union all
  select liquidado_por_codigo as codigo_origen, 'liquidado_por_codigo' as origen_campo
  from public.historial_appsheet_onus
) s
where trim(coalesce(codigo_origen, '')) <> ''
on conflict (codigo_origen, origen_campo) do update
set updated_at = now();

-- C) Poblar relacion ONU -> Liquidacion con prioridad de confianza:
--    1) codigo_onu (detalle liquidacion) => alta
--    2) sn_onu (liquidaciones)          => media
--    3) dni+nodo                        => baja (revision)
insert into public.onu_liquidacion_relacion (
  id_onu,
  liquidacion_codigo,
  regla_match,
  confianza,
  pendiente_revision,
  observacion,
  created_at
)
select
  o.id_onu,
  coalesce(det_match.liquidacion_codigo, sn_match.codigo, dni_nodo_match.codigo) as liquidacion_codigo,
  case
    when det_match.liquidacion_codigo is not null then 'id_onu_detalle'
    when sn_match.codigo is not null then 'id_onu_sn'
    when dni_nodo_match.codigo is not null then 'dni_nodo'
    else 'sin_match'
  end as regla_match,
  case
    when det_match.liquidacion_codigo is not null then 'alta'
    when sn_match.codigo is not null then 'media'
    when dni_nodo_match.codigo is not null then 'baja'
    else 'baja'
  end as confianza,
  case
    when det_match.liquidacion_codigo is not null then false
    when sn_match.codigo is not null then false
    when dni_nodo_match.codigo is not null then true
    else true
  end as pendiente_revision,
  case
    when det_match.liquidacion_codigo is not null then 'Match directo por codigo_onu en detalle liquidacion.'
    when sn_match.codigo is not null then 'Match por sn_onu en liquidaciones.'
    when dni_nodo_match.codigo is not null then 'Match por DNI+NODO (requiere revision).'
    else 'Sin match contra liquidaciones.'
  end as observacion,
  now()
from (
  select distinct trim(id_onu) as id_onu, trim(dni) as dni, trim(nodo) as nodo
  from public.historial_appsheet_onus
  where trim(coalesce(id_onu, '')) <> ''
) o
left join lateral (
  select d.liquidacion_codigo
  from public.historial_appsheet_detalle_liquidacion d
  where upper(trim(coalesce(d.codigo_onu, ''))) = upper(o.id_onu)
  order by d.updated_at desc
  limit 1
) det_match on true
left join lateral (
  select l.codigo
  from public.historial_appsheet_liquidaciones l
  where upper(trim(coalesce(l.sn_onu, ''))) = upper(o.id_onu)
  order by l.updated_at desc
  limit 1
) sn_match on true
left join lateral (
  select l.codigo
  from public.historial_appsheet_liquidaciones l
  where upper(trim(coalesce(l.dni, ''))) = upper(trim(coalesce(o.dni, '')))
    and upper(trim(coalesce(l.nodo, ''))) = upper(trim(coalesce(o.nodo, '')))
  order by l.updated_at desc
  limit 1
) dni_nodo_match on true
on conflict (id_onu) do update
set
  liquidacion_codigo = excluded.liquidacion_codigo,
  regla_match = excluded.regla_match,
  confianza = excluded.confianza,
  pendiente_revision = excluded.pendiente_revision,
  observacion = excluded.observacion,
  created_at = now();

-- =========================================================
-- CONSULTAS DE VALIDACION (solo lectura)
-- =========================================================

-- 1) Resumen equivalencia de productos.
-- select tipo_match, count(*) as total
-- from public.onu_producto_equivalencia
-- group by tipo_match
-- order by total desc;

-- 2) Productos sin match contra ARTICULOS.
-- select producto_origen
-- from public.onu_producto_equivalencia
-- where tipo_match = 'sin_match'
-- order by producto_origen;

-- 3) Tecnicos pendientes de mapear a usuarios actuales.
-- select origen_campo, codigo_origen, usuario_destino_id, usuario_destino_nombre
-- from public.onu_tecnico_equivalencia
-- where coalesce(usuario_destino_id, '') = ''
-- order by origen_campo, codigo_origen;

-- 4) Resumen de relacion ONU -> Liquidacion por confianza.
-- select confianza, regla_match, count(*) as total
-- from public.onu_liquidacion_relacion
-- group by confianza, regla_match
-- order by confianza, regla_match;

-- 5) ONUs pendientes de revision manual.
-- select id_onu, liquidacion_codigo, regla_match, observacion
-- from public.onu_liquidacion_relacion
-- where pendiente_revision = true
-- order by id_onu;
