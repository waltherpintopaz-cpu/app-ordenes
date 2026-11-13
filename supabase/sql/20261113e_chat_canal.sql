-- Chat de la orden <-> cliente: canal (que Chatwoot recibio el mensaje) y sin
-- duplicados. Los 2 numeros de DIM (Ventas y Atencion) estan conectados al
-- Chatwoot de Americanet Y al de DIM: el mismo mensaje puede llegar por los dos
-- bots -> se guarda una sola vez. La respuesta desde la plataforma sale por el
-- canal donde el cliente escribio por ultima vez.
-- canal: 'americanet' (chat.americanet.club) | 'dim' (Chatwoot de DIM).

alter table public.chat_ordenes_mensajes add column if not exists canal text;

drop function if exists public.chat_cliente_entrante(text, text, text, bigint, text, text, text, text, text);
create or replace function public.chat_cliente_entrante(
  p_phone text, p_texto text, p_foto_url text default null, p_conv_id bigint default null,
  p_autor text default 'Cliente', p_autor_rol text default 'Cliente',
  p_audio_url text default null, p_archivo_url text default null, p_archivo_tipo text default null,
  p_canal text default null
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

  -- El mismo mensaje ya llego por el otro Chatwoot hace poco: no se repite.
  if exists (
    select 1 from public.chat_ordenes_mensajes m
     where m.orden_id = o.id
       and lower(coalesce(m.autor_rol, '')) = lower(coalesce(nullif(trim(p_autor_rol), ''), 'Cliente'))
       and m.created_at > now() - interval '3 minutes'
       and coalesce(m.texto, '') = coalesce(nullif(trim(coalesce(p_texto, '')), ''), '')
       and coalesce(m.foto_url, '') = coalesce(nullif(p_foto_url, ''), '')
       and coalesce(m.audio_url, '') = coalesce(nullif(p_audio_url, ''), '')
  ) then
    return jsonb_build_object('ok', true, 'duplicado', true, 'orden_id', o.id, 'codigo', o.codigo, 'tecnico', o.tecnico,
      'abierta', o.abierta, 'hoy', (o.abierta and o.fecha = v_hoy));
  end if;

  insert into public.chat_ordenes_mensajes (orden_id, texto, foto_url, autor, autor_rol, chatwoot_conv_id, audio_url, archivo_url, archivo_tipo, canal)
  values (o.id, nullif(trim(coalesce(p_texto, '')), ''), nullif(p_foto_url, ''),
          coalesce(nullif(trim(p_autor), ''), 'Cliente'), coalesce(nullif(trim(p_autor_rol), ''), 'Cliente'), p_conv_id,
          nullif(p_audio_url, ''), nullif(p_archivo_url, ''), nullif(p_archivo_tipo, ''), nullif(p_canal, ''));

  return jsonb_build_object('ok', true, 'orden_id', o.id, 'codigo', o.codigo, 'tecnico', o.tecnico,
    'abierta', o.abierta, 'hoy', (o.abierta and o.fecha = v_hoy));
end;
$$;
grant execute on function public.chat_cliente_entrante(text, text, text, bigint, text, text, text, text, text, text) to anon, authenticated;

-- Reclamar envio: la conversacion de Chatwoot se toma del canal pedido.
drop function if exists public.chat_cliente_reclamar_envio(bigint);
create or replace function public.chat_cliente_reclamar_envio(p_id bigint, p_canal text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.chat_ordenes_mensajes%rowtype;
  o record;
  v_conv bigint;
begin
  update public.chat_ordenes_mensajes set enviado_cliente_en = now(), envio_cliente_error = null
  where id = p_id and para_cliente and enviado_cliente_en is null and created_at > now() - interval '15 minutes'
  returning * into m;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no aplica'); end if;

  select id, codigo, celular, empresa, nombre into o from public.ordenes where id = m.orden_id;
  select chatwoot_conv_id into v_conv from public.chat_ordenes_mensajes
    where orden_id = m.orden_id and chatwoot_conv_id is not null
      and (p_canal is null or coalesce(canal, '') = p_canal)
    order by id desc limit 1;

  return jsonb_build_object('ok', true, 'id', m.id, 'texto', m.texto, 'foto_url', m.foto_url,
    'autor', m.autor, 'autor_rol', m.autor_rol, 'orden_id', o.id, 'codigo', o.codigo,
    'celular', o.celular, 'empresa', o.empresa, 'conv_id', v_conv);
end;
$$;
grant execute on function public.chat_cliente_reclamar_envio(bigint, text) to anon, authenticated;

notify pgrst, 'reload schema';
