-- Supabase provides auth.users and auth.uid(). On a plain Postgres (local dev,
-- CI) they do not exist, so create just enough of them for the rest of the
-- migrations — and for RLS — to behave identically.
--
-- Every statement is guarded on absence: on Supabase this file must be a strict
-- no-op. Replacing auth.uid() there would mean redefining a platform function
-- the migration does not own, and it would fail — or worse, succeed.

do $$
declare
  has_auth_uid boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) into has_auth_uid;

  if has_auth_uid then
    raise notice 'auth.uid() already exists — leaving the platform''s auth schema alone';
    return;
  end if;

  execute 'create schema if not exists auth';

  execute $ddl$
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      created_at timestamptz not null default now()
    )
  $ddl$;

  execute $ddl$
    create function auth.uid() returns uuid
    language sql stable as $fn$
      select nullif(
        coalesce(
          current_setting('request.jwt.claim.sub', true),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        ), ''
      )::uuid
    $fn$
  $ddl$;
end $$;

-- Roles Supabase defines by default; needed so `set local role authenticated`
-- works against a plain Postgres too. Already present on Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

grant usage on schema public to anon, authenticated;

-- Granting on the platform's auth schema is neither needed nor permitted on
-- Supabase; on a bare Postgres it is what lets the app read its own user row.
do $$
begin
  execute 'grant usage on schema auth to anon, authenticated';
  execute 'grant select on auth.users to authenticated';
exception when insufficient_privilege or undefined_table then
  raise notice 'auth schema is managed by the platform — skipping grants';
end $$;
