-- Lista blanca de inboxes para bot-pagos-comprobante (motor nuevo, en
-- paralelo al n8n v2). Los webhooks de Chatwoot son por CUENTA completa,
-- no por canal -- sin esto, conectar el webhook haría que el bot nuevo
-- procese mensajes de TODOS los inboxes (incluida producción real).
-- Vacío por defecto = el bot nuevo no procesa nada hasta que se liste
-- explícitamente un inbox de prueba. No afecta a inboxes_excluidos (esa
-- sigue siendo del n8n v2, sin cambios).
alter table bot_config add column if not exists bot_pagos_v3_inboxes_prueba text not null default '';
