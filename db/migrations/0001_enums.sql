-- Closed taxonomies become Postgres enums. Anything the trader may extend
-- (edge domains, level types, tags, rules) is a table instead — see 0002.

do $$ begin
  create type day_status          as enum ('planned','live','debriefed');
  create type day_type            as enum ('trend_up','trend_down','double_distribution','normal','normal_variation','neutral','non_trend');
  create type open_type           as enum ('open_drive','open_test_drive','open_rejection_reverse','open_auction');
  create type regime              as enum ('low','average','high','extreme');
  create type slope               as enum ('up','flat','down');
  create type bias                as enum ('short_bias','neutral','long_bias');
  create type narrative_source    as enum ('google_trends','morning_bid_europe','morning_bid_us','news_terminal','options_data','other');
  create type level_source        as enum ('chart','profile','options','external');
  create type level_reaction      as enum ('respected','broke','broke_and_retested','no_touch');
  create type hypothesis_outcome  as enum ('played_out','partial','invalidated','never_triggered');
  create type session_key         as enum ('asia','europe_pre','europe_rth','us_pre','us_rth','us_afternoon','settlement');
  create type trade_direction     as enum ('long','short');
  create type entry_style         as enum ('limit','market','stop','scaled');
  create type exit_reason         as enum ('target','stop','trail','time','discretionary','news','management_error');
  create type size_vs_plan        as enum ('under','as_planned','over');
  create type domain_alignment    as enum ('supportive','neutral','conflicting','not_applicable');
  create type tag_category        as enum ('setup','location','context','execution','error','emotion','custom');
  create type product_group       as enum ('equity_index','energy','metals','rates','fx','crypto');
  create type media_owner_type    as enum ('trade','instrument_prep','day','trade_debrief');
  create type media_kind          as enum ('screen_recording','chart_screenshot','news_terminal','ladder_capture','other');
  create type day_note_kind       as enum ('observation','emotion','market_event','rule_reminder','reground');
  create type rule_status         as enum ('followed','broken','not_applicable');
  create type review_type         as enum ('weekly','monthly');
  create type execution_side      as enum ('buy','sell');
exception when duplicate_object then null;
end $$;
