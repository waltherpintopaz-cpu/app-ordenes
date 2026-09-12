-- =========================================================
-- Recuperacion unica: aplica la misma revision del trigger nuevo a TODOS
-- los puntos GPS que ya se grabaron HOY antes de que el trigger existiera
-- (o mientras RLS lo bloqueaba) -- para no perder el avance de lo que ya
-- caminaron, en vez de que solo cuente desde ahora en adelante.
--
-- Es una corrida unica (no queda nada instalado permanente aca, solo el
-- INSERT). Puede tardar unos segundos si el equipo ya acumulo muchos
-- puntos hoy -- es normal, dejarlo correr.
--
-- Ejecutar una sola vez en Supabase SQL Editor (solo por hoy -- si hace
-- falta recuperar otro dia especifico, cambiar la fecha del filtro de mas
-- abajo).
-- =========================================================

insert into volanteo_calles_cubiertas (
  grupo, fecha, arista_id, way_id, dueno_tecnico_id, dueno_tecnico_nombre,
  cubierto_por_id, cubierto_por_nombre, cubierto_en
)
select
  usr.grupo_volanteo,
  (u.created_at at time zone 'America/Lima')::date,
  e.arista_id, e.way_id,
  r.tecnico_id, r.tecnico_nombre,
  u.tecnico_id, coalesce(usr.alias_volanteo, usr.nombre),
  u.created_at
from tecnico_ubicaciones u
join usuarios usr on usr.id::text = u.tecnico_id
join volanteo_rutas_asignadas r
  on r.grupo = usr.grupo_volanteo
  and r.fecha = (u.created_at at time zone 'America/Lima')::date
  and r.confirmada = true
cross join lateral (
  select
    arista->>'id' as arista_id,
    arista->>'wayId' as way_id,
    (r.grafo_nodos -> (arista->>'from') ->> 'lat')::double precision as lat_a,
    (r.grafo_nodos -> (arista->>'from') ->> 'lng')::double precision as lng_a,
    (r.grafo_nodos -> (arista->>'to')   ->> 'lat')::double precision as lat_b,
    (r.grafo_nodos -> (arista->>'to')   ->> 'lng')::double precision as lng_b
  from jsonb_array_elements(r.grafo_aristas) as arista
) e
where u.tecnico_rol = 'Volanteador'
  and u.lat is not null and u.lng is not null
  and (u.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
  and e.lat_a is not null and e.lng_a is not null and e.lat_b is not null and e.lng_b is not null
  and fn_distancia_punto_segmento_m(u.lat, u.lng, e.lat_a, e.lng_a, e.lat_b, e.lng_b) <= 10
on conflict (grupo, fecha, arista_id) do nothing;
