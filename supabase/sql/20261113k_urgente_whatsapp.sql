-- Dos tipos de urgente: solo alarma (urgente_whatsapp=false) o alarma + WhatsApp.
-- null = mensajes viejos (antes siempre iba WhatsApp).
alter table public.chat_ordenes_mensajes add column if not exists urgente_whatsapp boolean;
alter table public.chat_tecnicos_mensajes add column if not exists urgente_whatsapp boolean;
notify pgrst, 'reload schema';
