-- Chat: reacciones con emoji y editar mensaje -- 2026-11-12
-- Correr en Supabase de AMERICANET y de DIM (mismo SQL).
--
-- reacciones: {"👍": ["Luis", "Cinthia"], "✅": ["Cristian"]}. Una reaccion
--   por persona (como WhatsApp): tocar la misma la quita, tocar otra la cambia.
-- editado_at: cuando el autor edito el texto (la app permite 5 min; aqui se
--   deja margen de 15 por relojes desfasados).
-- Los cambios llegan a todos por Realtime (evento UPDATE). El push de chat
-- solo sale en INSERT, asi que editar/reaccionar no manda notificacion.

alter table public.chat_ordenes_mensajes add column if not exists responde_a bigint references public.chat_ordenes_mensajes(id) on delete set null;
alter table public.chat_tecnicos_mensajes add column if not exists responde_a bigint references public.chat_tecnicos_mensajes(id) on delete set null;
alter table public.chat_ordenes_mensajes add column if not exists reacciones jsonb not null default '{}'::jsonb;
alter table public.chat_tecnicos_mensajes add column if not exists reacciones jsonb not null default '{}'::jsonb;
alter table public.chat_ordenes_mensajes add column if not exists editado_at timestamptz;
alter table public.chat_tecnicos_mensajes add column if not exists editado_at timestamptz;

create or replace function public.chat_reaccionar(p_tabla text, p_id bigint, p_emoji text, p_usuario text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_orig jsonb;
  v_prev text;
  k text;
begin
  if p_tabla not in ('chat_ordenes_mensajes', 'chat_tecnicos_mensajes') then raise exception 'tabla no permitida'; end if;
  if coalesce(trim(p_usuario), '') = '' then raise exception 'usuario vacio'; end if;
  execute format('select coalesce(reacciones, ''{}''::jsonb) from public.%I where id = $1 for update', p_tabla) into v_orig using p_id;
  if v_orig is null then return null; end if;
  v := v_orig;
  for k in select jsonb_object_keys(v_orig) loop
    if (v_orig -> k) ? p_usuario then v_prev := k; end if;
    v := jsonb_set(v, array[k], (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(v_orig -> k) x where x <> p_usuario));
  end loop;
  if coalesce(p_emoji, '') <> '' and v_prev is distinct from p_emoji then
    v := jsonb_set(v, array[p_emoji], coalesce(v -> p_emoji, '[]'::jsonb) || to_jsonb(p_usuario));
  end if;
  v := (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v) where jsonb_array_length(value) > 0);
  execute format('update public.%I set reacciones = $1 where id = $2', p_tabla) using v, p_id;
  return v;
end
$$;

create or replace function public.chat_editar(p_tabla text, p_id bigint, p_texto text, p_autor text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_tabla not in ('chat_ordenes_mensajes', 'chat_tecnicos_mensajes') then raise exception 'tabla no permitida'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'texto vacio'; end if;
  execute format(
    'update public.%I set texto = $1, editado_at = now() where id = $2 and lower(trim(autor)) = lower(trim($3)) and created_at > now() - interval ''15 minutes''',
    p_tabla) using trim(p_texto), p_id, p_autor;
  get diagnostics n = row_count;
  return n > 0;
end
$$;

grant execute on function public.chat_reaccionar(text, bigint, text, text) to anon, authenticated;
grant execute on function public.chat_editar(text, bigint, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
