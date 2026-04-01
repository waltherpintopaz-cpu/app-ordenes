-- Agregar columna mac a equipos_catalogo
-- Para guardar MAC address separado del SN (serial_mac)
ALTER TABLE public.equipos_catalogo ADD COLUMN IF NOT EXISTS mac text;
