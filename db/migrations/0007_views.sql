-- One flat fact row per trade. Every Study card, the filter engine, the pivot
-- builder and the export read this and only this, so a new analysis is a new
-- query against a stable shape rather than a new set of joins.

create or replace view trade_facts as
select
  t.id                    as trade_id,
  t.user_id,
  d.id                    as trading_day_id,
  d.date                  as day,
  extract(isodow from d.date)::int as day_of_week,
  d.status                as day_status,
  d.actual_day_type,
  d.open_type,
  d.volume_regime,
  d.volatility_regime,
  d.focus_rating_proxy,
  d.process_adherence_pct,

  i.id       as instrument_id,
  i.symbol   as instrument_symbol,
  i.product_group,
  i.tick_size,
  i.tick_value,

  s.key      as session_key,

  t.direction,
  t.planned,
  t.entry_style,
  t.exit_reason,
  t.entry_at,
  t.exit_at,
  t.duration_seconds,
  t.avg_entry_price,
  t.avg_exit_price,
  t.max_size,
  t.mae_ticks,
  t.mfe_ticks,
  t.ticks_captured,
  t.r_multiple,
  t.gross_pnl,
  t.commissions,
  t.net_pnl,
  t.conviction,
  t.size_vs_plan,

  -- local-time buckets (Europe/Lisbon), so time-of-day analysis is honest
  (timezone('Europe/Lisbon', t.entry_at))::time                       as entry_local_time,
  to_char(timezone('Europe/Lisbon', t.entry_at), 'HH24:MI')           as entry_local_hhmm,
  (extract(hour from timezone('Europe/Lisbon', t.entry_at))::int * 4
    + floor(extract(minute from timezone('Europe/Lisbon', t.entry_at)) / 15)::int) as entry_bucket_15m,

  case
    when t.duration_seconds is null then null
    when t.duration_seconds < 60    then '<1m'
    when t.duration_seconds < 300   then '1-5m'
    when t.duration_seconds < 900   then '5-15m'
    when t.duration_seconds < 3600  then '15-60m'
    else '>60m'
  end as duration_bucket,

  case
    when t.r_multiple is null then null
    when t.r_multiple <= -2  then '<=-2R'
    when t.r_multiple <  -1  then '-2R..-1R'
    when t.r_multiple <   0  then '-1R..0'
    when t.r_multiple <   1  then '0..1R'
    when t.r_multiple <   2  then '1R..2R'
    when t.r_multiple <   3  then '2R..3R'
    else '>=3R'
  end as r_bucket,

  h.id      as hypothesis_id,
  h.label   as hypothesis_label,
  h.rank    as hypothesis_rank,
  h.outcome as hypothesis_outcome,

  o.id             as opportunity_id,
  o.setup_name,
  o.asymmetry_score,

  pd.id    as primary_domain_id,
  pd.key   as primary_domain_key,
  pd.label as primary_domain_label,
  pa.alignment as primary_domain_alignment,
  pa.weight    as primary_domain_weight,

  -- "did I trade against a conflicting domain at all?" — the §0 research question
  exists (
    select 1 from trade_edge_assessments x
    where x.trade_id = t.id and x.alignment = 'conflicting'
  ) as any_conflicting_domain,
  (select count(*) from trade_edge_assessments x
    where x.trade_id = t.id and x.alignment = 'supportive') as supportive_domain_count,

  td.execution_quality,
  td.management_quality,
  td.entry_quality,
  td.exit_quality,
  td.repeatable,

  e.flag_opex, e.flag_month_end, e.flag_quarter_end,
  e.flag_roll, e.flag_auction, e.flag_holiday,

  -- minutes to the nearest high-importance scheduled event
  (select min(abs(extract(epoch from (ev.scheduled_at - t.entry_at)) / 60))
     from scheduled_events ev
    where ev.trading_day_id = d.id and ev.importance >= 2) as minutes_to_nearest_event,

  (select array_agg(tg.label order by tg.label)
     from trade_tags tt join tags tg on tg.id = tt.tag_id
    where tt.trade_id = t.id) as tag_labels,
  (select array_agg(tg.label order by tg.label)
     from trade_debriefs dd
     join trade_mistake_tags mt on mt.trade_debrief_id = dd.id
     join tags tg on tg.id = mt.tag_id
    where dd.trade_id = t.id) as mistake_labels,
  (select array_agg(distinct lt.key)
     from prep_levels pl
     join level_types lt on lt.id = pl.level_type_id
     join instrument_prep ip on ip.id = pl.instrument_prep_id
     join hypothesis_path_levels hpl on hpl.prep_level_id = pl.id
    where hpl.hypothesis_id = t.hypothesis_id
      and ip.trading_day_id = d.id) as path_level_types

from trades t
join (
  select td2.*, dd2.focus_rating as focus_rating_proxy
  from trading_days td2
  left join day_debriefs dd2 on dd2.trading_day_id = td2.id
) d on d.id = t.trading_day_id
join instruments i on i.id = t.instrument_id
left join sessions s on s.id = t.session_id
left join hypotheses h on h.id = t.hypothesis_id
left join opportunities o on o.id = t.opportunity_id
left join trade_edge_assessments pa on pa.trade_id = t.id and pa.was_primary
left join edge_domains pd on pd.id = pa.edge_domain_id
left join trade_debriefs td on td.trade_id = t.id
left join day_environment e on e.trading_day_id = d.id;

-- Views do not carry RLS of their own; they run with the invoker's rights so the
-- underlying policies apply. Make that explicit.
alter view trade_facts set (security_invoker = on);
grant select on trade_facts to authenticated;

-- Level performance is a separate grain (one row per marked level).
create or replace view level_facts as
select
  pl.id            as prep_level_id,
  pl.user_id,
  d.date           as day,
  d.actual_day_type,
  i.symbol         as instrument_symbol,
  i.id             as instrument_id,
  lt.key           as level_type_key,
  lt.label         as level_type_label,
  pl.price, pl.strength, pl.source,
  li.reaction, li.reaction_ticks, li.first_touch_at
from prep_levels pl
join instrument_prep ip on ip.id = pl.instrument_prep_id
join trading_days d on d.id = ip.trading_day_id
join instruments i on i.id = ip.instrument_id
join level_types lt on lt.id = pl.level_type_id
left join level_interactions li on li.prep_level_id = pl.id;

alter view level_facts set (security_invoker = on);
grant select on level_facts to authenticated;

-- Day grain, for environment slicing and discipline-vs-P&L.
create or replace view day_facts as
select
  d.id as trading_day_id, d.user_id, d.date as day,
  extract(isodow from d.date)::int as day_of_week,
  d.status, d.actual_day_type, d.open_type, d.volume_regime, d.volatility_regime,
  d.net_pnl, d.gross_pnl, d.commissions, d.trade_count, d.win_count,
  d.discipline_score, d.execution_score, d.process_adherence_pct,
  dd.focus_rating, dd.physical_state, dd.emotional_control,
  e.flag_opex, e.flag_month_end, e.flag_quarter_end, e.flag_roll, e.flag_auction, e.flag_holiday,
  (select count(*) from day_notes n where n.trading_day_id = d.id and n.kind = 'reground') as reground_count,
  (select count(*) from hypotheses h where h.trading_day_id = d.id) as hypothesis_count,
  (select h.outcome from hypotheses h where h.trading_day_id = d.id order by h.rank limit 1) as primary_hypothesis_outcome
from trading_days d
left join day_debriefs dd on dd.trading_day_id = d.id
left join day_environment e on e.trading_day_id = d.id;

alter view day_facts set (security_invoker = on);
grant select on day_facts to authenticated;
