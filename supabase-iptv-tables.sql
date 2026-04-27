-- Servidores Xtream
create table if not exists iptv_servers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  url text not null,
  xtream_user text default '',
  xtream_pass text default '',
  notas text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Paquetes / planes
create table if not exists iptv_packages (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  duracion_dias integer default 30,
  precio numeric(10,2) default 0,
  descripcion text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clientes IPTV
create table if not exists iptv_clients (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  username text not null,
  password text not null,
  server_id uuid references iptv_servers(id) on delete set null,
  package_id uuid references iptv_packages(id) on delete set null,
  fecha_expiracion date,
  activo boolean default true,
  notas text default '',
  cliente_ref text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: solo usuarios autenticados del sistema
alter table iptv_servers enable row level security;
alter table iptv_packages enable row level security;
alter table iptv_clients enable row level security;

create policy "acceso_iptv_servers" on iptv_servers for all using (true);
create policy "acceso_iptv_packages" on iptv_packages for all using (true);
create policy "acceso_iptv_clients" on iptv_clients for all using (true);
