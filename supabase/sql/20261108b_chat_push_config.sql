-- Americanet: los avisos de chat usan la configuracion de la web
-- (Configuracion > Notificaciones, tabla notificaciones_config):
-- encendido/apagado, prefijo del titulo, color, icono y sonido (canal).
-- Requiere 20261108_chat_push_trigger.sql y 20261108_notificaciones_config.sql.
-- La Edge Function send-push-notification debe pasar el campo "android"
-- (channelId, icon, color) al mensaje de FCM.

-- Envio con opciones de Android (canal / icono / color).
create or replace function public.chat_push_enviar(p_nombre text, p_title text, p_body text, p_data jsonb, p_android jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  k text := 'sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_';
begin
  if coalesce(trim(p_nombre), '') = '' then return; end if;
  perform net.http_post(
    url := 'https://vgwbqbzpjlbkmxtfghdm.supabase.co/functions/v1/send-push-notification',
    body := jsonb_build_object('tecnico_nombre', trim(p_nombre), 'title', p_title, 'body', p_body, 'data', p_data, 'android', p_android),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k, 'Authorization', 'Bearer ' || k)
  );
end
$$;

-- Opciones de chat segun la config. Devuelve null si los avisos de chat
-- estan apagados.
create or replace function public.chat_push_opciones()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_icono text;
  v_sonido text;
  v_color text;
begin
  select * into c from public.notificaciones_config where id = 1;
  if found and c.chat_activo is false then return null; end if;
  v_icono := case when found and c.chat_icono in ('globo', 'campana', 'sobre') then c.chat_icono else 'globo' end;
  v_sonido := case when found and c.chat_sonido in ('predeterminado', 'burbuja', 'doble', 'campana') then c.chat_sonido else 'burbuja' end;
  v_color := case when found and c.chat_color ~ '^#[0-9A-Fa-f]{6}$' then c.chat_color else '#F47A20' end;
  return jsonb_build_object(
    'prefijo', case when found then coalesce(trim(c.chat_prefijo), '') else '💬' end,
    'android', jsonb_build_object('channelId', 'chat_' || v_sonido, 'icon', 'notif_chat_' || v_icono, 'color', v_color)
  );
end
$$;

-- ── Chat de la orden ─────────────────────────────────────────────────────
create or replace function public.chat_ordenes_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_opc jsonb;
  v_pref text;
  v_codigo text;
  v_tecnico text;
  v_cont text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_es_tec boolean;
  v_nombre text;
begin
  v_opc := public.chat_push_opciones();
  if v_opc is null then return new; end if;
  v_pref := coalesce(v_opc->>'prefijo', '');

  select o.codigo::text, o.tecnico::text into v_codigo, v_tecnico from public.ordenes o where o.id = new.orden_id;
  v_cont := coalesce(nullif(trim(new.texto), ''), case when new.foto_url is not null then '📷 Foto' else '' end);
  v_title := case when v_pref <> '' then v_pref || ' ' else '' end
             || case when coalesce(new.urgente, false) then '🚨 URGENTE · ' else '' end
             || 'Orden' || coalesce(' ' || v_codigo, '');
  v_body := coalesce(new.autor, '') || ': ' || v_cont;
  v_data := jsonb_build_object('tipo', 'chat_orden', 'orden_id', new.orden_id::text);
  v_es_tec := public.chat_rol_norm(new.autor_rol) = 'tecnico';

  for v_nombre in
    select distinct trim(u.nombre) from public.usuarios u
     where u.activo is true and public.chat_rol_norm(u.rol) = 'administrador'
    union
    select trim(v_tecnico) where not v_es_tec and coalesce(trim(v_tecnico), '') <> ''
  loop
    if lower(v_nombre) <> lower(trim(coalesce(new.autor, ''))) then
      perform public.chat_push_enviar(v_nombre, v_title, v_body, v_data, v_opc->'android');
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'chat_ordenes_push: %', sqlerrm;
  return new;
end
$$;

-- ── Chat con oficina (hilo por tecnico) ──────────────────────────────────
create or replace function public.chat_tecnicos_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_opc jsonb;
  v_pref text;
  v_cont text;
  v_title text;
  v_data jsonb;
  v_nombre text;
begin
  v_opc := public.chat_push_opciones();
  if v_opc is null then return new; end if;
  v_pref := coalesce(v_opc->>'prefijo', '');

  v_cont := coalesce(nullif(trim(new.texto), ''), case when new.foto_url is not null then '📷 Foto' else '' end);
  v_title := case when v_pref <> '' then v_pref || ' ' else '' end || coalesce(new.autor, '');
  v_data := jsonb_build_object('tipo', 'chat_tecnico', 'tecnico_nombre', new.tecnico_nombre);

  if public.chat_rol_norm(new.autor_rol) = 'tecnico' then
    for v_nombre in
      select distinct trim(u.nombre) from public.usuarios u
       where u.activo is true and public.chat_rol_norm(u.rol) in ('gestora', 'administrador')
    loop
      if lower(v_nombre) <> lower(trim(coalesce(new.autor, ''))) then
        perform public.chat_push_enviar(v_nombre, v_title, v_cont, v_data, v_opc->'android');
      end if;
    end loop;
  elsif lower(trim(coalesce(new.tecnico_nombre, ''))) <> lower(trim(coalesce(new.autor, ''))) then
    perform public.chat_push_enviar(new.tecnico_nombre, v_title, v_cont, v_data, v_opc->'android');
  end if;
  return new;
exception when others then
  raise warning 'chat_tecnicos_push: %', sqlerrm;
  return new;
end
$$;
