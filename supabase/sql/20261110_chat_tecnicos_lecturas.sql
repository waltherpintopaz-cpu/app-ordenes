-- "Visto" compartido del chat tecnico <-> oficina: una fila por
-- (tecnico, usuario que lo leyo). Asi lo leido en el celular tambien se da
-- por leido en el navegador y al reves. Igual que chat_ordenes_lecturas.
create table if not exists public.chat_tecnicos_lecturas (
  tecnico_nombre text not null,
  usuario text not null,
  visto_at timestamptz not null default now(),
  primary key (tecnico_nombre, usuario)
);

create or replace function public.chat_tecnicos_lecturas_hora_servidor()
returns trigger language plpgsql as $$
begin
  new.visto_at := now();
  return new;
end $$;

drop trigger if exists chat_tecnicos_lecturas_hora on public.chat_tecnicos_lecturas;
create trigger chat_tecnicos_lecturas_hora
  before insert or update on public.chat_tecnicos_lecturas
  for each row execute function public.chat_tecnicos_lecturas_hora_servidor();

grant select, insert, update on public.chat_tecnicos_lecturas to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.chat_tecnicos_lecturas;
exception when duplicate_object then null; end $$;

select 'ok' as resultado;
