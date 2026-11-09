-- AMERICANET: boton 🚨 Urgente en TODOS los chats (orden y chat con oficina),
-- para tecnicos Y oficina. 2026-11-09.
--   - escribe el tecnico  -> WhatsApp a la oficina (grupo/numeros) + push fuerte
--   - escribe la oficina  -> WhatsApp al celular del tecnico (usuarios.celular)
--                            + push fuerte en su app
-- WhatsApp: lo manda dim-notificaciones-server. Este trigger solo le pasa el
-- id del mensaje; el servidor lo relee de esta base antes de mandar nada.
-- Push: los triggers de chat de 20261108b, ahora con canal "urgente".
-- Requiere 20261108_chat_push_trigger.sql y 20261108b_chat_push_config.sql.

alter table public.chat_ordenes_mensajes
  add column if not exists urgente boolean not null default false;
alter table public.chat_tecnicos_mensajes
  add column if not exists urgente boolean not null default false;

alter table public.alertas_whatsapp_config
  add column if not exists aviso_tecnico_whatsapp boolean not null default true,
  add column if not exists push_fuerte boolean not null default true;

-- ── Aviso de urgentes al servidor de WhatsApp ────────────────────────────
create or replace function public.chat_urgente_aviso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.urgente, false) then
    perform net.http_post(
      url := 'https://n8n-notificacionesdim.0lthka.easypanel.host/aviso/'
             || case when tg_table_name = 'chat_tecnicos_mensajes' then 'chat-tecnicos-americanet' else 'chat-ordenes-americanet' end,
      body := jsonb_build_object('id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return new;
exception when others then
  raise warning 'chat_urgente_aviso: %', sqlerrm;
  return new;
end
$$;

drop trigger if exists chat_ordenes_urgente_aviso on public.chat_ordenes_mensajes;
create trigger chat_ordenes_urgente_aviso after insert on public.chat_ordenes_mensajes
  for each row when (new.urgente) execute function public.chat_urgente_aviso();

drop trigger if exists chat_tecnicos_urgente_aviso on public.chat_tecnicos_mensajes;
create trigger chat_tecnicos_urgente_aviso after insert on public.chat_tecnicos_mensajes
  for each row when (new.urgente) execute function public.chat_urgente_aviso();

-- ── Push fuerte (canal "urgente" de la APK) ──────────────────────────────
-- Devuelve las opciones de Android para un mensaje: canal urgente si el
-- mensaje es urgente y push_fuerte no esta apagado; si no, las del chat.
create or replace function public.chat_push_android(p_urgente boolean, p_opc jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_fuerte boolean;
begin
  if coalesce(p_urgente, false) then
    select coalesce(c.push_fuerte, true) into v_fuerte from public.alertas_whatsapp_config c where c.id = 1;
    if coalesce(v_fuerte, true) then
      return jsonb_build_object('channelId', 'urgente', 'icon', 'notif_chat_campana', 'color', '#DC2626');
    end if;
  end if;
  return p_opc->'android';
end
$$;

-- Chat de la orden
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
  v_urg boolean := coalesce(new.urgente, false);
  v_android jsonb;
begin
  v_opc := public.chat_push_opciones();
  -- Los urgentes se avisan aunque los avisos de chat esten apagados.
  if v_opc is null and not v_urg then return new; end if;
  v_pref := coalesce(v_opc->>'prefijo', '');
  v_android := public.chat_push_android(v_urg, v_opc);

  select o.codigo::text, o.tecnico::text into v_codigo, v_tecnico from public.ordenes o where o.id = new.orden_id;
  v_cont := coalesce(nullif(trim(new.texto), ''), case when new.foto_url is not null then '📷 Foto' else '' end);
  v_title := case when v_urg then '🚨 URGENTE · '
                  when v_pref <> '' then v_pref || ' ' else '' end
             || 'Orden' || coalesce(' ' || v_codigo, '');
  v_body := coalesce(new.autor, '') || ': ' || v_cont;
  v_data := jsonb_build_object('tipo', 'chat_orden', 'orden_id', new.orden_id::text, 'urgente', case when v_urg then '1' else '' end);
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

-- Chat con oficina (hilo por tecnico)
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
  v_data := jsonb_build_object('tipo', 'chat_tecnico', 'tecnico_nombre', new.tecnico_nombre, 'urgente', case when v_urg then '1' else '' end);

  if public.chat_rol_norm(new.autor_rol) = 'tecnico' then
    for v_nombre in
      select distinct trim(u.nombre) from public.usuarios u
       where u.activo is true and public.chat_rol_norm(u.rol) in ('gestora', 'administrador')
    loop
      if lower(v_nombre) <> lower(trim(coalesce(new.autor, ''))) then
        perform public.chat_push_enviar(v_nombre, v_title, v_cont, v_data, v_android);
      end if;
    end loop;
  elsif lower(trim(coalesce(new.tecnico_nombre, ''))) <> lower(trim(coalesce(new.autor, ''))) then
    perform public.chat_push_enviar(new.tecnico_nombre, v_title, v_cont, v_data, v_android);
  end if;
  return new;
exception when others then
  raise warning 'chat_tecnicos_push: %', sqlerrm;
  return new;
end
$$;

select 'ok' as resultado;
