-- Auditoria de cancelacion/liberacion de usuarios PPPoE por orden
-- Fecha: 2026-03-20

alter table if exists public.ordenes
  add column if not exists motivo_cancelacion text,
  add column if not exists cancelado_por text,
  add column if not exists fecha_cancelacion timestamptz,
  add column if not exists usuario_nodo_liberado text;

create table if not exists public.ordenes_usuario_liberaciones (
  id bigint generated always as identity primary key,
  orden_id bigint,
  orden_codigo text,
  dni text,
  cliente text,
  nodo text,
  usuario_nodo_liberado text,
  motivo text,
  actor text,
  fecha_evento timestamptz not null default now()
);

create index if not exists idx_ordenes_cancelada_fecha on public.ordenes(fecha_cancelacion desc);
create index if not exists idx_ordenes_cancelada_actor on public.ordenes(cancelado_por);
create index if not exists idx_liberaciones_orden_codigo on public.ordenes_usuario_liberaciones(orden_codigo);
create index if not exists idx_liberaciones_fecha_evento on public.ordenes_usuario_liberaciones(fecha_evento desc);

