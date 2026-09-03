-- Reference data. Rows with user_id = null are global seeds visible to
-- everyone; a user may add their own. Nothing here is hard-coded in the app.

create table if not exists instruments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  symbol        text not null,
  name          text not null,
  exchange      text not null,
  product_group product_group not null,
  tick_size     numeric(18,8) not null check (tick_size > 0),
  tick_value    numeric(18,6) not null check (tick_value > 0),
  point_value   numeric(18,6) not null check (point_value > 0),
  currency      char(3) not null default 'USD',
  rth_open      time not null,
  rth_close     time not null,
  is_active     boolean not null default true,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists instruments_symbol_scope on instruments (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), symbol);

create table if not exists edge_domains (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  key         text not null,
  label       text not null,
  description text not null default '',
  sort_order  integer not null default 100,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists edge_domains_key_scope on edge_domains (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table if not exists level_types (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  key        text not null,
  label      text not null,
  grouping   text not null default 'other',
  sort_order integer not null default 100,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists level_types_key_scope on level_types (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null check (length(btrim(label)) > 0),
  category   tag_category not null default 'custom',
  color      text,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One canonical spelling per category. Autocomplete cannot create a near-duplicate.
create unique index if not exists tags_unique_label on tags (user_id, category, lower(btrim(label)));
create index if not exists tags_user_idx on tags (user_id) where not archived;

create table if not exists rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  text       text not null,
  detail     text,
  active     boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rules_user_idx on rules (user_id) where active;
