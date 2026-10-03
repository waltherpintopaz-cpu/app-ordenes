-- "codigo_etiqueta" fue el primer intento de llevar el numero de precinto
-- de la caja NAP -- un picker que ofrecia reusar un codigo ya usado por
-- otro cliente, pensado para cuando el tecnico inventaba el codigo a mano.
-- Ahora que se compran precintos numerados de fabrica (cada numero debe
-- ser unico, nunca reusado), el campo correcto es precinto_codigo, que ya
-- usa Etiquetado de cajas y Liquidacion. Este UPDATE rescata los valores
-- que ya se habian cargado por el picker viejo y que todavia no tienen su
-- equivalente en precinto_codigo, para no perder ese trabajo ya hecho.
update clientes
set precinto_codigo = codigo_etiqueta
where precinto_codigo is null
  and codigo_etiqueta is not null
  and codigo_etiqueta <> '';
