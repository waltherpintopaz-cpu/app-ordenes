-- Candado real contra precintos duplicados. Hasta ahora solo existia un
-- aviso en la app (app-ordenes y app-ordenes-mobile) que el tecnico podia
-- saltarse con "Usar igual (reviso manualmente)" -- nada en la base de
-- datos lo impedia, y dos tecnicos liquidando casi al mismo tiempo podian
-- guardar el mismo numero de precinto en 2 clientes sin que nada lo
-- bloqueara (confirmado en auditoria 2026-10-07).
--
-- Paso 1: si ya hay duplicados reales guardados de antes, un indice unico
-- fallaria al crearse. Este SELECT es solo para revisar ANTES de aplicar
-- el paso 2 -- si devuelve filas, hay que decidir a mano cual de los
-- clientes en conflicto se queda con el numero (el otro se deja en null
-- para reetiquetar en campo con el numero real que tiene puesto).
select precinto_codigo, array_agg(id) as clientes_en_conflicto, array_agg(nombre) as nombres
from clientes
where precinto_codigo is not null and precinto_codigo <> ''
group by precinto_codigo
having count(*) > 1;

-- Paso 2: correr esto SOLO si el SELECT de arriba no devolvio filas (o
-- despues de resolver a mano los conflictos que haya mostrado).
-- Permite null (varios clientes sin precinto todavia) pero no permite dos
-- clientes con el MISMO precinto no vacio.
create unique index if not exists clientes_precinto_codigo_unique
  on clientes (precinto_codigo)
  where precinto_codigo is not null and precinto_codigo <> '';
