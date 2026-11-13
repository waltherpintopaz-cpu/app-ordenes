-- Hora en que el tecnico toca "Iniciar" (la orden pasa a "En Proceso").
-- Sirve para el "tiempo promedio por trabajo" del dashboard "Mi mes" del
-- tecnico (Iniciar -> Liquidar). Lo pone un trigger, asi funciona con
-- cualquier version de la app y con la cola sin señal. (13-nov)
alter table public.ordenes add column if not exists iniciada_en timestamptz;

create or replace function public.ordenes_marcar_iniciada_en()
returns trigger
language plpgsql
as $$
begin
  if new.estado ilike '%proceso%'
     and (tg_op = 'INSERT' or coalesce(old.estado, '') not ilike '%proceso%')
     and new.iniciada_en is null then
    new.iniciada_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ordenes_marcar_iniciada_en on public.ordenes;
create trigger ordenes_marcar_iniciada_en
before insert or update of estado on public.ordenes
for each row execute function public.ordenes_marcar_iniciada_en();
