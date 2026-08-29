-- The private bucket that holds trade recordings and chart captures.
--
-- Supabase Storage only exists on Supabase; on a bare Postgres this file is a
-- no-op and media upload is simply unavailable, which is the honest outcome.

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'storage' and table_name = 'buckets') then
    raise notice 'no storage schema — skipping the media bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('media', 'media', false, 524288000)
  on conflict (id) do update set public = false, file_size_limit = 524288000;

  -- Objects are namespaced by trade id, but ownership is what the policies
  -- check: a signed URL is the only way anything leaves, and only for your own
  -- uploads.
  execute 'drop policy if exists "media read own" on storage.objects';
  execute 'drop policy if exists "media insert own" on storage.objects';
  execute 'drop policy if exists "media update own" on storage.objects';
  execute 'drop policy if exists "media delete own" on storage.objects';

  execute $pol$
    create policy "media read own" on storage.objects
      for select to authenticated
      using (bucket_id = 'media' and owner = auth.uid())
  $pol$;
  execute $pol$
    create policy "media insert own" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'media' and owner = auth.uid())
  $pol$;
  execute $pol$
    create policy "media update own" on storage.objects
      for update to authenticated
      using (bucket_id = 'media' and owner = auth.uid())
      with check (bucket_id = 'media' and owner = auth.uid())
  $pol$;
  execute $pol$
    create policy "media delete own" on storage.objects
      for delete to authenticated
      using (bucket_id = 'media' and owner = auth.uid())
  $pol$;
end $$;
