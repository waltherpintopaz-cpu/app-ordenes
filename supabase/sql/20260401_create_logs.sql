-- ============================================================
-- TABLA DE LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.logs (
  id            bigserial PRIMARY KEY,
  fecha         timestamptz NOT NULL DEFAULT now(),
  usuario       text,
  rol           text,
  empresa       text,
  accion        text NOT NULL,          -- 'crear_orden', 'editar_orden', 'eliminar_orden', etc.
  categoria     text NOT NULL,          -- 'orden', 'liquidacion', 'cliente', 'sesion'
  criticidad    text NOT NULL DEFAULT 'normal', -- 'normal' | 'critica'
  tabla         text,
  registro_id   text,
  detalle       jsonb,
  dispositivo   text DEFAULT 'web'
);

CREATE INDEX IF NOT EXISTS idx_logs_fecha      ON public.logs (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_logs_usuario    ON public.logs (usuario);
CREATE INDEX IF NOT EXISTS idx_logs_accion     ON public.logs (accion);
CREATE INDEX IF NOT EXISTS idx_logs_categoria  ON public.logs (categoria);
CREATE INDEX IF NOT EXISTS idx_logs_criticidad ON public.logs (criticidad);

-- ============================================================
-- TRIGGER: captura DELETE de ordenes directo desde Supabase/BD
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_log_delete_orden()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.logs (accion, categoria, criticidad, tabla, registro_id, detalle, usuario, dispositivo)
  VALUES (
    'eliminar_orden',
    'orden',
    'critica',
    'ordenes',
    OLD.id::text,
    jsonb_build_object(
      'codigo',   OLD.codigo,
      'empresa',  OLD.empresa,
      'cliente',  OLD.nombre,
      'dni',      OLD.dni,
      'estado',   OLD.estado,
      'tecnico',  OLD.tecnico
    ),
    'trigger_bd',
    'database'
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_delete_orden ON public.ordenes;
CREATE TRIGGER trg_log_delete_orden
  AFTER DELETE ON public.ordenes
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_delete_orden();

-- ============================================================
-- TRIGGER: captura DELETE de clientes directo desde BD
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_log_delete_cliente()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.logs (accion, categoria, criticidad, tabla, registro_id, detalle, usuario, dispositivo)
  VALUES (
    'eliminar_cliente',
    'cliente',
    'critica',
    'clientes',
    OLD.id::text,
    jsonb_build_object(
      'nombre',   OLD.nombre,
      'dni',      OLD.dni,
      'nodo',     OLD.nodo,
      'empresa',  OLD.empresa
    ),
    'trigger_bd',
    'database'
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_delete_cliente ON public.clientes;
CREATE TRIGGER trg_log_delete_cliente
  AFTER DELETE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_delete_cliente();

-- ============================================================
-- pg_cron: limpieza automática cada domingo a las 3am
-- logs normales > 60 días, logs críticos > 365 días
-- (requiere extensión pg_cron activa en Supabase)
-- ============================================================
-- SELECT cron.schedule('limpiar-logs', '0 3 * * 0', $$
--   DELETE FROM public.logs WHERE criticidad = 'normal' AND fecha < NOW() - INTERVAL '60 days';
--   DELETE FROM public.logs WHERE criticidad = 'critica' AND fecha < NOW() - INTERVAL '365 days';
-- $$);
