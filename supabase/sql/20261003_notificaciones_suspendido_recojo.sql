-- Dos plantillas nuevas de WhatsApp (independientes de las de ordenes ya
-- existentes): una para avisar a un cliente suspendido, otra para avisar
-- que se va a recoger el equipo. Van en whatsapp_config (misma tabla y
-- panel que ya usan las plantillas de Instalacion/Incidencia/etc).
alter table whatsapp_config add column if not exists template_suspendido text;
alter table whatsapp_config add column if not exists template_aviso_recojo text;

-- Marca de "ya se envio" por cliente -- para que el boton en Abonados
-- muestre un check en vez de poder mandarlo sin darse cuenta de que ya se
-- envio antes. Se resetean a mano (o no) segun el caso; no hay logica
-- automatica que los limpie.
alter table clientes add column if not exists notif_suspendido_en timestamptz;
alter table clientes add column if not exists notif_recojo_equipo_en timestamptz;
