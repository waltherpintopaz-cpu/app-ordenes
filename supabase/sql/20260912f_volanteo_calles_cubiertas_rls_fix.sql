-- =========================================================
-- Supabase reactivo solo RLS en volanteo_calles_cubiertas (ya le habia
-- pasado antes a volanteo_rutas_asignadas, ver 20260909c) -- eso hacia que
-- el trigger de marcar cobertura fallara con "new row violates row-level
-- security policy" en cada intento. Se vuelve a desactivar, y de paso se
-- restaura la version del trigger con el catch-all (nunca debe poder
-- romper el insert de tecnico_ubicaciones).
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table volanteo_calles_cubiertas disable row level security;

create or replace function fn_marcar_calles_cubiertas()
returns trigger
language plpgsql
as $$
declare
  v_fecha date;
  v_grupo text;
  v_tecnico_nombre text;
begin
  if NEW.tecnico_rol is distinct from 'Volanteador' then
    return NEW;
  end if;
  if NEW.lat is null or NEW.lng is null then
    return NEW;
  end if;

  v_fecha := (NEW.created_at at time zone 'America/Lima')::date;

  select grupo_volanteo, coalesce(alias_volanteo, nombre)
    into v_grupo, v_tecnico_nombre
  from usuarios
  where id::text = NEW.tecnico_id
  limit 1;

  if v_grupo is null then
    return NEW;
  end if;

  insert into volanteo_calles_cubiertas (
    grupo, fecha, arista_id, way_id, dueno_tecnico_id, dueno_tecnico_nombre,
    cubierto_por_id, cubierto_por_nombre, cubierto_en
  )
  select
    v_grupo, v_fecha, e.arista_id, e.way_id, r.tecnico_id, r.tecnico_nombre,
    NEW.tecnico_id, v_tecnico_nombre, NEW.created_at
  from volanteo_rutas_asignadas r
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
  where r.grupo = v_grupo
    and r.fecha = v_fecha
    and r.confirmada = true
    and e.lat_a is not null and e.lng_a is not null and e.lat_b is not null and e.lng_b is not null
    and fn_distancia_punto_segmento_m(NEW.lat, NEW.lng, e.lat_a, e.lng_a, e.lat_b, e.lng_b) <= 10
  on conflict (grupo, fecha, arista_id) do nothing;

  return NEW;
exception when others then
  return NEW;
end;
$$;
