-- Chat con el cliente + WiFi del cliente (Americanet y DIM, mismo SQL).
-- 1) Mensajes de WhatsApp del cliente se copian al chat de su orden abierta
--    (o liquidada hace menos de 2 horas). Lo llama el bot (RPC chat_cliente_entrante).
-- 2) Desde el chat de la orden se le puede escribir al cliente (para_cliente=true);
--    el bot lo envia por Chatwoot (RPC chat_cliente_reclamar_envio).
-- 3) El cliente elige nombre y clave de su WiFi por un link (wifi_token).

-- ── columnas ─────────────────────────────────────────────────────────────
alter table public.chat_ordenes_mensajes add column if not exists para_cliente boolean not null default false;
alter table public.chat_ordenes_mensajes add column if not exists enviado_cliente_en timestamptz;
alter table public.chat_ordenes_mensajes add column if not exists envio_cliente_error text;
alter table public.chat_ordenes_mensajes add column if not exists chatwoot_conv_id bigint;

alter table public.ordenes add column if not exists liquidada_en timestamptz;
alter table public.ordenes add column if not exists wifi_token text;
alter table public.ordenes add column if not exists wifi_nombre text;
alter table public.ordenes add column if not exists wifi_clave text;
alter table public.ordenes add column if not exists wifi_guardado_en timestamptz;
alter table public.ordenes add column if not exists wifi_solo_24 boolean not null default false;

update public.ordenes set wifi_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20) where wifi_token is null;
alter table public.ordenes alter column wifi_token set default substr(md5(random()::text || clock_timestamp()::text), 1, 20);
create unique index if not exists ordenes_wifi_token_idx on public.ordenes (wifi_token);

alter table public.whatsapp_config add column if not exists template_en_camino text;
alter table public.whatsapp_config add column if not exists template_bienvenida text;
alter table public.whatsapp_config add column if not exists wifi_link_base text;

-- ── fecha de liquidacion (para la ventana de 2 horas) ────────────────────
create or replace function public.ordenes_marcar_liquidada_en() returns trigger
language plpgsql as $$
begin
  if lower(coalesce(new.estado, '')) like '%liquidad%' and lower(coalesce(old.estado, '')) not like '%liquidad%' then
    new.liquidada_en := now();
  end if;
  return new;
end;
$$;
drop trigger if exists ordenes_marcar_liquidada_en on public.ordenes;
create trigger ordenes_marcar_liquidada_en before update of estado on public.ordenes
  for each row execute function public.ordenes_marcar_liquidada_en();

-- ── helpers ──────────────────────────────────────────────────────────────
create or replace function public.tel9(p text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9) $$;

-- ── 1) mensaje entrante del cliente ──────────────────────────────────────
drop function if exists public.chat_cliente_entrante(text, text, text, bigint);
-- p_autor/p_autor_rol: 'Cliente' (mensaje entrante) o el gestor que respondio en Chatwoot (rol 'Chatwoot').
create or replace function public.chat_cliente_entrante(
  p_phone text, p_texto text, p_foto_url text default null, p_conv_id bigint default null,
  p_autor text default 'Cliente', p_autor_rol text default 'Cliente'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := public.tel9(p_phone);
  v_clientes int;
  v_lista jsonb;
  o record;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if length(v_tel) < 9 or (coalesce(trim(p_texto), '') = '' and coalesce(p_foto_url, '') = '') then
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

  -- Mismo numero en ordenes de clientes distintos: no se adivina.
  select count(distinct coalesce(nullif(trim(dni), ''), lower(trim(nombre)))) into v_clientes from _cand;
  if v_clientes > 1 then
    select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre)) into v_lista from _cand;
    return jsonb_build_object('ok', false, 'motivo', 'ambiguo', 'ordenes', v_lista);
  end if;

  select * into o from _cand
  order by abierta desc, abs(coalesce(fecha, v_hoy) - v_hoy), id desc
  limit 1;

  insert into public.chat_ordenes_mensajes (orden_id, texto, foto_url, autor, autor_rol, chatwoot_conv_id)
  values (o.id, nullif(trim(coalesce(p_texto, '')), ''), nullif(p_foto_url, ''), coalesce(nullif(trim(p_autor), ''), 'Cliente'), coalesce(nullif(trim(p_autor_rol), ''), 'Cliente'), p_conv_id);

  return jsonb_build_object('ok', true, 'orden_id', o.id, 'codigo', o.codigo, 'tecnico', o.tecnico,
    'abierta', o.abierta, 'hoy', (o.abierta and o.fecha = v_hoy));
