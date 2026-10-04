-- 004_storage.sql — storage buckets + per-business path policies
-- Run after 001_core.sql (needs auth_business_id()). Safe to re-run.
-- Object paths must start with the owner's business id:  {business_id}/{file}
--
-- If the SQL editor reports "must be owner of table objects", create the
-- policies in Dashboard > Storage > Policies instead, using the same expressions.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', true, 2097152,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('voice-notes', 'voice-notes', false, 10485760,
    array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'video/webm']),
  ('job-photos', 'job-photos', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- logos: anyone can read (public bucket); only the owner can write their own folder.
-- voice-notes / job-photos: owner-only for everything. Public pages use
-- short-lived signed URLs created server-side with the service role.

do $$
declare
  b text;
begin
  foreach b in array array['logos', 'voice-notes', 'job-photos'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_select_own');
    execute format('drop policy if exists %I on storage.objects', b || '_insert_own');
    execute format('drop policy if exists %I on storage.objects', b || '_update_own');
    execute format('drop policy if exists %I on storage.objects', b || '_delete_own');

    execute format(
      'create policy %I on storage.objects for select to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = (select public.auth_business_id())::text)',
      b || '_select_own', b);

    execute format(
      'create policy %I on storage.objects for insert to authenticated
         with check (bucket_id = %L and (storage.foldername(name))[1] = (select public.auth_business_id())::text)',
      b || '_insert_own', b);

    execute format(
      'create policy %I on storage.objects for update to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = (select public.auth_business_id())::text)
         with check (bucket_id = %L and (storage.foldername(name))[1] = (select public.auth_business_id())::text)',
      b || '_update_own', b, b);

    execute format(
      'create policy %I on storage.objects for delete to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = (select public.auth_business_id())::text)',
      b || '_delete_own', b);
  end loop;
end
$$;
