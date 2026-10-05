create or replace function fn_debug_cobertura3(p_tecnico_id text)
returns table(
  paso text, valor text
)
language plpgsql
as $$
declare
  v_grupo text;
  v_count_puntos int;
  v_count_join_grupo int;
  v_count_join_bbox int;
begin
  select grupo_volanteo into v_grupo from usuarios where id::text = p_tecnico_id limit 1;
  return query select 'grupo_volanteo (usuarios)'::text, coalesce(v_grupo, 'NULL');

  select count(*) into v_count_puntos
  from tecnico_ubicaciones u
  where u.tecnico_id = p_tecnico_id
    and u.tecnico_rol = 'Volanteador'
    and u.lat is not null and u.lng is not null
    and (u.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date;
  return query select 'puntos_hoy (solo este tecnico)'::text, v_count_puntos::text;

  select count(*) into v_count_join_grupo
  from (
    select u.lat, u.lng, usr.grupo_volanteo
    from tecnico_ubicaciones u
    join usuarios usr on usr.id::text = u.tecnico_id
    where u.tecnico_id = p_tecnico_id
      and u.lat is not null and u.lng is not null
      and (u.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
  ) p
  join (
    select r.grupo,
      (r.grafo_nodos -> (arista->>'from') ->> 'lat')::double precision as lat_a,
      (r.grafo_nodos -> (arista->>'from') ->> 'lng')::double precision as lng_a,
      (r.grafo_nodos -> (arista->>'to')   ->> 'lat')::double precision as lat_b,
      (r.grafo_nodos -> (arista->>'to')   ->> 'lng')::double precision as lng_b
    from volanteo_rutas_asignadas r
    cross join lateral jsonb_array_elements(r.grafo_aristas) as arista
    where r.grupo = v_grupo
      and r.fecha = (now() at time zone 'America/Lima')::date and r.confirmada = true
  ) a on a.grupo = p.grupo_volanteo;
  return query select 'join solo por grupo (para este tecnico)'::text, v_count_join_grupo::text;

  select count(*) into v_count_join_bbox
  from (
    select u.lat, u.lng, usr.grupo_volanteo
    from tecnico_ubicaciones u
    join usuarios usr on usr.id::text = u.tecnico_id
    where u.tecnico_id = p_tecnico_id
      and u.lat is not null and u.lng is not null
      and (u.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
  ) p
  join (
    select r.grupo,
      (r.grafo_nodos -> (arista->>'from') ->> 'lat')::double precision as lat_a,
      (r.grafo_nodos -> (arista->>'from') ->> 'lng')::double precision as lng_a,
      (r.grafo_nodos -> (arista->>'to')   ->> 'lat')::double precision as lat_b,
      (r.grafo_nodos -> (arista->>'to')   ->> 'lng')::double precision as lng_b
    from volanteo_rutas_asignadas r
    cross join lateral jsonb_array_elements(r.grafo_aristas) as arista
    where r.grupo = v_grupo
      and r.fecha = (now() at time zone 'America/Lima')::date and r.confirmada = true
  ) a
    on a.grupo = p.grupo_volanteo
    and least(a.lat_a, a.lat_b) - 0.001 <= p.lat
    and greatest(a.lat_a, a.lat_b) + 0.001 >= p.lat
    and least(a.lng_a, a.lng_b) - 0.001 <= p.lng
    and greatest(a.lng_a, a.lng_b) + 0.001 >= p.lng;
  return query select 'join grupo + bbox (para este tecnico)'::text, v_count_join_bbox::text;

  return;
end;
$$;
