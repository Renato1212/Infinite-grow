import "server-only";
import { withUserSql } from "@/lib/db/client";
import { compileFilter, type StudyFilter } from "./filters";

/**
 * Every analysis is a query against trade_facts with the same compiled WHERE.
 * Adding a card means adding a function here and a component in
 * components/study/cards — nothing else changes.
 */
async function run<T>(userId: string, filter: StudyFilter, sqlText: string): Promise<T[]> {
  const { where, params } = compileFilter(filter);
  const text = sqlText.replaceAll("{{where}}", where);
  return withUserSql(userId, async (sql) => {
    const rows = await sql.unsafe(text, params as never[]);
    return rows as unknown as T[];
  });
}

export interface FactRow {
  trade_id: string; day: string; instrument_symbol: string; direction: string;
  planned: boolean; net_pnl: string; r_multiple: string | null;
  ticks_captured: string | null; duration_seconds: number | null;
  primary_domain_key: string | null; primary_domain_label: string | null;
  primary_domain_alignment: string | null; hypothesis_outcome: string | null;
  entry_bucket_15m: number | null; entry_local_hhmm: string | null;
  mae_ticks: number | null; mfe_ticks: number | null; conviction: number | null;
  execution_quality: number | null; actual_day_type: string | null;
  volume_regime: string | null; volatility_regime: string | null;
  any_conflicting_domain: boolean; tag_labels: string[] | null;
  mistake_labels: string[] | null; r_bucket: string | null; duration_bucket: string | null;
  entry_at: string; exit_at: string | null; session_key: string | null;
}

export const facts = (userId: string, filter: StudyFilter, limit = 5000) =>
  run<FactRow>(userId, filter, `
    select * from trade_facts where {{where}} order by entry_at desc limit ${limit}
  `);

/**
 * Level reactions are a different grain from trades — one row per marked level,
 * not per trade — so this takes only the date window from the filter. Applying
 * a trade-shaped filter here would silently answer a different question.
 */
export const levelPerformance = (userId: string, filter: StudyFilter) =>
  withUserSql(userId, async (sql) => {
    const from = filter.from ?? "1900-01-01";
    const to = filter.to ?? "2999-12-31";
    const rows = await sql`
      select level_type_label as bucket,
             count(*)::int as n,
             count(*) filter (where reaction = 'respected')::int as respected,
             count(*) filter (where reaction = 'broke')::int as broke,
             count(*) filter (where reaction = 'broke_and_retested')::int as broke_retested,
             count(*) filter (where reaction = 'no_touch')::int as no_touch,
             round(avg(reaction_ticks), 1) as avg_ticks
      from level_facts
      where reaction is not null and day >= ${from}::date and day <= ${to}::date
      group by 1 order by n desc
    `;
    return rows as unknown as {
      bucket: string; n: number; respected: number; broke: number;
      broke_retested: number; no_touch: number; avg_ticks: string | null;
    }[];
  });

export const dayStats = (userId: string, filter: StudyFilter) =>
  withUserSql(userId, async (sql) => {
    const from = filter.from ?? "1900-01-01";
    const to = filter.to ?? "2999-12-31";
    const rows = await sql`
      select day, net_pnl, trade_count, win_count, process_adherence_pct,
             focus_rating, emotional_control, physical_state, reground_count,
             actual_day_type, volume_regime, volatility_regime,
             primary_hypothesis_outcome
      from day_facts
      where day >= ${from}::date and day <= ${to}::date
      order by day
    `;
    return rows as unknown as {
      day: string; net_pnl: string; trade_count: number; win_count: number;
      process_adherence_pct: string | null; focus_rating: number | null;
      emotional_control: number | null; physical_state: number | null;
      reground_count: number; actual_day_type: string | null;
      volume_regime: string | null; volatility_regime: string | null;
      primary_hypothesis_outcome: string | null;
    }[];
  });

/**
 * Similar-day finder: weighted categorical matching, no ML. Each dimension that
 * agrees with today adds its weight; days are ranked by the total.
 */
export const similarDays = (userId: string, dayId: string, limit = 8) =>
  withUserSql(userId, async (sql) => {
    const rows = await sql`
      with target as (select * from day_facts where trading_day_id = ${dayId}::uuid)
      select d.day, d.net_pnl, d.trade_count, d.actual_day_type, d.volume_regime,
             d.volatility_regime, d.primary_hypothesis_outcome,
             ( (d.actual_day_type is not distinct from t.actual_day_type)::int * 3
             + (d.open_type is not distinct from t.open_type)::int * 2
             + (d.volume_regime is not distinct from t.volume_regime)::int * 2
             + (d.volatility_regime is not distinct from t.volatility_regime)::int * 2
             + (d.flag_opex = t.flag_opex)::int
             + (d.flag_month_end = t.flag_month_end)::int
             + (d.flag_quarter_end = t.flag_quarter_end)::int
             ) as score
      from day_facts d, target t
      where d.trading_day_id <> t.trading_day_id
        and d.actual_day_type is not null
      order by score desc, d.day desc
      limit ${limit}
    `;
    return rows as unknown as {
      day: string; net_pnl: string; trade_count: number; actual_day_type: string | null;
      volume_regime: string | null; volatility_regime: string | null;
      primary_hypothesis_outcome: string | null; score: number;
    }[];
  });

/** Read-only escape hatch. The transaction is read-only and time-limited. */
export async function runReadOnlyQuery(userId: string, text: string) {
  const banned = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do)\b/i;
  if (banned.test(text)) {
    throw new Error("Only select statements run here. The console is read-only by design.");
  }
  const { withReadOnlySql } = await import("@/lib/db/client");
  return withReadOnlySql(userId, async (sql) => {
    const rows = await sql.unsafe(`select * from (${text.replace(/;\s*$/, "")}) as q limit 500`);
    return rows as unknown as Record<string, unknown>[];
  });
}
