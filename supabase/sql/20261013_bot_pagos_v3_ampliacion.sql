-- Ampliación de bot-pagos-comprobante: soporte técnico, prórrogas,
-- avería y modo IA básico (ver plan en luminous-wobbling-badger.md).
-- Todo aditivo, no toca columnas ni filas existentes.

-- Contador de prórrogas "seguidas" pedidas por chat (independiente de
-- las columnas prorroga_* que ya existen y usa revisarProrrateosVencidos
-- para el cobro prorrateado -- no se tocan esas, es una cosa distinta).
alter table clientes add column if not exists prorroga_chat_consecutivas integer not null default 0;
alter table clientes add column if not exists prorroga_chat_ultima_fecha date;

-- bot_pagos_v3_estado se reusa para trackear soporte/avería/prórroga
-- además de comprobante, no solo cambia de fase sino que necesita algo
-- de contexto adicional para poder notificar al grupo cuando corresponda.
alter table bot_pagos_v3_estado add column if not exists tipo text;
alter table bot_pagos_v3_estado add column if not exists motivo text;
alter table bot_pagos_v3_estado add column if not exists account_id text;
alter table bot_pagos_v3_estado add column if not exists cliente_nombre text;
