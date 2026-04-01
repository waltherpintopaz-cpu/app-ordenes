-- ============================================================
-- FIX: Permisos INSERT/SELECT para tabla logs
-- Sin esto, el rol authenticated no puede insertar directamente
-- ============================================================
GRANT INSERT, SELECT ON public.logs TO authenticated;
GRANT INSERT, SELECT ON public.logs TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.logs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.logs_id_seq TO anon;

-- ============================================================
-- FIX: Eliminar triggers de DELETE para evitar duplicados
-- La app ya llama escribirLog() al eliminar desde web/mobile.
-- El trigger causaba entrada adicional como "directo_supabase"
-- en cada delete desde la app vía REST API.
-- ============================================================
DROP TRIGGER IF EXISTS trg_log_delete_orden ON public.ordenes;
DROP TRIGGER IF EXISTS trg_log_delete_cliente ON public.clientes;
