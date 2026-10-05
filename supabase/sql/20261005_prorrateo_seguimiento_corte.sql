-- Seguimiento de facturas "Libre" de prorrateo para poder cortar el
-- servicio automaticamente si no se paga (Mikrowisp no corta ni avisa
-- solo para facturas tipo Libre, solo para las "Servicios" normales).
alter table clientes add column if not exists prorrateo_factura_id text;
alter table clientes add column if not exists prorrateo_vencimiento date;
alter table clientes add column if not exists prorrateo_aviso_enviado boolean default false;

-- Plantilla del recordatorio de pago de prorrateo (1 dia antes del corte).
alter table whatsapp_config add column if not exists template_prorrateo_recordatorio text;
