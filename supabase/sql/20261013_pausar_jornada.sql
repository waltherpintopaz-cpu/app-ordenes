-- Pausar jornada (técnicos). Una fila por pausa (no una sola columna)
-- porque un técnico puede pausar varias veces en el día y hace falta
-- sumar la duración total para calcular horas realmente trabajadas.
create table if not exists tecnico_turno_pausas (
  id          bigint generated always as identity primary key,
  turno_id    bigint not null references tecnico_turnos(id) on delete cascade,
  motivo      text,
  inicio      timestamptz not null default now(),
  fin         timestamptz
);
create index if not exists idx_turno_pausas_turno_abierta
  on tecnico_turno_pausas(turno_id) where fin is null;

-- Bandera rápida espejo en el turno -- evita un JOIN solo para saber
-- "¿está pausado ahora?" en el panel/polling.
alter table tecnico_turnos add column if not exists pausado boolean not null default false;

alter table tecnico_turno_pausas enable row level security;
drop policy if exists tecnico_turno_pausas_all on tecnico_turno_pausas;
create policy tecnico_turno_pausas_all on tecnico_turno_pausas for all using (true) with check (true);
