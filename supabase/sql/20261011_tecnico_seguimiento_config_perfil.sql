-- Agrega configurabilidad de perfil/frecuencia/precision/distancia al
-- seguimiento de tecnicos, igual a lo que ya existe para volanteadores
-- (volanteo_config_registro) -- solo que por tecnico individual, no una
-- sola fila compartida. Tambien agrega un registro de quien forzo un turno
-- activo manualmente desde el panel de admin (para auditoria).
alter table public.tecnico_seguimiento_config add column if not exists perfil text default 'general_tecnico';
alter table public.tecnico_seguimiento_config add column if not exists frecuencia_seg integer;
alter table public.tecnico_seguimiento_config add column if not exists precision_m numeric;
alter table public.tecnico_seguimiento_config add column if not exists distancia_minima_m numeric;
alter table public.tecnico_seguimiento_config add column if not exists distancia_maxima_m numeric;
alter table public.tecnico_seguimiento_config add column if not exists filtrado_adicional boolean default false;

comment on column public.tecnico_seguimiento_config.perfil is
  'Nombre del perfil de registro GPS (ver src/config/volanteoPerfiles.js): preciso/general/ahorro/ahorro_max/general_tecnico(default, ajustado a vehiculo)/personalizado.';
comment on column public.tecnico_seguimiento_config.frecuencia_seg is
  'Solo aplica si perfil = personalizado. En otro caso se usan los valores fijos del perfil elegido.';

-- Permite forzar un turno activo desde el panel de admin (web) sin que el
-- tecnico haya tocado "Iniciar jornada" -- valvula de escape si el tecnico
-- tiene un problema tecnico real (celular viejo, permiso que no le funciona,
-- etc.) y no debe quedar bloqueado de ver/trabajar sus ordenes por eso.
alter table public.tecnico_turnos add column if not exists activado_por text;
comment on column public.tecnico_turnos.activado_por is
  'Nombre del admin que forzo este turno activo manualmente desde el panel web. NULL si el tecnico lo inicio el mismo.';
