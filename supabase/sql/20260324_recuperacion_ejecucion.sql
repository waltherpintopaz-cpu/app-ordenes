-- Tabla para registrar la ejecucion/liquidacion de ordenes de RECUPERACION DE EQUIPO
-- Separada del historial normal de liquidaciones

CREATE TABLE IF NOT EXISTS ordenes_recuperacion_ejecucion (
  id BIGSERIAL PRIMARY KEY,
  orden_id BIGINT REFERENCES ordenes(id) ON DELETE SET NULL,
  orden_codigo TEXT,
  tecnico_ejecuta TEXT,
  resultado TEXT CHECK (resultado IN ('Completada', 'Reprogramada', 'No se encontró al cliente', 'No viable')),
  observacion TEXT,
  equipos_recuperados JSONB DEFAULT '[]'::jsonb,
  fotos JSONB DEFAULT '[]'::jsonb,
  dni TEXT,
  nombre_cliente TEXT,
  direccion TEXT,
  nodo TEXT,
  creado_por TEXT,
  fecha_ejecucion TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices utiles
CREATE INDEX IF NOT EXISTS idx_recup_ejecucion_orden_id ON ordenes_recuperacion_ejecucion(orden_id);
CREATE INDEX IF NOT EXISTS idx_recup_ejecucion_dni ON ordenes_recuperacion_ejecucion(dni);
CREATE INDEX IF NOT EXISTS idx_recup_ejecucion_fecha ON ordenes_recuperacion_ejecucion(fecha_ejecucion DESC);

-- RLS
ALTER TABLE ordenes_recuperacion_ejecucion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden leer recuperaciones"
  ON ordenes_recuperacion_ejecucion FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados pueden insertar recuperaciones"
  ON ordenes_recuperacion_ejecucion FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticados pueden actualizar recuperaciones"
  ON ordenes_recuperacion_ejecucion FOR UPDATE
  USING (auth.role() = 'authenticated');
