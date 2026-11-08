-- Americanet: el chat dejo de enviar mensajes porque se ACTIVO RLS en
-- chat_ordenes_mensajes y chat_tecnicos_mensajes (las migraciones
-- 20261103_* las dejaban con RLS desactivado) sin ninguna politica, asi que
-- la app (clave anon) no puede insertar ni leer:
--   "new row violates row-level security policy for table chat_tecnicos_mensajes"
-- En vez de volver a desactivar RLS, se deja activo con politicas explicitas
-- para anon/authenticated (la app y la web usan la clave anon, igual que el
-- resto de tablas del sistema).

alter table public.chat_ordenes_mensajes enable row level security;
alter table public.chat_tecnicos_mensajes enable row level security;

drop policy if exists chat_ordenes_mensajes_app on public.chat_ordenes_mensajes;
create policy chat_ordenes_mensajes_app on public.chat_ordenes_mensajes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists chat_tecnicos_mensajes_app on public.chat_tecnicos_mensajes;
create policy chat_tecnicos_mensajes_app on public.chat_tecnicos_mensajes
  for all to anon, authenticated using (true) with check (true);
