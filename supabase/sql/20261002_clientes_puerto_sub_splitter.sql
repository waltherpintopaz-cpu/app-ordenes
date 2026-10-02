-- Splitter 1x2 en un borne de caja NAP: caso especial donde 2 clientes
-- comparten el mismo puerto fisico. puerto_sub distingue cual es cual
-- dentro de ese puerto compartido -- null (el 99% de los casos) significa
-- "puerto normal, un solo cliente", exactamente el comportamiento de
-- siempre. 1 o 2 solo aparece cuando puerto_nap esta repetido entre 2
-- clientes de la misma caja.
--
-- El conteo de ocupacion (nap_cajas.puertos_ocupados) NO necesita cambiar:
-- ya cuenta clientes (no puertos distintos), asi que una caja de 8 con un
-- splitter ya muestra "9/8" solo con que el segundo cliente del splitter
-- quede con el mismo caja_nap -- confirma que el codigo existente ya es
-- consistente con esto, sin tocar nada mas.

alter table clientes
  add column if not exists puerto_sub smallint check (puerto_sub is null or puerto_sub in (1, 2));