end;
$$;
grant execute on function public.chat_cliente_entrante(text, text, text, bigint, text, text) to anon, authenticated;

-- ── 2) mensaje del chat que hay que mandarle al cliente ──────────────────
-- Lo "reclama" una sola vez (evita envios dobles) y devuelve a donde mandarlo.
create or replace function public.chat_cliente_reclamar_envio(p_id bigint) returns jsonb
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
    where orden_id = m.orden_id and chatwoot_conv_id is not null order by id desc limit 1;

  return jsonb_build_object('ok', true, 'id', m.id, 'texto', m.texto, 'foto_url', m.foto_url,
    'autor', m.autor, 'autor_rol', m.autor_rol, 'orden_id', o.id, 'codigo', o.codigo,
    'celular', o.celular, 'empresa', o.empresa, 'conv_id', v_conv);
end;
$$;
grant execute on function public.chat_cliente_reclamar_envio(bigint) to anon, authenticated;

create or replace function public.chat_cliente_error_envio(p_id bigint, p_error text) returns void
language sql security definer set search_path = public as $$
  update public.chat_ordenes_mensajes set enviado_cliente_en = null, envio_cliente_error = left(coalesce(p_error, 'error'), 300)
  where id = p_id and para_cliente;
$$;
grant execute on function public.chat_cliente_error_envio(bigint, text) to anon, authenticated;

-- ── 3) formulario WiFi del cliente ───────────────────────────────────────
create or replace function public.wifi_form_info(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select id, codigo, nombre, empresa, estado, wifi_nombre, wifi_clave, wifi_guardado_en
    into o from public.ordenes where wifi_token = p_token and coalesce(p_token, '') <> '';
  if not found then return jsonb_build_object('ok', false, 'error', 'Link inválido.'); end if;
  return jsonb_build_object('ok', true,
    'codigo', o.codigo,
    'nombre', initcap(lower(split_part(trim(coalesce(o.nombre, '')), ' ', 1))),
    'empresa', o.empresa,
    'wifi_nombre', o.wifi_nombre, 'wifi_clave', o.wifi_clave, 'guardado_en', o.wifi_guardado_en,
    'editable', lower(coalesce(o.estado, '')) not like '%liquidad%' and lower(coalesce(o.estado, '')) not like '%cancel%');
end;
$$;
grant execute on function public.wifi_form_info(text) to anon, authenticated;

create or replace function public.wifi_form_guardar(p_token text, p_nombre text, p_clave text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_nom text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_clave text := trim(coalesce(p_clave, ''));
begin
  select id, estado into o from public.ordenes where wifi_token = p_token and coalesce(p_token, '') <> '' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Link inválido.'); end if;
  if lower(coalesce(o.estado, '')) like '%liquidad%' or lower(coalesce(o.estado, '')) like '%cancel%' then
    return jsonb_build_object('ok', false, 'error', 'Esta instalación ya terminó. Si necesitas cambiar tu WiFi, escríbenos por WhatsApp.');
  end if;
  if length(v_nom) < 1 or length(v_nom) > 27 then
    return jsonb_build_object('ok', false, 'error', 'El nombre debe tener entre 1 y 27 caracteres.');
  end if;
  if length(v_clave) < 8 or length(v_clave) > 63 then
    return jsonb_build_object('ok', false, 'error', 'La clave debe tener entre 8 y 63 caracteres.');
  end if;

  update public.ordenes set wifi_nombre = v_nom, wifi_clave = v_clave, wifi_guardado_en = now() where id = o.id;

  insert into public.chat_ordenes_mensajes (orden_id, texto, autor, autor_rol)
  values (o.id, '📶 El cliente eligió su WiFi:' || E'\n' || v_nom || ' 2.4G' || E'\n' || v_nom || ' 5G' || E'\n' || '🔑 Clave: ' || v_clave,
          'Cliente', 'Cliente');

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.wifi_form_guardar(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
