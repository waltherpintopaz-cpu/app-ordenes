-- Chat mas interactivo (Americanet y DIM, mismo SQL):
-- 1) audios/videos/archivos del cliente dentro del chat (+ audio transcrito)
-- 2) "sigue a tu tecnico": pagina publica con la ubicacion del tecnico
-- 4) mensaje fijado arriba del chat
-- 5) @menciones (aviso mas fuerte al mencionado)

alter table public.chat_ordenes_mensajes add column if not exists audio_url text;
alter table public.chat_ordenes_mensajes add column if not exists archivo_url text;
alter table public.chat_ordenes_mensajes add column if not exists archivo_tipo text;
alter table public.chat_ordenes_mensajes add column if not exists fijado_en timestamptz;
alter table public.chat_ordenes_mensajes add column if not exists menciones text[];

alter table public.chat_tecnicos_mensajes add column if not exists fijado_en timestamptz;
alter table public.chat_tecnicos_mensajes add column if not exists menciones text[];

-- ── 1) mensaje entrante (cliente o gestor de Chatwoot) con adjuntos ───────
drop function if exists public.chat_cliente_entrante(text, text, text, bigint);
drop function if exists public.chat_cliente_entrante(text, text, text, bigint, text, text);
create or replace function public.chat_cliente_entrante(
  p_phone text, p_texto text, p_foto_url text default null, p_conv_id bigint default null,
  p_autor text default 'Cliente', p_autor_rol text default 'Cliente',
  p_audio_url text default null, p_archivo_url text default null, p_archivo_tipo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.tel9(p_phone);
  v_clientes int;
  v_lista jsonb;
  o record;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if length(v_tel) < 9 or (coalesce(trim(p_texto), '') = '' and coalesce(p_foto_url, '') = ''
      and coalesce(p_audio_url, '') = '' and coalesce(p_archivo_url, '') = '') then
    return jsonb_build_object('ok', false, 'motivo', 'sin datos');
  end if;

  create temp table if not exists _cand (id bigint, codigo text, nombre text, dni text, tecnico text, fecha date, estado text, abierta boolean) on commit drop;
  delete from _cand;
  insert into _cand
  select x.id, x.codigo, x.nombre, x.dni, x.tecnico, x.fecha_actuacion, x.estado,
         (lower(coalesce(x.estado, '')) not like '%liquidad%')
  from public.ordenes x
  where (public.tel9(x.celular) = v_tel or public.tel9(x.contacto) = v_tel)
    and lower(coalesce(x.estado, '')) not like '%cancel%'
    and (
      lower(coalesce(x.estado, '')) like '%pendient%' or lower(coalesce(x.estado, '')) like '%proceso%'
      or lower(coalesce(x.estado, '')) like '%asign%' or lower(coalesce(x.estado, '')) like '%curso%'
      or (lower(coalesce(x.estado, '')) like '%liquidad%' and x.liquidada_en > now() - interval '2 hours')
    );

  if not exists (select 1 from _cand) then
    return jsonb_build_object('ok', false, 'motivo', 'sin orden');
  end if;

  select count(distinct coalesce(nullif(trim(dni), ''), lower(trim(nombre)))) into v_clientes from _cand;
  if v_clientes > 1 then
    select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre)) into v_lista from _cand;
    return jsonb_build_object('ok', false, 'motivo', 'ambiguo', 'ordenes', v_lista);
  end if;

  select * into o from _cand
  order by abierta desc, abs(coalesce(fecha, v_hoy) - v_hoy), id desc
  limit 1;

  insert into public.chat_ordenes_mensajes (orden_id, texto, foto_url, autor, autor_rol, chatwoot_conv_id, audio_url, archivo_url, archivo_tipo)
  values (o.id, nullif(trim(coalesce(p_texto, '')), ''), nullif(p_foto_url, ''),
          coalesce(nullif(trim(p_autor), ''), 'Cliente'), coalesce(nullif(trim(p_autor_rol), ''), 'Cliente'), p_conv_id,
          nullif(p_audio_url, ''), nullif(p_archivo_url, ''), nullif(p_archivo_tipo, ''));

  return jsonb_build_object('ok', true, 'orden_id', o.id, 'codigo', o.codigo, 'tecnico', o.tecnico,
    'abierta', o.abierta, 'hoy', (o.abierta and o.fecha = v_hoy));
end;
$$;
grant execute on function public.chat_cliente_entrante(text, text, text, bigint, text, text, text, text, text) to anon, authenticated;

