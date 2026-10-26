-- Nueva columna para la tarjeta "Números bloqueados (el bot nunca se
-- activa)" del panel de bot-pagos-comprobante (BotPagosV3ConfigPanel.jsx):
-- lista de números (separados por coma) donde el bot NUNCA debe
-- responder, sin importar bandeja, fase o tipo de mensaje. Ver
-- numeroBloqueado() en server.mjs (repo bot-pagos-comprobante).
alter table bot_pagos_v3_config
  add column if not exists numeros_bloqueados text not null default '';
