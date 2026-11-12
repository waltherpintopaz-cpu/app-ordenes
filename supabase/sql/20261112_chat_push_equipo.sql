-- Chat por orden (AMERICANET) -- 2026-11-12
-- El aviso del chat de una orden ahora llega tambien al EQUIPO del tecnico
-- asignado (usuarios con su mismo "grupo", ej. Luis + Cristian), no solo al
-- tecnico. Si escribe un compañero, el otro se entera. Nunca al propio autor.
-- Reemplaza solo chat_ordenes_push (de 20261112_chat_push_conversacion.sql).

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
  v_nombre text;
  v_urg boolean := coalesce(new.urgente, false);
  v_android jsonb;
  v_grupo text := '';
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

  -- Grupo (equipo) del tecnico asignado: sus compañeros tambien ven la orden
  -- en la app, asi que tambien reciben el aviso.
  if coalesce(trim(v_tecnico), '') <> '' then
    select lower(trim(coalesce(u.grupo, ''))) into v_grupo from public.usuarios u
     where u.activo is true and lower(trim(u.nombre)) = lower(trim(v_tecnico)) limit 1;
    v_grupo := coalesce(v_grupo, '');
  end if;

  for v_nombre in
    select distinct trim(u.nombre) from public.usuarios u
     where u.activo is true and public.chat_rol_norm(u.rol) = 'administrador'
    union
    select trim(v_tecnico) where coalesce(trim(v_tecnico), '') <> ''
    union
    select trim(u.nombre) from public.usuarios u
     where v_grupo <> '' and u.activo is true and lower(trim(coalesce(u.grupo, ''))) = v_grupo
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
