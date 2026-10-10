-- Permite dejar pre-asignado el puerto/borne de la caja NAP al crear una
-- orden (visto en Crear Orden > Paso 4, grid de bornes). El tecnico sigue
-- confirmando el puerto real en campo (clientes.puerto_nap) al etiquetar la
-- ONU -- esta columna es solo lo que el gestor dejo sugerido de antemano.
alter table ordenes add column if not exists puerto_nap text;
