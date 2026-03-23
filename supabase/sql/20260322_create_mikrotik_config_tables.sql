create table if not exists public.mikrotik_routers (
  router_key text primary key,
  nombre text not null,
  host text not null,
  port integer not null default 8730,
  api_user text not null,
  api_password text not null,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mikrotik_routers_activo
  on public.mikrotik_routers (activo);

create table if not exists public.mikrotik_nodo_router (
  nodo text primary key,
  router_key text references public.mikrotik_routers(router_key) on update cascade on delete set null,
  activo boolean not null default true,
  observacion text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_mikrotik_nodo_router_router_key
  on public.mikrotik_nodo_router (router_key);

grant select, insert, update, delete on public.mikrotik_routers to anon, authenticated, service_role;
grant select, insert, update, delete on public.mikrotik_nodo_router to anon, authenticated, service_role;
