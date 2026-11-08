-- Configuracion de notificaciones de chat (Americanet), editable desde la web
-- (Configuracion > Notificaciones). Una sola fila (id = 1).
-- Los valores de icono/sonido deben existir dentro de la APK:
--   chat_icono:  globo | campana | sobre      (res/drawable/notif_chat_*.xml)
--   chat_sonido: predeterminado | burbuja | doble | campana  (canales chat_*)
create table if not exists public.notificaciones_config (
  id int primary key default 1 check (id = 1),
  chat_activo boolean not null default true,
  chat_color text not null default '#F47A20',
  normal_color text not null default '#1E4F9C',
  chat_icono text not null default 'globo' check (chat_icono in ('globo', 'campana', 'sobre')),
  chat_sonido text not null default 'burbuja' check (chat_sonido in ('predeterminado', 'burbuja', 'doble', 'campana')),
  chat_prefijo text not null default '💬',
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.notificaciones_config (id) values (1) on conflict (id) do nothing;

alter table public.notificaciones_config enable row level security;
drop policy if exists notificaciones_config_app on public.notificaciones_config;
create policy notificaciones_config_app on public.notificaciones_config
  for all to anon, authenticated using (true) with check (true);
