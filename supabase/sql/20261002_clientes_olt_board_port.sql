-- Tarjeta y puerto del OLT (PON real) donde esta registrada la ONU de cada
-- cliente. A diferencia de puerto_nap (posicion dentro de la caja, dato
-- humano y facil de poner al azar), board+port es un hecho fisico: todos los
-- clientes de una misma caja NAP cuelgan del mismo PON, asi que sirve para
-- detectar asignaciones de caja imposibles (alguien puesto en una caja que
-- no corresponde a su conexion real).
alter table clientes add column if not exists olt_board smallint;
alter table clientes add column if not exists olt_port smallint;
