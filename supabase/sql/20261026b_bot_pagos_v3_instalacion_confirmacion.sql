alter table bot_pagos_v3_instalacion
  add column if not exists confirmacion_pendiente boolean not null default false;
