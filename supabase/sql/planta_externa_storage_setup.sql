-- =========================================================
-- STORAGE PARA EVIDENCIAS DE PLANTA EXTERNA
-- Ejecutar una sola vez en Supabase SQL Editor.
-- =========================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'planta-externa-evidencias',
  'planta-externa-evidencias',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/bmp','image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "pe evidencias public read" on storage.objects;
create policy "pe evidencias public read"
on storage.objects
for select
to public
using (bucket_id = 'planta-externa-evidencias');

drop policy if exists "pe evidencias public insert" on storage.objects;
create policy "pe evidencias public insert"
on storage.objects
for insert
to public
with check (bucket_id = 'planta-externa-evidencias');

drop policy if exists "pe evidencias public update" on storage.objects;
create policy "pe evidencias public update"
on storage.objects
for update
to public
using (bucket_id = 'planta-externa-evidencias')
with check (bucket_id = 'planta-externa-evidencias');

drop policy if exists "pe evidencias public delete" on storage.objects;
create policy "pe evidencias public delete"
on storage.objects
for delete
to public
using (bucket_id = 'planta-externa-evidencias');

commit;
