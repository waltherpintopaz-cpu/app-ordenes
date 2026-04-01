-- Cambiar el unique constraint de ordenes de solo (codigo) a (codigo, empresa)
-- Esto permite que DIM y Americanet tengan órdenes con el mismo código sin pisarse.

-- 1. Eliminar el índice único actual que solo cubría codigo
DROP INDEX IF EXISTS public.ordenes_codigo_key;

-- 2. Crear el nuevo índice único compuesto (codigo, empresa)
--    Se ignoran filas donde empresa sea NULL o vacío para mayor robustez.
CREATE UNIQUE INDEX ordenes_codigo_empresa_key
  ON public.ordenes (codigo, empresa)
  WHERE empresa IS NOT NULL AND empresa <> '';
