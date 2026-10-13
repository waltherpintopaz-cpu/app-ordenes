-- Soporte para el nuevo motor de orquestación "bot-pagos-comprobante"
-- (reemplazo gradual del flujo de pago con comprobante del n8n v2,
-- ver plan en luminous-wobbling-badger.md). NO toca bot_config existente
-- salvo agregar una columna nueva -- todo lo demás (métodos de pago,
-- beneficiarios/titulares, horarios, equipos) ya existe y se reusa tal cual.

-- 1. Timeout de escalamiento a agente, configurable desde BotConfigPanel.jsx
--    (tab "Validación"). Antes era 15 min fijo dentro del JSON de n8n.
alter table bot_config add column if not exists pagos_timeout_escalar_min integer not null default 15;

-- 2. Estado en vuelo de comprobantes siendo validados, reemplaza los nodos
--    `Wait` de n8n (Esperar_15min_Pagos, Esperar_2_Minutos, etc). Una fila
--    por conversación de Chatwoot mientras el comprobante está pendiente;
--    se borra al resolverse (aprobado, rechazado o escalado).
create table if not exists bot_pagos_v3_estado (
  conv_id       text primary key,
  fase          text not null default 'analizando', -- analizando | validado | esperando_agente | escalado
  cliente_id    bigint,
  nodo          text,
  monto         numeric,
  beneficiario  text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  intentos      integer not null default 0
);

alter table bot_pagos_v3_estado enable row level security;
drop policy if exists bot_pagos_v3_estado_all on bot_pagos_v3_estado;
create policy bot_pagos_v3_estado_all on bot_pagos_v3_estado for all using (true) with check (true);
