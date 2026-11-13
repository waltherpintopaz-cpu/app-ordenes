-- Chat: "responder citando" un mensaje (como WhatsApp) -- 2026-11-12
-- La app guarda en responde_a el id del mensaje citado. Si el citado se
-- borra, la cita queda en null (la app muestra "Mensaje eliminado").
-- Correr en Supabase de AMERICANET y de DIM (mismo SQL).
alter table public.chat_ordenes_mensajes add column if not exists responde_a bigint references public.chat_ordenes_mensajes(id) on delete set null;
alter table public.chat_tecnicos_mensajes add column if not exists responde_a bigint references public.chat_tecnicos_mensajes(id) on delete set null;
notify pgrst, 'reload schema';
