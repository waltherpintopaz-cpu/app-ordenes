-- =========================================================
-- Version optimizada del backfill (20260912g se quedo sin tiempo en el
-- editor: re-calculaba todas las calles por CADA punto GPS, miles de veces).
-- Esta version: (1) calcula las calles de cada ruta UNA sola vez
-- (materialized), (2) agrupa puntos GPS casi identicos en celdas de ~11m
-- antes de comparar, para no repetir el mismo calculo miles de veces con
-- puntos casi iguales (perfiles que graban cada 1s, o la persona parada).
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

with rutas_hoy as materialized (
  select r.grupo, r.tecnico_id, r.tecnico_nombre, r.grafo_nodos, r.grafo_aristas
  from volanteo_rutas_asignadas r
  where r.fecha = (now() at time zone 'America/Lima')::date
    and r.confirmada = true
),
aristas_hoy as materialized (
  select
    rh.grupo, rh.tecnico_id, rh.tecnico_nombre,
    arista->>'id' as arista_id,
    arista->>'wayId' as way_id,
    (rh.grafo_nodos -> (arista->>'from') ->> 'lat')::double precision as lat_a,
    (rh.grafo_nodos -> (arista->>'from') ->> 'lng')::double precision as lng_a,
    (rh.grafo_nodos -> (arista->>'to')   ->> 'lat')::double precision as lat_b,
    (rh.grafo_nodos -> (arista->>'to')   ->> 'lng')::double precision as lng_b
  from rutas_hoy rh
  cross join lateral jsonb_array_elements(rh.grafo_aristas) as arista
),
puntos_hoy as materialized (
  select distinct on (u.tecnico_id, round(u.lat::numeric, 4), round(u.lng::numeric, 4))
    u.tecnico_id, u.lat, u.lng, u.created_at, usr.grupo_volanteo,
    coalesce(usr.alias_volanteo, usr.nombre) as tecnico_nombre_actual
  from tecnico_ubicaciones u
  join usuarios usr on usr.id::text = u.tecnico_id
  where u.tecnico_rol = 'Volanteador'
    and u.lat is not null and u.lng is not null
    and (u.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
)
insert into volanteo_calles_cubiertas (
  grupo, fecha, arista_id, way_id, dueno_tecnico_id, dueno_tecnico_nombre,
  cubierto_por_id, cubierto_por_nombre, cubierto_en
)
select
  p.grupo_volanteo, (now() at time zone 'America/Lima')::date, a.arista_id, a.way_id,
  a.tecnico_id, a.tecnico_nombre,
  p.tecnico_id, p.tecnico_nombre_actual,
  p.created_at
from puntos_hoy p
join aristas_hoy a on a.grupo = p.grupo_volanteo
where a.lat_a is not null and a.lng_a is not null and a.lat_b is not null and a.lng_b is not null
  and fn_distancia_punto_segmento_m(p.lat, p.lng, a.lat_a, a.lng_a, a.lat_b, a.lng_b) <= 10
on conflict (grupo, fecha, arista_id) do nothing;
