-- =========================================================
-- Permite que una promocion se envie como varios mensajes de
-- WhatsApp en secuencia (ej: uno con la lista de planes, otro
-- con la oferta especial) en vez de un solo bloque de texto.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

alter table promociones add column if not exists mensajes jsonb not null default '[]'::jsonb;

-- Migrar el mensaje unico ya existente (si lo hay) al primer bloque
update promociones
set mensajes = jsonb_build_array(mensaje)
where jsonb_array_length(mensajes) = 0 and mensaje is not null and mensaje <> '';

-- El mensaje unico ya no es obligatorio (ahora se usa "mensajes")
alter table promociones alter column mensaje drop not null;
