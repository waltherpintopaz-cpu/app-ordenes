-- Marca informativa de "Atendida" (trabajo ya realizado por el tecnico,
-- pendiente de liquidar) -- no reemplaza el flujo de liquidacion, que sigue
-- siendo obligatorio. Sirve para mostrar visualmente en la app movil y en
-- el panel web que el tecnico ya considera terminado el trabajo, y para
-- excluir la orden del calculo de ruta/hora de llegada estimada.
alter table ordenes
  add column if not exists atendida_sin_liquidar_en timestamptz;
