-- Everything the brief says must never be typed by hand.
-- The same maths lives in lib/pnl.ts, which is unit-tested; tests/pnl-parity
-- checks the two agree.

create or replace function public.recompute_trade(p_trade_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  t            trades%rowtype;
  inst         instruments%rowtype;
  entry_qty    numeric := 0;
  exit_qty     numeric := 0;
  entry_notional numeric := 0;
  exit_notional  numeric := 0;
  v_avg_entry  numeric;
  v_avg_exit   numeric;
  v_max_size   numeric := 0;
  v_matched    numeric := 0;
  v_ticks      numeric;
  v_gross      numeric := 0;
  v_comm       numeric := 0;
  v_net        numeric := 0;
  v_r          numeric;
  v_risk_ticks numeric;
  v_first_at   timestamptz;
  v_last_at    timestamptz;
  v_run        numeric := 0;
  rec          record;
begin
  select * into t from trades where id = p_trade_id;
  if not found then return; end if;
  select * into inst from instruments where id = t.instrument_id;
  if not found then return; end if;

  select
    coalesce(sum(quantity) filter (where is_entry), 0),
    coalesce(sum(price * quantity) filter (where is_entry), 0),
    coalesce(sum(quantity) filter (where not is_entry), 0),
    coalesce(sum(price * quantity) filter (where not is_entry), 0),
    coalesce(sum(commission), 0),
    min(executed_at) filter (where is_entry),
    max(executed_at) filter (where not is_entry)
  into entry_qty, entry_notional, exit_qty, exit_notional, v_comm, v_first_at, v_last_at
  from trade_executions where trade_id = p_trade_id;

  -- No fills recorded: leave whatever the quick-entry form supplied, but still
  -- derive P&L from avg prices so a 10-second trade entry is complete.
  if entry_qty = 0 then
    v_avg_entry := t.avg_entry_price;
    v_avg_exit  := t.avg_exit_price;
    v_max_size  := coalesce(t.max_size, 0);
    v_matched   := coalesce(t.max_size, 0);
    v_comm      := t.commissions;
  else
    v_avg_entry := entry_notional / entry_qty;
    v_avg_exit  := case when exit_qty > 0 then exit_notional / exit_qty else null end;
    v_matched   := least(entry_qty, exit_qty);

    -- max_size = peak absolute open position across the fill sequence
    for rec in
      select quantity, is_entry from trade_executions
      where trade_id = p_trade_id order by executed_at, id
    loop
      v_run := v_run + case when rec.is_entry then rec.quantity else -rec.quantity end;
      if abs(v_run) > v_max_size then v_max_size := abs(v_run); end if;
    end loop;
  end if;

  if v_avg_entry is not null and v_avg_exit is not null then
    v_ticks := ((v_avg_exit - v_avg_entry) / inst.tick_size)
               * (case when t.direction = 'long' then 1 else -1 end);
    v_gross := v_ticks * inst.tick_value * coalesce(nullif(v_matched, 0), 1);
    v_net   := v_gross - coalesce(v_comm, 0);

    if t.initial_stop is not null then
      v_risk_ticks := abs(v_avg_entry - t.initial_stop) / inst.tick_size;
      if v_risk_ticks > 0 then v_r := v_ticks / v_risk_ticks; end if;
    end if;
  end if;

  update trades set
    avg_entry_price = v_avg_entry,
    avg_exit_price  = v_avg_exit,
    max_size        = nullif(v_max_size, 0),
    entry_at        = coalesce(v_first_at, entry_at),
    exit_at         = coalesce(v_last_at, exit_at),
    ticks_captured  = round(v_ticks, 4),
    gross_pnl       = round(coalesce(v_gross, 0), 2),
    commissions     = round(coalesce(v_comm, 0), 2),
    net_pnl         = round(coalesce(v_net, 0), 2),
    r_multiple      = round(v_r, 4),
    updated_at      = now()
  where id = p_trade_id;
end $$;

create or replace function public.trade_executions_after() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.recompute_trade(coalesce(new.trade_id, old.trade_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trade_executions_recompute on trade_executions;
create trigger trade_executions_recompute
  after insert or update or delete on trade_executions
  for each row execute function public.trade_executions_after();

-- Day aggregates. Denormalised on trading_days, maintained here only.
create or replace function public.recompute_trading_day(p_day_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  update trading_days d set
    gross_pnl   = coalesce(s.gross, 0),
    commissions = coalesce(s.comm, 0),
    net_pnl     = coalesce(s.net, 0),
    trade_count = coalesce(s.cnt, 0),
    win_count   = coalesce(s.wins, 0),
    updated_at  = now()
  from (
    select sum(gross_pnl) gross, sum(commissions) comm, sum(net_pnl) net,
           count(*) cnt, count(*) filter (where net_pnl > 0) wins
    from trades where trading_day_id = p_day_id
  ) s
  where d.id = p_day_id;
end $$;

create or replace function public.trades_after() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.trading_day_id is distinct from new.trading_day_id then
    perform public.recompute_trading_day(old.trading_day_id);
  end if;
  perform public.recompute_trading_day(coalesce(new.trading_day_id, old.trading_day_id));

  -- Intraday equity curve: one auto point per closed trade, plus any manual ones.
  if tg_op <> 'DELETE' and new.exit_at is not null then
    insert into pnl_points (user_id, trading_day_id, recorded_at, realised_pnl, source_trade_id)
    values (new.user_id, new.trading_day_id, new.exit_at,
            (select coalesce(sum(net_pnl), 0) from trades
              where trading_day_id = new.trading_day_id
                and exit_at is not null and exit_at <= new.exit_at),
            new.id)
    on conflict (source_trade_id) where source_trade_id is not null
    do update set recorded_at = excluded.recorded_at,
                  realised_pnl = excluded.realised_pnl,
                  updated_at = now();
  end if;
  return coalesce(new, old);
end $$;

create unique index if not exists pnl_points_source_trade on pnl_points (source_trade_id) where source_trade_id is not null;

drop trigger if exists trades_recompute on trades;
create trigger trades_recompute
  after insert or update or delete on trades
  for each row execute function public.trades_after();

-- Process adherence becomes a number.
create or replace function public.recompute_process_adherence(p_day_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  update trading_days d set
    process_adherence_pct = s.pct,
    updated_at = now()
  from (
    select case when count(*) filter (where status in ('followed','broken')) = 0 then null
                else round(100.0 * count(*) filter (where status = 'followed')
                     / count(*) filter (where status in ('followed','broken')), 2)
           end as pct
    from rule_checks where trading_day_id = p_day_id
  ) s
  where d.id = p_day_id;
end $$;

create or replace function public.rule_checks_after() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.recompute_process_adherence(coalesce(new.trading_day_id, old.trading_day_id));
  return coalesce(new, old);
end $$;

drop trigger if exists rule_checks_recompute on rule_checks;
create trigger rule_checks_recompute
  after insert or update or delete on rule_checks
  for each row execute function public.rule_checks_after();
