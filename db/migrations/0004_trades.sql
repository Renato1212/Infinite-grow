-- Trades. Money columns are derived from executions by trigger and are not
-- accepted from the client (see 0006 and lib/pnl.ts, which share the same maths).

create table if not exists trades (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade,
  session_id     uuid references sessions(id) on delete set null,
  instrument_id  uuid not null references instruments(id) on delete restrict,
  hypothesis_id  uuid references hypotheses(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,

  direction      trade_direction not null,
  entry_at       timestamptz not null,
  exit_at        timestamptz,
  duration_seconds integer generated always as (
    case when exit_at is null then null
         else greatest(0, (extract(epoch from (exit_at - entry_at)))::integer) end
  ) stored,

  avg_entry_price numeric(18,8),
  avg_exit_price  numeric(18,8),
  max_size        numeric(12,4),
  initial_stop    numeric(18,8),
  initial_target  numeric(18,8),

  planned      boolean not null default true,
  entry_style  entry_style,
  exit_reason  exit_reason,

  mae_ticks       integer,
  mfe_ticks       integer,
  ticks_captured  numeric(14,4),
  r_multiple      numeric(10,4),

  gross_pnl   numeric(14,2) not null default 0,
  commissions numeric(14,2) not null default 0,
  net_pnl     numeric(14,2) not null default 0,

  conviction   smallint check (conviction between 1 and 5),
  size_vs_plan size_vs_plan,
  notes        text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trades_day_idx on trades (trading_day_id);
create index if not exists trades_instrument_entry_idx on trades (instrument_id, entry_at);
create index if not exists trades_user_entry_idx on trades (user_id, entry_at desc);
create index if not exists trades_hypothesis_idx on trades (hypothesis_id);
create index if not exists trades_opportunity_idx on trades (opportunity_id);

create table if not exists trade_executions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trade_id    uuid not null references trades(id) on delete cascade,
  side        execution_side not null,
  price       numeric(18,8) not null,
  quantity    numeric(12,4) not null check (quantity > 0),
  executed_at timestamptz not null,
  is_entry    boolean not null,
  commission  numeric(12,4) not null default 0,
  external_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists trade_executions_trade_idx on trade_executions (trade_id, executed_at);
create unique index if not exists trade_executions_external on trade_executions (user_id, external_id) where external_id is not null;

create table if not exists trade_tags (
  trade_id uuid not null references trades(id) on delete cascade,
  tag_id   uuid not null references tags(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  primary key (trade_id, tag_id)
);
create index if not exists trade_tags_tag_idx on trade_tags (tag_id);

-- The five-domain debrief: one row per trade per domain. The most valuable
-- table in the app.
create table if not exists trade_edge_assessments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trade_id       uuid not null references trades(id) on delete cascade,
  edge_domain_id uuid not null references edge_domains(id) on delete cascade,
  alignment      domain_alignment not null default 'not_applicable',
  weight         smallint not null default 0 check (weight between 0 and 3),
  was_primary    boolean not null default false,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (trade_id, edge_domain_id)
);
-- Exactly one primary domain per trade, enforced by the database.
create unique index if not exists trade_edge_one_primary on trade_edge_assessments (trade_id) where was_primary;
create index if not exists trade_edge_domain_idx on trade_edge_assessments (edge_domain_id, alignment);

create table if not exists trade_debriefs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references trades(id) on delete cascade unique,

  context_note text,
  edge_note    text,
  process_note text,

  execution_quality  smallint check (execution_quality between 1 and 5),
  management_quality smallint check (management_quality between 1 and 5),
  entry_quality      smallint check (entry_quality between 1 and 5),
  exit_quality       smallint check (exit_quality between 1 and 5),

  emotional_state_entry text[] not null default '{}',
  emotional_state_exit  text[] not null default '{}',

  what_i_saw              text,
  what_was_actually_there text,
  lesson                  text,
  action                  text,
  repeatable              boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trade_mistake_tags (
  trade_debrief_id uuid not null references trade_debriefs(id) on delete cascade,
  tag_id           uuid not null references tags(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  primary key (trade_debrief_id, tag_id)
);

create table if not exists media (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  owner_type       media_owner_type not null,
  owner_id         uuid not null,
  kind             media_kind not null default 'other',
  storage_path     text not null,
  mime             text,
  size_bytes       bigint,
  duration_seconds numeric(10,2),
  captured_at      timestamptz,
  caption          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists media_owner_idx on media (owner_type, owner_id);

create table if not exists pnl_points (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade,
  recorded_at    timestamptz not null,
  realised_pnl   numeric(14,2) not null default 0,
  open_pnl       numeric(14,2),
  note           text,
  source_trade_id uuid references trades(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists pnl_points_day_idx on pnl_points (trading_day_id, recorded_at);

create table if not exists day_notes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade,
  noted_at       timestamptz not null default now(),
  body           text not null default '',
  kind           day_note_kind not null default 'observation',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists day_notes_day_idx on day_notes (trading_day_id, noted_at);

create table if not exists day_debriefs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade unique,

  hypothesis_vs_reality      text,
  what_the_market_actually_did text,
  what_i_did_well            text,
  what_i_did_poorly          text,
  biggest_missed_opportunity text,
  biggest_avoided_mistake    text,
  lessons                    text,

  focus_rating      smallint check (focus_rating between 1 and 5),
  physical_state    smallint check (physical_state between 1 and 5),
  emotional_control smallint check (emotional_control between 1 and 5),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists day_debrief_actions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  day_debrief_id  uuid not null references day_debriefs(id) on delete cascade,
  action_text     text not null,
  due_date        date,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists day_debrief_actions_open_idx on day_debrief_actions (user_id, due_date) where completed_at is null;

create table if not exists rule_checks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade,
  rule_id        uuid not null references rules(id) on delete cascade,
  status         rule_status not null,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (trading_day_id, rule_id)
);
create index if not exists rule_checks_rule_idx on rule_checks (rule_id, status);

create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  type         review_type not null,
  summary      text,
  themes       text[] not null default '{}',
  focus_next_period text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, type, period_start)
);

create table if not exists saved_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null default 'study',
  query      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, name)
);

create table if not exists user_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  timezone          text not null default 'Europe/Lisbon',
  theme             text not null default 'system',
  min_sample_size   integer not null default 30,
  default_instrument_id uuid references instruments(id) on delete set null,
  explainer_seen    jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists prep_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('instrument_prep','hypothesis')),
  instrument_id uuid references instruments(id) on delete cascade,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, kind, name)
);
