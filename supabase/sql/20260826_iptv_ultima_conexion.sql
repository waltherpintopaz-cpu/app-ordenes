-- Persiste la ultima conexion (y si esta en linea ahora) de cada cuenta IPTV,
-- sincronizada periodicamente desde el panel Xtream (server/xtreamProxyServer.mjs).
alter table iptv_clientes
  add column if not exists ultima_conexion timestamptz,
  add column if not exists en_linea boolean default false;
