-- Nueva columna para la tarjeta "Botones de recordatorio (ya los responde
-- n8n)" del panel de bot-pagos-comprobante (BotPagosV3ConfigPanel.jsx):
-- lista de textos EXACTOS de botones de plantillas de WhatsApp/Meta que el
-- flujo n8n v2 (bot viejo) ya responde directo -- bot-pagos-comprobante
-- debe quedarse callado si el cliente escribe uno de estos, para no
-- mandar una respuesta duplicada (ver extraerDatosWebhook() en
-- server.mjs, repo bot-pagos-comprobante). Se precarga con la lista
-- exacta sacada del codigo del n8n viejo (nodos
-- Filtro_Recordatorio/Code_IA_Filtro).
alter table bot_pagos_v3_config
  add column if not exists botones_recordatorio_n8n text not null default
  'Metodos de pago, Metodos de Pago, Monto de deuda, Portal del cliente, Unete a la comunidad, No recibir avisos, No recibir notificaciones, Participar, Ya pagué, Metodo de Pago DIM, Metodo de pago DIM, Monto deuda DIM, Portal DIM, Unete comunidad DIM, Descargar boleta, Descargar boleta DIM';
