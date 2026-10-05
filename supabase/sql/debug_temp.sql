create or replace function fn_debug_cobertura(p_tecnico_id text)
returns table(
  punto_lat double precision, punto_lng double precision, punto_created_at timestamptz,
  arista_id text, dist double precision
)
language sql
stable
as $$
  with r as (
    select grupo, tecnico_id, tecnico_nombre, grafo_nodos, grafo_aristas
    from volanteo_rutas_asignadas
    where tecnico_id = p_tecnico_id
      and fecha = (now() at time zone 'America/Lima')::date
      and confirmada = true
    limit 1
  ),
  e as (
    select
      arista->>'id' as arista_id,
      (r.grafo_nodos -> (arista->>'from') ->> 'lat')::double precision as lat_a,
      (r.grafo_nodos -> (arista->>'from') ->> 'lng')::double precision as lng_a,
      (r.grafo_nodos -> (arista->>'to')   ->> 'lat')::double precision as lat_b,
      (r.grafo_nodos -> (arista->>'to')   ->> 'lng')::double precision as lng_b
    from r
    cross join lateral jsonb_array_elements(r.grafo_aristas) as arista
  ),
  p as (
    select lat, lng, created_at
    from tecnico_ubicaciones
    where tecnico_id = p_tecnico_id
    order by created_at desc
    limit 5
  )
  select p.lat, p.lng, p.created_at, e.arista_id,
         fn_distancia_punto_segmento_m(p.lat, p.lng, e.lat_a, e.lng_a, e.lat_b, e.lng_b) as dist
  from p cross join e
  order by dist asc
  limit 10;
$$;
