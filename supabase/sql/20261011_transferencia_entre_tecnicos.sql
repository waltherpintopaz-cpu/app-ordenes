-- Transferencia directa de equipos/materiales entre tecnicos (sin pasar por
-- almacen), con confirmacion del receptor. Reusa la tabla de solicitudes de
-- devolucion/merma/recuperacion que ya existe (inventario_devolucion_solicitudes)
-- con tipo_solicitud = 'TRANSFERENCIA' -- solo hace falta la columna nueva
-- para saber a quien va dirigida.
alter table inventario_devolucion_solicitudes add column if not exists tecnico_destino text;

comment on column inventario_devolucion_solicitudes.tecnico_destino is
  'Solo para tipo_solicitud=TRANSFERENCIA: tecnico que va a RECIBIR el equipo/material. '
  'tecnico (columna existente) sigue siendo quien lo tiene y lo esta transfiriendo.';
