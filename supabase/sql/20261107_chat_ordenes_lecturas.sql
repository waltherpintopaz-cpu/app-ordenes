-- "Visto" compartido del chat por orden: una fila por (orden, usuario) con
-- la ultima vez que ese usuario abrio el chat. El chat muestra doble check
-- en un mensaje propio cuando otro usuario tiene visto_at >= created_at.
-- visto_at lo pone el servidor (trigger) para no depender del reloj del
-- celular. Sin RLS, igual que chat_ordenes_mensajes.
create table if not exists public.chat_ordenes_lecturas (
  orden_id bigint not null,
  usuario text not null,
  visto_at timestamptz not null default now(),
  primary key (orden_id, usuario)
);

create or replace function public.chat_ordenes_lecturas_hora_servidor()
returns trigger language plpgsql as $$
begin
  new.visto_at := now();
  return new;
end $$;

drop trigger if exists chat_ordenes_lecturas_hora on public.chat_ordenes_lecturas;
create trigger chat_ordenes_lecturas_hora
  before insert or update on public.chat_ordenes_lecturas
  for each row execute function public.chat_ordenes_lecturas_hora_servidor();

alter publication supabase_realtime add table public.chat_ordenes_lecturas;
