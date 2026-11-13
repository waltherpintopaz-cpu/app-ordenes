-- Regla "una orden a la vez" por EQUIPO (13-nov, version 2, sin "Liberar"):
-- el tecnico (y su grupo) no puede iniciar otra orden si tiene una En Proceso;
-- para soltarla debe liquidarla o Reprogramarla. Con la regla activa el
-- usuario/clave PPPoE se ve recien al Iniciar. Se activa solo a quien no liquida.
alter table public.usuarios add column if not exists regla_una_orden boolean not null default false;
notify pgrst, 'reload schema';
