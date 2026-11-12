-- Regla "una orden a la vez" para tecnicos (2026-11-11).
-- Correr en el SQL Editor de Supabase (igual para Americanet y DIM).
--
--  * usuarios.regla_una_orden: interruptor POR TECNICO (panel > Usuarios).
--    true = no puede Iniciar otra orden sin Liquidar o Liberar la que tiene,
--    no ve el celular del cliente hasta Iniciar, no puede Finalizar jornada
--    con una orden en proceso, y recibe aviso a las 3 h. Empieza apagado.
--  * ordenes.iniciada_en: hora en que la orden paso a "En Proceso". La pone
--    el trigger de abajo venga de donde venga el cambio (app, panel, borrar
--    liquidacion). Las ordenes que YA estaban en proceso antes de esto
--    quedan con iniciada_en = null y NO cuentan para la regla.
--  * Liberar: la orden vuelve a Pendiente con motivo + descripcion
--    (ordenes.liberada_*) y queda registro en orden_liberaciones.

alter table public.usuarios add column if not exists regla_una_orden boolean not null default false;

alter table public.ordenes add column if not exists iniciada_en timestamptz;
alter table public.ordenes add column if not exists aviso_proceso_en timestamptz;
alter table public.ordenes add column if not exists liberada_en timestamptz;
alter table public.ordenes add column if not exists liberada_motivo text;
alter table public.ordenes add column if not exists liberada_descripcion text;
alter table public.ordenes add column if not exists liberada_por text;

create or replace function public.ordenes_marcar_inicio()
returns trigger language plpgsql as $$
begin
  if lower(coalesce(new.estado, '')) = 'en proceso' then
    if tg_op = 'INSERT' or lower(coalesce(old.estado, '')) <> 'en proceso' then
      new.iniciada_en := now();
      new.aviso_proceso_en := null;
    end if;
  elsif tg_op = 'UPDATE' and lower(coalesce(old.estado, '')) = 'en proceso' then
    new.iniciada_en := null;
    new.aviso_proceso_en := null;
  end if;
  return new;
end
$$;

drop trigger if exists ordenes_marcar_inicio on public.ordenes;
create trigger ordenes_marcar_inicio
  before insert or update of estado on public.ordenes
  for each row execute function public.ordenes_marcar_inicio();

create index if not exists ordenes_en_proceso_iniciada_idx
  on public.ordenes (tecnico) where iniciada_en is not null;

create table if not exists public.orden_liberaciones (
  id bigint generated always as identity primary key,
  orden_id bigint,
  codigo text,
  tecnico text,
  motivo text,
  descripcion text,
  created_at timestamptz not null default now()
);
create index if not exists orden_liberaciones_tecnico_idx on public.orden_liberaciones (tecnico, created_at desc);

-- Mismo acceso que el resto de tablas de la app (cliente con anon key).
alter table public.orden_liberaciones disable row level security;
grant select, insert on public.orden_liberaciones to anon, authenticated;

notify pgrst, 'reload schema';
