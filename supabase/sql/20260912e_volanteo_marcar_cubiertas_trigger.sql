-- =========================================================
-- Marca calles como cubiertas automaticamente en el servidor, cada vez que
-- llega un punto GPS nuevo -- en vez de depender de que el celular del
-- volanteador tenga la pantalla del mapa abierta en primer plano (esa
-- logica vivia solo en VolanteoMapaScreen.js, en React, y por eso nunca se
-- disparaba si la persona caminaba con el celular guardado).
--
-- El registro de tecnico_ubicaciones YA es confiable pase lo que pase con
-- la app (lo hace el servicio nativo de Android sin parar) -- este trigger
-- aprovecha eso: cada insert ahi dispara la revision de cercania contra las
-- calles pendientes de TODO el grupo ese dia (no solo las propias, para
-- seguir contando la ayuda entre companeros igual que antes), y marca como
-- cubiertas las que esten a <=10m (mismo umbral que usaba la app).
--
-- Nunca debe romper el insert de tecnico_ubicaciones si algo sale mal aca
-- (el registro del recorrido importa mas que el marcado de cobertura) --
-- por eso el catch-all al final.
--
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

-- Misma formula que distanciaPuntoASegmentoM en src/utils/rutaVolanteo.js:
-- proyeccion plana (aproximacion valida a esta escala) del punto sobre el
-- segmento, clampeada a los extremos, y distancia euclidiana en metros.
create or replace function fn_distancia_punto_segmento_m(
  p_lat double precision, p_lng double precision,
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language plpgsql
immutable
as $$
declare
  m_lat double precision := 111320.0;
  m_lng double precision := 111320.0 * cos(radians(lat1));
  px double precision := (p_lng - lng1) * m_lng;
  py double precision := (p_lat - lat1) * m_lat;
  bx double precision := (lng2 - lng1) * m_lng;
  by_m double precision := (lat2 - lat1) * m_lat;
  largo2 double precision := bx*bx + by_m*by_m;
  t double precision;
begin
  if largo2 > 0 then
    t := greatest(0.0, least(1.0, ((px * bx) + (py * by_m)) / largo2));
  else
    t := 0.0;
  end if;
  return sqrt(power(px - t*bx, 2) + power(py - t*by_m, 2));
end;
$$;

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

  -- Convierte a fecha calendario de Peru (created_at viene en UTC) para que
  -- coincida con el "fecha" que guarda la app (hora local del celular).
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

drop trigger if exists trg_marcar_calles_cubiertas on tecnico_ubicaciones;
create trigger trg_marcar_calles_cubiertas
  after insert on tecnico_ubicaciones
  for each row
  execute function fn_marcar_calles_cubiertas();
