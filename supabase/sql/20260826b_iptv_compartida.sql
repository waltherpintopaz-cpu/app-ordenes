-- Señal de posible cuenta compartida: cuantas IPs distintas se conectaron
-- en las ultimas 24h (sincronizado desde Xtream, ver server/xtreamProxyServer.mjs).
alter table iptv_clientes
  add column if not exists ips_24h integer default 0;
