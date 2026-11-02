-- Flag por tecnico para saltar el flujo de aprobacion de cierre anticipado.
--
-- Hoy, finalizarJornada() en la app movil (TecnicoSessionContext.js) solo
-- cierra el turno directo si ya son las 17:00 hora Lima o es un cierre
-- automatico; si es antes, deja el turno "activo" con una solicitud de
-- cierre anticipado pendiente de aprobacion de un admin (ver
-- AsistenciasPanel.jsx). Algunos tecnicos (ej. con jornada irregular,
-- guardia, o que ya se les aprueba siempre) no deberian tener que pasar por
-- esa aprobacion -- este flag les permite cerrar en cualquier momento del
-- dia como si fuera despues de las 17:00.
--
-- No se encontro RLS/políticas sobre public.usuarios en este repo de
-- migraciones (la tabla se gestiona directo desde el panel con la service
-- key), asi que este ALTER no requiere politicas adicionales.
alter table public.usuarios add column if not exists cierre_libre boolean not null default false;

comment on column public.usuarios.cierre_libre is
  'Si es true, este tecnico puede finalizar su jornada en cualquier momento del dia sin pasar por aprobacion de cierre anticipado (se cierra directo, igual que despues de la hora programada).';
