-- Row Level Security on every table, keyed to auth.uid().
-- Reference tables (instruments, edge_domains, level_types) additionally expose
-- rows with user_id = null: those are the shared seed catalogue, readable by
-- everyone and writable by no one.

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare
  t text;
  shared_tables text[] := array['instruments','edge_domains','level_types'];
  all_tables text[] := array[
    'instruments','edge_domains','level_types','tags','rules',
    'trading_days','sessions','session_preps','prep_narratives','instrument_prep',
    'prep_levels','level_interactions','day_environment','scheduled_events',
    'scheduled_event_instruments','hypotheses','hypothesis_path_levels',
    'opportunities','opportunity_supporting_domains',
    'trades','trade_executions','trade_tags','trade_edge_assessments',
    'trade_debriefs','trade_mistake_tags','media','pnl_points','day_notes',
    'day_debriefs','day_debrief_actions','rule_checks','reviews','saved_views',
    'user_settings','prep_templates'
  ];
begin
  foreach t in array all_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    -- updated_at maintenance (skip tables without the column)
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
      execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
      execute format(
        'create trigger %I before update on %I for each row execute function public.set_updated_at()',
        t || '_set_updated_at', t);
    end if;

    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);

    if t = any(shared_tables) then
      execute format(
        'create policy %I on %I for select using (user_id is null or user_id = auth.uid())',
        t || '_select', t);
    else
      execute format(
        'create policy %I on %I for select using (user_id = auth.uid())', t || '_select', t);
    end if;

    execute format(
      'create policy %I on %I for insert with check (user_id = auth.uid())', t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete using (user_id = auth.uid())', t || '_delete', t);

    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
