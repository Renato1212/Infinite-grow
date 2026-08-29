-- The day container and everything hanging off it.

create table if not exists trading_days (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  date                 date not null,
  status               day_status not null default 'planned',

  -- classification, captured at debrief
  actual_day_type      day_type,
  open_type            open_type,
  volume_regime        regime check (volume_regime is null or volume_regime <> 'extreme'),
  volatility_regime    regime,

  -- scoring
  discipline_score     smallint check (discipline_score between 0 and 10),
  execution_score      smallint check (execution_score between 0 and 10),
  process_adherence_pct numeric(5,2),

  -- denormalised; maintained by trigger, never written by the app
  gross_pnl    numeric(14,2) not null default 0,
  commissions  numeric(14,2) not null default 0,
  net_pnl      numeric(14,2) not null default 0,
  trade_count  integer not null default 0,
  win_count    integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists trading_days_user_date_idx on trading_days (user_id, date desc);

create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade,
  key            session_key not null,
  label          text not null,
  start_time     time not null,
  end_time       time not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (trading_day_id, key)
);
create index if not exists sessions_day_idx on sessions (trading_day_id);

create table if not exists session_preps (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  session_id        uuid not null references sessions(id) on delete cascade unique,
  reassessment      text,
  what_changed      text,
  updated_bias      bias,
  energy_level      smallint check (energy_level between 1 and 5),
  mental_state_tags text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists prep_narratives (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade,
  source         narrative_source not null,
  raw_content    text not null default '',
  key_themes     text[] not null default '{}',
  sentiment      smallint check (sentiment between -2 and 2),
  source_url     text,
  captured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (trading_day_id, source)
);
create index if not exists prep_narratives_day_idx on prep_narratives (trading_day_id);

create table if not exists instrument_prep (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  trading_day_id      uuid not null references trading_days(id) on delete cascade,
  instrument_id       uuid not null references instruments(id) on delete restrict,
  structure_note      text,
  vwap_slope          slope,
  chart_pattern       text[] not null default '{}',
  prior_day_type      day_type,
  prior_session_note  text,
  ladder_behaviour    text,
  expected_range_ticks integer check (expected_range_ticks >= 0),
  directional_bias    bias,
  conviction          smallint check (conviction between 1 and 5),
  sort_order          integer not null default 100,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (trading_day_id, instrument_id)
);
create index if not exists instrument_prep_day_idx on instrument_prep (trading_day_id);
create index if not exists instrument_prep_instrument_idx on instrument_prep (instrument_id);

create table if not exists prep_levels (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  instrument_prep_id uuid not null references instrument_prep(id) on delete cascade,
  level_type_id      uuid not null references level_types(id) on delete restrict,
  price              numeric(18,8) not null,
  secondary_price    numeric(18,8),
  timeframe          text,
  strength           smallint not null default 2 check (strength between 1 and 3),
  note               text,
  source             level_source not null default 'chart',
  sort_order         integer not null default 100,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists prep_levels_prep_idx on prep_levels (instrument_prep_id);
create index if not exists prep_levels_type_idx on prep_levels (level_type_id);

-- One row per level: "what did price actually do here". 1:1 on purpose — see
-- docs/PLAN.md §4.2.
create table if not exists level_interactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  prep_level_id  uuid not null references prep_levels(id) on delete cascade unique,
  first_touch_at timestamptz,
  reaction       level_reaction not null,
  reaction_ticks integer,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists day_environment (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  trading_day_id        uuid not null references trading_days(id) on delete cascade unique,
  dynamic_calendar_note text,
  options_note          text,
  expected_environment  text,
  flow_note             text,
  flag_opex          boolean not null default false,
  flag_month_end     boolean not null default false,
  flag_quarter_end   boolean not null default false,
  flag_roll          boolean not null default false,
  flag_auction       boolean not null default false,
  flag_holiday       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scheduled_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  trading_day_id uuid not null references trading_days(id) on delete cascade,
  scheduled_at   timestamptz not null,
  name           text not null,
  importance     smallint not null default 2 check (importance between 1 and 3),
  consensus      text,
  actual         text,
  prior          text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists scheduled_events_day_idx on scheduled_events (trading_day_id, scheduled_at);

create table if not exists scheduled_event_instruments (
  event_id      uuid not null references scheduled_events(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  primary key (event_id, instrument_id)
);

create table if not exists hypotheses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  trading_day_id       uuid not null references trading_days(id) on delete cascade,
  instrument_id        uuid not null references instruments(id) on delete restrict,
  label                text not null,
  rank                 smallint not null default 1 check (rank >= 1),
  narrative            text,
  trigger_conditions   text,
  invalidation         text,
  assigned_probability smallint check (assigned_probability between 0 and 100),
  expected_move_ticks  integer,
  planned_response     text,
  outcome              hypothesis_outcome,
  outcome_note         text,
  outcome_recorded_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists hypotheses_day_idx on hypotheses (trading_day_id, rank);
create index if not exists hypotheses_instrument_idx on hypotheses (instrument_id);

-- A hypothesis is a route through marked levels.
create table if not exists hypothesis_path_levels (
  hypothesis_id uuid not null references hypotheses(id) on delete cascade,
  prep_level_id uuid not null references prep_levels(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  ordinal       smallint not null default 1,
  primary key (hypothesis_id, prep_level_id)
);

create table if not exists opportunities (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  trading_day_id        uuid not null references trading_days(id) on delete cascade,
  hypothesis_id         uuid references hypotheses(id) on delete set null,
  instrument_id         uuid not null references instruments(id) on delete restrict,
  setup_name            text not null,
  location_note         text,
  entry_trigger         text,
  invalidation          text,
  target                text,
  primary_edge_domain_id uuid references edge_domains(id) on delete set null,
  potential_ticks       integer check (potential_ticks >= 0),
  estimated_probability smallint check (estimated_probability between 0 and 100),
  -- stored, and cannot drift from its inputs
  asymmetry_score numeric(10,2)
    generated always as (
      (coalesce(potential_ticks,0)::numeric * coalesce(estimated_probability,0)::numeric) / 100
    ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunities_day_idx on opportunities (trading_day_id);
create index if not exists opportunities_asym_idx on opportunities (user_id, asymmetry_score desc);

create table if not exists opportunity_supporting_domains (
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  edge_domain_id uuid not null references edge_domains(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  primary key (opportunity_id, edge_domain_id)
);
