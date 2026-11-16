-- Bucket público para las imágenes de los platos.
--
-- 1. Crea el bucket `dish-images` (lectura pública, 5 MB, JPG/PNG/WebP).
-- 2. Permite subir, reemplazar y borrar solo a usuarios con rol admin.
-- 3. El bloque se omite si el esquema `storage` no existe (por ejemplo en
--    PostgreSQL local sin Supabase).

do $do$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('dish-images', 'dish-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    execute $sql$drop policy if exists "dish images public read" on storage.objects$sql$;
    execute $sql$create policy "dish images public read" on storage.objects for select to anon, authenticated using (bucket_id = 'dish-images')$sql$;

    execute $sql$drop policy if exists "dish images admin upload" on storage.objects$sql$;
    execute $sql$create policy "dish images admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$sql$;

    execute $sql$drop policy if exists "dish images admin update" on storage.objects$sql$;
    execute $sql$create policy "dish images admin update" on storage.objects for update to authenticated using (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$sql$;

    execute $sql$drop policy if exists "dish images admin delete" on storage.objects$sql$;
    execute $sql$create policy "dish images admin delete" on storage.objects for delete to authenticated using (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$sql$;
  end if;
end
$do$;
