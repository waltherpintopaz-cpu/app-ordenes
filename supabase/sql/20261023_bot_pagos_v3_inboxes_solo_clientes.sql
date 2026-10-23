-- Nueva columna para la tarjeta "Bandejas solo-clientes" del panel de
-- bot-pagos-comprobante (BotPagosV3ConfigPanel.jsx): lista de inboxes
-- (separados por coma) donde el bot SOLO debe contestarle a quien pueda
-- identificar como cliente real, ignorando por completo a cualquier
-- prospecto/numero no identificado. Ver bloqueadoPorSoloClientes() en
-- server.mjs (repo bot-pagos-comprobante).
alter table bot_pagos_v3_config
  add column if not exists inboxes_solo_clientes text not null default '';
