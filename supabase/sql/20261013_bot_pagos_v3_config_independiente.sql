-- Pantalla de configuración INDEPENDIENTE para bot-pagos-comprobante.
-- Decisión del usuario: no seguir compartiendo bot_config (que es la
-- configuración real del n8n v2 en producción) -- aunque técnicamente
-- nada se cruzaba, se sentía mezclado. Esta tabla es propia del bot
-- nuevo, nadie más la lee ni la escribe.
--
-- Se precarga (INSERT ... SELECT) con los valores actuales de bot_config
-- como punto de partida razonable -- a partir de ahí, cada una se edita
-- por separado, sin seguir sincronizadas.
create table if not exists bot_pagos_v3_config (
  id                          integer primary key default 1,
  bot_activo                  boolean not null default true,
  modo_bot                    text not null default 'ia', -- 'ia' | 'lista' (lista aun no implementada en este bot)
  inboxes_prueba              text not null default '',   -- lista blanca, vacio = no procesa nada

  horario_inicio              integer not null default 8,
  horario_fin                 integer not null default 21,
  horario_dias                text not null default '1,2,3,4,5,6',
  feriados                    jsonb not null default '[]',

  mensaje_espera_asesor       text not null default '',
  mensaje_fuera_horario       text not null default '',

  beneficiarios               jsonb not null default '[]',
  comprobante_dias_max        integer not null default 7,
  bancos_excepcion_anio       text not null default '',

  amer_metodos_1               text not null default '',
  amer_metodos_2               text not null default '',
  nod06_yape_numero            text not null default '',
  nod06_yape_titular           text not null default '',
  nod06_bcp_cuenta              text not null default '',
  nod06_bcp_titular             text not null default '',

  notif_grupo_principal        text not null default '',
  equipo_soporte_id             integer,
  equipo_pagos_id               integer,

  prorroga_max_consecutivos    integer not null default 2,
  prorroga_max_dias_activo     integer not null default 10,
  prorroga_max_dias_suspendido integer not null default 3,

  pagos_timeout_escalar_min    integer not null default 15,

  averia_activa                boolean not null default false,
  averia_contexto              text not null default '',
  averia_tiempo_estimado       text not null default '',

  actualizado_en               timestamptz not null default now()
);

alter table bot_pagos_v3_config enable row level security;
drop policy if exists bot_pagos_v3_config_all on bot_pagos_v3_config;
create policy bot_pagos_v3_config_all on bot_pagos_v3_config for all using (true) with check (true);

-- Precarga única, solo si la fila id=1 todavía no existe.
insert into bot_pagos_v3_config (
  id, bot_activo, modo_bot, inboxes_prueba,
  horario_inicio, horario_fin, horario_dias, feriados,
  mensaje_espera_asesor, mensaje_fuera_horario,
  beneficiarios, comprobante_dias_max, bancos_excepcion_anio,
  amer_metodos_1, amer_metodos_2, nod06_yape_numero, nod06_yape_titular, nod06_bcp_cuenta, nod06_bcp_titular,
  notif_grupo_principal, equipo_soporte_id, equipo_pagos_id,
  prorroga_max_consecutivos, prorroga_max_dias_activo, prorroga_max_dias_suspendido,
  pagos_timeout_escalar_min, averia_activa, averia_contexto, averia_tiempo_estimado
)
select
  1, coalesce(bc.bot_activo, true), coalesce(bc.modo_bot, 'ia'), coalesce(bc.bot_pagos_v3_inboxes_prueba, ''),
  coalesce(bc.horario_inicio, 8), coalesce(bc.horario_fin, 21), coalesce(bc.horario_dias, '1,2,3,4,5,6'), coalesce(bc.feriados, '[]'::jsonb),
  coalesce(bc.mensaje_espera_asesor, ''), coalesce(bc.mensaje_fuera_horario, ''),
  coalesce(bc.beneficiarios, '[]'::jsonb), coalesce(bc.comprobante_dias_max, 7), coalesce(bc.bancos_excepcion_anio, ''),
  coalesce(bc.amer_metodos_1, ''), coalesce(bc.amer_metodos_2, ''), coalesce(bc.nod06_yape_numero, ''), coalesce(bc.nod06_yape_titular, ''), coalesce(bc.nod06_bcp_cuenta, ''), coalesce(bc.nod06_bcp_titular, ''),
  coalesce(bc.notif_grupo_principal, ''), bc.equipo_soporte_id, bc.equipo_pagos_id,
  2, coalesce(bc.prorroga_max_dias_activo, 10), coalesce(bc.prorroga_max_dias_suspendido, 3),
  coalesce(bc.pagos_timeout_escalar_min, 15), false, '', ''
from bot_config bc
where bc.id = 1
on conflict (id) do nothing;