-- ── 2) "Sigue a tu tecnico" (pagina publica /sigue/<wifi_token>) ─────────
-- Solo da la ubicacion mientras la orden esta EN PROCESO (el tecnico apreto
-- Iniciar) y la ultima posicion es de los ultimos 20 minutos.
create or replace function public.seguimiento_orden(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record;
  u record;
  v_grupo text;
  v_estado text;
  v_lat double precision;
  v_lng double precision;
begin
  select id, codigo, empresa, estado, tecnico, ubicacion into o
    from public.ordenes where wifi_token = p_token and coalesce(p_token, '') <> '';
  if not found then return jsonb_build_object('ok', false, 'error', 'Link inválido.'); end if;

  v_estado := lower(coalesce(o.estado, ''));
  if v_estado like '%liquidad%' or v_estado like '%cancel%' then
    return jsonb_build_object('ok', true, 'fase', 'terminada', 'codigo', o.codigo, 'empresa', o.empresa);
  end if;
  if v_estado not like '%proceso%' then
    return jsonb_build_object('ok', true, 'fase', 'pendiente', 'codigo', o.codigo, 'empresa', o.empresa,
      'tecnico', split_part(trim(coalesce(o.tecnico, '')), ' ', 1));
  end if;

  -- Ubicacion del tecnico asignado; si no tiene reciente, la de su equipo.
  select t.lat, t.lng, t.updated_at, t.tecnico_nombre into u
    from public.tecnico_ubicacion_actual t
   where lower(trim(t.tecnico_nombre)) = lower(trim(coalesce(o.tecnico, '')))
     and t.updated_at > now() - interval '20 minutes'
   order by t.updated_at desc limit 1;
  if not found then
    select lower(trim(coalesce(us.grupo, ''))) into v_grupo from public.usuarios us
     where lower(trim(us.nombre)) = lower(trim(coalesce(o.tecnico, ''))) limit 1;
    if coalesce(v_grupo, '') <> '' then
      select t.lat, t.lng, t.updated_at, t.tecnico_nombre into u
        from public.tecnico_ubicacion_actual t
        join public.usuarios us on lower(trim(us.nombre)) = lower(trim(t.tecnico_nombre))
       where lower(trim(coalesce(us.grupo, ''))) = v_grupo and t.updated_at > now() - interval '20 minutes'
       order by t.updated_at desc limit 1;
    end if;
  end if;

  begin
    v_lat := nullif(split_part(regexp_replace(coalesce(o.ubicacion, ''), '\s', '', 'g'), ',', 1), '')::double precision;
    v_lng := nullif(split_part(regexp_replace(coalesce(o.ubicacion, ''), '\s', '', 'g'), ',', 2), '')::double precision;
  exception when others then v_lat := null; v_lng := null;
  end;

  return jsonb_build_object('ok', true, 'fase', case when u.lat is null then 'sin_gps' else 'en_camino' end,
    'codigo', o.codigo, 'empresa', o.empresa,
    'tecnico', split_part(trim(coalesce(o.tecnico, '')), ' ', 1),
    'lat', u.lat, 'lng', u.lng, 'actualizado', u.updated_at,
    'destino_lat', v_lat, 'destino_lng', v_lng);
end;
$$;
grant execute on function public.seguimiento_orden(text) to anon, authenticated;

-- ── 4) fijar / desfijar un mensaje ───────────────────────────────────────
create or replace function public.chat_fijar(p_tabla text, p_id bigint, p_fijar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Un solo mensaje fijado por chat: al fijar uno se desfija el anterior.
  if p_tabla = 'chat_ordenes_mensajes' then
    if p_fijar then
      update public.chat_ordenes_mensajes set fijado_en = null
       where fijado_en is not null and id <> p_id and orden_id = (select orden_id from public.chat_ordenes_mensajes where id = p_id);
    end if;
    update public.chat_ordenes_mensajes set fijado_en = case when p_fijar then now() else null end where id = p_id;
  elsif p_tabla = 'chat_tecnicos_mensajes' then
    if p_fijar then
      update public.chat_tecnicos_mensajes set fijado_en = null
       where fijado_en is not null and id <> p_id and tecnico_nombre = (select tecnico_nombre from public.chat_tecnicos_mensajes where id = p_id);
    end if;
    update public.chat_tecnicos_mensajes set fijado_en = case when p_fijar then now() else null end where id = p_id;
  else
    raise exception 'tabla invalida';
  end if;
end;
$$;
grant execute on function public.chat_fijar(text, bigint, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
