-- Notificaciones de chat estilo WhatsApp (AMERICANET) -- 2026-11-12
--
-- Una notificacion por chat (no una por mensaje), en formato conversacion,
-- con Responder y Marcar como leido. La dibuja la APK nueva
-- (android/.../chatnotif/ChatNotif.kt), que registra token_type = 'fcm_conv'.
--
-- 1) Los avisos de chat llevan ahora en "data" lo que necesita la app para
--    armar la conversacion (chat_key, chat_titulo, autor, texto, msg_id, ts).
--    Las APK viejas ignoran esos campos: no cambia nada para ellas.
-- 2) chat_push_enviar: si el destinatario tiene la APK nueva (fcm_conv), el
--    chat va por la Edge Function NUEVA "send-chat-conv" (solo datos); si no,
--    por "send-push-notification" como siempre.
--
-- REQUISITO: desplegar antes la Edge Function send-chat-conv
-- (supabase/functions/send-chat-conv/index.ts) con "Verify JWT" APAGADO,
-- igual que send-push-notification. Si no existe, los celulares con la APK
-- nueva se quedarian sin aviso de chat.

create or replace function public.chat_push_enviar(p_nombre text, p_title text, p_body text, p_data jsonb, p_android jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  k text := 'sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_';
  v_conv boolean := false;
  v_funcion text := 'send-push-notification';
  v_data jsonb := p_data;
begin
  if coalesce(trim(p_nombre), '') = '' then return; end if;
  if coalesce(p_data->>'chat_key', '') <> '' then
    select exists (
      select 1 from public.push_tokens t
       where lower(trim(t.username)) = lower(trim(p_nombre)) and t.token_type = 'fcm_conv'
    ) into v_conv;
  end if;
  if v_conv then
    v_funcion := 'send-chat-conv';
  else
    -- Aviso clasico: sin los campos de conversacion (mas liviano).
    v_data := p_data - 'chat_key' - 'chat_titulo' - 'autor' - 'texto' - 'msg_id' - 'ts';
  end if;
  perform net.http_post(
    url := 'https://vgwbqbzpjlbkmxtfghdm.supabase.co/functions/v1/' || v_funcion,
    body := jsonb_build_object('tecnico_nombre', trim(p_nombre), 'title', p_title, 'body', p_body, 'data', v_data, 'android', p_android),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k, 'Authorization', 'Bearer ' || k)
  );
end
$$;

create or replace function public.chat_ordenes_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_opc jsonb;
  v_pref text;
  v_codigo text;
  v_cliente text;
  v_tecnico text;
  v_cont text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_es_tec boolean;
  v_nombre text;
  v_urg boolean := coalesce(new.urgente, false);
  v_android jsonb;
begin
  v_opc := public.chat_push_opciones();
  -- Los urgentes se avisan aunque los avisos de chat esten apagados.
  if v_opc is null and not v_urg then return new; end if;
  v_pref := coalesce(v_opc->>'prefijo', '');
  v_android := public.chat_push_android(v_urg, v_opc);

  select o.codigo::text, o.nombre::text, o.tecnico::text into v_codigo, v_cliente, v_tecnico from public.ordenes o where o.id = new.orden_id;
  v_cont := coalesce(nullif(trim(new.texto), ''), case when new.foto_url is not null then '📷 Foto' else '' end);
  v_title := case when v_urg then '🚨 URGENTE · '
                  when v_pref <> '' then v_pref || ' ' else '' end
             || 'Orden' || coalesce(' ' || v_codigo, '');
  v_body := coalesce(new.autor, '') || ': ' || v_cont;
  v_data := jsonb_build_object(
    'tipo', 'chat_orden', 'orden_id', new.orden_id::text, 'urgente', case when v_urg then '1' else '' end,
    'chat_key', 'orden:' || new.orden_id::text,
    'chat_titulo', concat_ws(' · ', coalesce(nullif(v_codigo, ''), 'Orden'), nullif(trim(coalesce(v_cliente, '')), '')),
    'autor', coalesce(new.autor, ''),
    'texto', v_cont,
    'msg_id', new.id::text,
    'ts', (floor(extract(epoch from coalesce(new.created_at, now())) * 1000))::bigint::text
  );
  v_es_tec := public.chat_rol_norm(new.autor_rol) = 'tecnico';

  for v_nombre in
    select distinct trim(u.nombre) from public.usuarios u
     where u.activo is true and public.chat_rol_norm(u.rol) = 'administrador'
    union
    select trim(v_tecnico) where not v_es_tec and coalesce(trim(v_tecnico), '') <> ''
  loop
    if lower(v_nombre) <> lower(trim(coalesce(new.autor, ''))) then
      perform public.chat_push_enviar(v_nombre, v_title, v_body, v_data, v_android);
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'chat_ordenes_push: %', sqlerrm;
  return new;
end
$$;

create or replace function public.chat_tecnicos_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_opc jsonb;
  v_pref text;
  v_cont text;
  v_title text;
  v_data jsonb;
  v_nombre text;
  v_urg boolean := coalesce(new.urgente, false);
  v_android jsonb;
begin
  v_opc := public.chat_push_opciones();
  if v_opc is null and not v_urg then return new; end if;
  v_pref := coalesce(v_opc->>'prefijo', '');
  v_android := public.chat_push_android(v_urg, v_opc);

  v_cont := coalesce(nullif(trim(new.texto), ''), case when new.foto_url is not null then '📷 Foto' else '' end);
  v_title := case when v_urg then '🚨 URGENTE · '
                  when v_pref <> '' then v_pref || ' ' else '' end
             || coalesce(new.autor, '');
  v_data := jsonb_build_object(
    'tipo', 'chat_tecnico', 'tecnico_nombre', new.tecnico_nombre, 'urgente', case when v_urg then '1' else '' end,
    'chat_key', 'tecnico:' || trim(coalesce(new.tecnico_nombre, '')),
    'autor', coalesce(new.autor, ''),
    'texto', v_cont,
    'msg_id', new.id::text,
    'ts', (floor(extract(epoch from coalesce(new.created_at, now())) * 1000))::bigint::text
  );

  if public.chat_rol_norm(new.autor_rol) = 'tecnico' then
    -- Lo reciben gestoras/admins: el chat se llama como el tecnico.
    v_data := v_data || jsonb_build_object('chat_titulo', '👷 ' || coalesce(new.tecnico_nombre, ''));
    for v_nombre in
      select distinct trim(u.nombre) from public.usuarios u
       where u.activo is true and public.chat_rol_norm(u.rol) in ('gestora', 'administrador')
    loop
      if lower(v_nombre) <> lower(trim(coalesce(new.autor, ''))) then
        perform public.chat_push_enviar(v_nombre, v_title, v_cont, v_data, v_android);
      end if;
    end loop;
  elsif lower(trim(coalesce(new.tecnico_nombre, ''))) <> lower(trim(coalesce(new.autor, ''))) then
    -- Lo recibe el tecnico: el chat se llama "Oficina".
    v_data := v_data || jsonb_build_object('chat_titulo', '🏢 Oficina');
    perform public.chat_push_enviar(new.tecnico_nombre, v_title, v_cont, v_data, v_android);
  end if;
  return new;
exception when others then
  raise warning 'chat_tecnicos_push: %', sqlerrm;
  return new;
end
$$;
