-- Correr esto en el Supabase del AMNET CRM (cdwdmuwfahihqbnkxlxl.supabase.co),
-- NO en el Supabase de Americanet ni en el de DIM -- tenant_config vive ahi.
--
-- backend_token: secreto unico por tenant, generado al dar de alta cada ISP
-- nuevo. Permite que un backend compartido (diagnosticoServicioServer.mjs,
-- en su modo multi-tenant aditivo) valide que un request que dice "soy el
-- tenant X" realmente tiene el secreto de X, sin exponer ni mezclar
-- credenciales entre tenants. Las columnas chatwoot_url/chatwoot_token ya
-- existen (las usa el frontend via getChatwootConfig()); esta es la unica
-- columna nueva.
alter table tenant_config add column if not exists backend_token text;

-- Ejemplo para generar un token al dar de alta un tenant nuevo (ejecutar
-- aparte, reemplazando 'slug-del-tenant' por el tenant_id real):
-- update tenant_config set backend_token = encode(gen_random_bytes(24), 'hex')
--   where tenant_id = 'slug-del-tenant';
