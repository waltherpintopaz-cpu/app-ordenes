-- =========================================================
-- v3 del backfill. La v2 (20260912h) corria rapido pero perdia
-- coincidencias reales: redondeaba los puntos GPS a una cuadrícula de
-- ~11m y elegia un representante arbitrario por celda, que a veces caia
-- mas lejos de la calle que el punto real (confirmado: puntos reales a
-- 0.1-3m de su calle, pero el representante de su celda no).
--
-- Esta version usa TODOS los puntos reales (sin aproximar ninguno) pero
-- agrega un filtro barato de "esta mas o menos cerca" (~110m) ANTES de
-- calcular la distancia exacta -- descarta la gran mayoria de combinaciones
-- punto/calle sin gastar el calculo caro en ellas, sin perder precision en
-- las que si importan.
--
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
  where (rh.grafo_nodos -> (arista->>'from') ->> 'lat') is not null
    and (rh.grafo_nodos -> (arista->>'to')   ->> 'lat') is not null
),
puntos_hoy as materialized (
  select
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
join aristas_hoy a
  on a.grupo = p.grupo_volanteo
  -- filtro barato "esta mas o menos cerca" (~0.001 grados ~ 110m de margen,
  -- de sobra para no perder ningun caso real) ANTES del calculo exacto
  and least(a.lat_a, a.lat_b) - 0.001 <= p.lat
  and greatest(a.lat_a, a.lat_b) + 0.001 >= p.lat
  and least(a.lng_a, a.lng_b) - 0.001 <= p.lng
  and greatest(a.lng_a, a.lng_b) + 0.001 >= p.lng
where fn_distancia_punto_segmento_m(p.lat, p.lng, a.lat_a, a.lng_a, a.lat_b, a.lng_b) <= 10
on conflict (grupo, fecha, arista_id) do nothing;
