-- =========================================================
-- Mensajes automaticos del sistema (sin cobertura, cobertura ya
-- disponible) editables desde el panel "Promociones" del navegador,
-- en vez de estar fijos en el codigo.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

create table if not exists mensajes_sistema (
  clave text primary key,
  mensaje text not null,
  updated_at timestamptz not null default now()
);

alter table mensajes_sistema disable row level security;

insert into mensajes_sistema (clave, mensaje) values
  ('sin_cobertura', '{saludo} 👋

Gracias por tu interés en nuestro servicio. Revisamos tu ubicación y por el momento no contamos con cobertura en tu zona 😔

La buena noticia es que estamos en pleno proceso de expansión, y guardamos tu ubicación y número para avisarte apenas lleguemos a tu sector. Además, serás de los primeros en recibir promociones especiales de lanzamiento 🎉

¡Gracias por tu paciencia, pronto estaremos más cerca!'),
  ('cobertura_disponible', '{saludo} 🎉

¡Buenas noticias! Ya tenemos cobertura disponible en tu zona 🚀

Como nos dejaste tus datos, quisimos avisarte antes que nadie. Además tenemos una promoción especial de bienvenida para ti.

¿Te gustaría que te contactemos para coordinar la instalación? 📶')
on conflict (clave) do nothing;
