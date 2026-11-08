-- Americanet: push de los mensajes del chat desde la BASE DE DATOS (como DIM),
-- sin depender de la version de la app/web de quien escribe.
-- Al insertarse un mensaje, un trigger llama (pg_net) a la Edge Function
-- "send-push-notification" -- la misma que usan los demas avisos de
-- Americanet (busca los tokens en push_tokens por nombre de usuario).
--
-- Destinatarios (iguales a DIM, dim-notificaciones-server):
--   Chat de la orden:   escribe tecnico -> administradores
--                       escribe oficina -> tecnico de la orden + administradores
--   Chat con oficina:   escribe tecnico -> gestoras + administradores
--                       escribe oficina -> solo el tecnico del hilo
--   Nunca se avisa al propio autor.
-- Si algo falla, el mensaje se guarda igual (el trigger nunca lo bloquea).

create extension if not exists pg_net with schema extensions;

-- Rol normalizado (sin tildes/mayusculas; "gestor" = "gestora").
create or replace function public.chat_rol_norm(r text)
returns text language sql immutable as $$
  select case lower(trim(translate(coalesce(r, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')))
    when 'gestor' then 'gestora'
    when 'admin' then 'administrador'
    else lower(trim(translate(coalesce(r, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')))
  end
$$;

-- Envia un push a un usuario (por nombre) via la Edge Function. La clave es
-- la publica (publishable/anon), la misma que ya va en la app y la web.
create or replace function public.chat_push_enviar(p_nombre text, p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  k text := 'sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_';
begin
  if coalesce(trim(p_nombre), '') = '' then return; end if;
  perform net.http_post(
    url := 'https://vgwbqbzpjlbkmxtfghdm.supabase.co/functions/v1/send-push-notification',
    body := jsonb_build_object('tecnico_nombre', trim(p_nombre), 'title', p_title, 'body', p_body, 'data', p_data),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k, 'Authorization', 'Bearer ' || k)
  );
end
$$;

-- ── Chat de la orden ─────────────────────────────────────────────────────
create or replace function public.chat_ordenes_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_codigo text;
  v_tecnico text;
  v_cont text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_es_tec boolean;
  v_nombre text;
begin
  select o.codigo::text, o.tecnico::text into v_codigo, v_tecnico from public.ordenes o where o.id = new.orden_id;
  v_cont := coalesce(nullif(trim(new.texto), ''), case when new.foto_url is not null then '📷 Foto' else '' end);
  v_title := case when coalesce(new.urgente, false) then '🚨 URGENTE · ' else '' end
             || 'Mensaje en orden' || coalesce(' ' || v_codigo, '');
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
      perform public.chat_push_enviar(v_nombre, v_title, v_body, v_data);
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'chat_ordenes_push: %', sqlerrm;
  return new;
end
$$;

drop trigger if exists chat_ordenes_push on public.chat_ordenes_mensajes;
create trigger chat_ordenes_push after insert on public.chat_ordenes_mensajes
  for each row execute function public.chat_ordenes_push();

-- ── Chat con oficina (hilo por tecnico) ──────────────────────────────────
create or replace function public.chat_tecnicos_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cont text;
  v_title text;
  v_data jsonb;
  v_nombre text;
begin
  v_cont := coalesce(nullif(trim(new.texto), ''), case when new.foto_url is not null then '📷 Foto' else '' end);
  v_title := 'Mensaje de ' || coalesce(new.autor, '');
  v_data := jsonb_build_object('tipo', 'chat_tecnico', 'tecnico_nombre', new.tecnico_nombre);

  if public.chat_rol_norm(new.autor_rol) = 'tecnico' then
    for v_nombre in
      select distinct trim(u.nombre) from public.usuarios u
       where u.activo is true and public.chat_rol_norm(u.rol) in ('gestora', 'administrador')
    loop
      if lower(v_nombre) <> lower(trim(coalesce(new.autor, ''))) then
        perform public.chat_push_enviar(v_nombre, v_title, v_cont, v_data);
      end if;
    end loop;
  elsif lower(trim(coalesce(new.tecnico_nombre, ''))) <> lower(trim(coalesce(new.autor, ''))) then
    perform public.chat_push_enviar(new.tecnico_nombre, v_title, v_cont, v_data);
  end if;
  return new;
exception when others then
  raise warning 'chat_tecnicos_push: %', sqlerrm;
  return new;
end
$$;

drop trigger if exists chat_tecnicos_push on public.chat_tecnicos_mensajes;
create trigger chat_tecnicos_push after insert on public.chat_tecnicos_mensajes
  for each row execute function public.chat_tecnicos_push();
