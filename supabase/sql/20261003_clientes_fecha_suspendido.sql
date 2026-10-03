-- Fecha en que Mikrowisp marco al cliente como suspendido -- viene directo
-- en la respuesta de GetClientsDetails (campo "fecha_suspendido"), se
-- captura gratis en la misma sync diaria de estado_servicio, sin consultas
-- extra a Mikrowisp. Pensado para armar despues una vista de "clientes
-- suspendidos hace N dias" para programar recuperacion de equipos.
alter table clientes add column if not exists fecha_suspendido timestamptz;
