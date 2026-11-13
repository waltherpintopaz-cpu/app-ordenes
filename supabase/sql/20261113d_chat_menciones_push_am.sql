-- SOLO AMERICANET (en DIM los avisos los manda dim-notificaciones-server).
-- Chat por orden: @menciones -> el mencionado recibe aviso aunque no sea del
-- equipo, con titulo "📣 X te mencionó" y sonido fuerte (como urgente).

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
  v_android_mencion jsonb;
  v_grupo text := '';
  v_menc text[] := coalesce(new.menciones, '{}');
begin
  v_opc := public.chat_push_opciones();
  if v_opc is null and not v_urg and cardinality(v_menc) = 0 then return new; end if;
  v_pref := coalesce(v_opc->>'prefijo', '');
  v_android := public.chat_push_android(v_urg, v_opc);
  v_android_mencion := public.chat_push_android(true, v_opc);

  select o.codigo::text, o.nombre::text, o.tecnico::text into v_codigo, v_cliente, v_tecnico from public.ordenes o where o.id = new.orden_id;
  v_cont := coalesce(nullif(trim(new.texto), ''),
                     case when new.foto_url is not null then '📷 Foto'
                          when new.audio_url is not null then '🎤 Nota de voz'
                          when new.archivo_url is not null then '📎 Archivo' else '' end);
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

  if coalesce(trim(v_tecnico), '') <> '' then
    select lower(trim(coalesce(u.grupo, ''))) into v_grupo from public.usuarios u
     where u.activo is true and lower(trim(u.nombre)) = lower(trim(v_tecnico)) limit 1;
    v_grupo := coalesce(v_grupo, '');
  end if;

  for v_nombre in
    select distinct x from (
      select trim(u.nombre) x from public.usuarios u
       where u.activo is true and public.chat_rol_norm(u.rol) = 'administrador'
      union select trim(v_tecnico) where coalesce(trim(v_tecnico), '') <> ''
      union select trim(u.nombre) from public.usuarios u
       where v_grupo <> '' and u.activo is true and lower(trim(coalesce(u.grupo, ''))) = v_grupo
      union select trim(m) from unnest(v_menc) m where coalesce(trim(m), '') <> ''
    ) s
  loop
    if lower(v_nombre) = lower(trim(coalesce(new.autor, ''))) then continue; end if;
    if exists (select 1 from unnest(v_menc) m where lower(trim(m)) = lower(v_nombre)) then
      perform public.chat_push_enviar(v_nombre,
        '📣 ' || coalesce(nullif(split_part(trim(coalesce(new.autor, '')), ' ', 1), ''), 'Alguien') || ' te mencionó · ' || coalesce(v_codigo, 'Orden'),
        v_body, v_data, v_android_mencion);
    elsif v_opc is not null or v_urg then
      perform public.chat_push_enviar(v_nombre, v_title, v_body, v_data, v_android);
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'chat_ordenes_push: %', sqlerrm;
  return new;
end
$$;
