-- Silenciar un chat (por persona) -- Americanet y DIM, mismo SQL.
-- clave = "orden:<id>". Mientras hasta > now() esa persona no recibe avisos
-- de ese chat (salvo si la @mencionan).
create table if not exists public.chat_silencios (
  usuario text not null,
  clave text not null,
  hasta timestamptz not null,
  primary key (usuario, clave)
);
alter table public.chat_silencios enable row level security;
drop policy if exists chat_silencios_todo on public.chat_silencios;
create policy chat_silencios_todo on public.chat_silencios for all using (true) with check (true);
grant select, insert, update, delete on public.chat_silencios to anon, authenticated;

notify pgrst, 'reload schema';
