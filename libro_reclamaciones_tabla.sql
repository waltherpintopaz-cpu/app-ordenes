-- Ejecutar en Supabase > SQL Editor

create table if not exists libro_reclamaciones (
  id               bigserial primary key,
  codigo           text not null unique,
  tipo             text not null check (tipo in ('reclamo', 'queja')),
  nombres          text not null,
  dni              text not null,
  telefono         text not null,
  email            text,
  direccion        text,
  bien_contratado  text,
  monto_contratado numeric(10,2),
  descripcion      text not null,
  pedido           text not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'resuelto', 'cerrado')),
  respuesta        text,
  fecha_registro   timestamptz not null default now(),
  fecha_respuesta  timestamptz
);

-- Permitir que cualquier visitante (anon) pueda insertar
alter table libro_reclamaciones enable row level security;

create policy "insert_publico" on libro_reclamaciones
  for insert to anon with check (true);

-- Solo roles autenticados pueden leer y actualizar
create policy "lectura_autenticados" on libro_reclamaciones
  for select to authenticated using (true);

create policy "update_autenticados" on libro_reclamaciones
  for update to authenticated using (true);
