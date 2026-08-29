/**
 * The universal filter. Every dimension in §6.1 lives here, it serialises to and
 * from URL search params (so a study is a shareable link), and it compiles to a
 * single WHERE clause against the trade_facts view.
 *
 * Groups combine with AND by default; `any: true` switches the whole set to OR,
 * which is what "AND/OR grouping" means in practice for one filter bar.
 */

export interface StudyFilter {
  from?: string;
  to?: string;
  instrumentIds?: string[];
  daysOfWeek?: number[];
  sessions?: string[];
  dayTypes?: string[];
  openTypes?: string[];
  volumeRegimes?: string[];
  volatilityRegimes?: string[];
  hypothesisOutcomes?: string[];
  planned?: "planned" | "unplanned";
  directions?: string[];
  primaryDomains?: string[];
  primaryAlignments?: string[];
  conflicting?: "any" | "none";
  durationBuckets?: string[];
  rBuckets?: string[];
  convictionMin?: number;
  executionQualityMin?: number;
  maeMax?: number;
  mfeMin?: number;
  flowFlags?: string[];
  eventWithinMinutes?: number;
  levelTypes?: string[];
  tagsAny?: string[];
  tagsAll?: string[];
  tagsNone?: string[];
  any?: boolean;
}

const LIST_KEYS = [
  "instrumentIds", "sessions", "dayTypes", "openTypes", "volumeRegimes",
  "volatilityRegimes", "hypothesisOutcomes", "directions", "primaryDomains",
  "primaryAlignments", "durationBuckets", "rBuckets", "flowFlags", "levelTypes",
  "tagsAny", "tagsAll", "tagsNone",
] as const;

const NUMBER_KEYS = [
  "convictionMin", "executionQualityMin", "maeMax", "mfeMin", "eventWithinMinutes",
] as const;

export function parseFilter(params: URLSearchParams | Record<string, string | string[] | undefined>): StudyFilter {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const filter: StudyFilter = {};
  const from = get("from"); if (from) filter.from = from;
  const to = get("to"); if (to) filter.to = to;

  for (const key of LIST_KEYS) {
    const raw = get(key);
    if (raw) filter[key] = raw.split(",").filter(Boolean) as never;
  }
  const dow = get("daysOfWeek");
  if (dow) filter.daysOfWeek = dow.split(",").map(Number).filter((n) => n >= 1 && n <= 7);

  for (const key of NUMBER_KEYS) {
    const raw = get(key);
    if (raw !== undefined && raw !== "" && Number.isFinite(Number(raw))) {
      filter[key] = Number(raw);
    }
  }

  const planned = get("planned");
  if (planned === "planned" || planned === "unplanned") filter.planned = planned;
  const conflicting = get("conflicting");
  if (conflicting === "any" || conflicting === "none") filter.conflicting = conflicting;
  if (get("any") === "1") filter.any = true;

  return filter;
}

export function serialiseFilter(filter: StudyFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  for (const key of LIST_KEYS) {
    const v = filter[key];
    if (v?.length) params.set(key, v.join(","));
  }
  if (filter.daysOfWeek?.length) params.set("daysOfWeek", filter.daysOfWeek.join(","));
  for (const key of NUMBER_KEYS) {
    const v = filter[key];
    if (v !== undefined) params.set(key, String(v));
  }
  if (filter.planned) params.set("planned", filter.planned);
  if (filter.conflicting) params.set("conflicting", filter.conflicting);
  if (filter.any) params.set("any", "1");
  return params;
}

/** How many dimensions the trader has actually constrained. Shown in the UI. */
export function activeCount(filter: StudyFilter): number {
  return Object.entries(filter).filter(([key, value]) => {
    if (key === "any") return false;
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== "";
  }).length;
}

export const FLOW_FLAG_COLUMNS: Record<string, string> = {
  opex: "flag_opex",
  month_end: "flag_month_end",
  quarter_end: "flag_quarter_end",
  roll: "flag_roll",
  auction: "flag_auction",
  holiday: "flag_holiday",
};

/**
 * Compiles to `[sqlText, params]` with $1-style placeholders. Kept as plain
 * strings + params (rather than a driver-specific fragment) so it is testable
 * without a database.
 */
export function compileFilter(filter: StudyFilter): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const p = (value: unknown) => { params.push(value); return `$${params.length}`; };

  const listClause = (column: string, values: string[] | undefined, cast = "text") => {
    if (!values?.length) return;
    clauses.push(`${column}::${cast} = any(${p(values)}::${cast}[])`);
  };

  if (filter.from) clauses.push(`day >= ${p(filter.from)}::date`);
  if (filter.to) clauses.push(`day <= ${p(filter.to)}::date`);
  if (filter.daysOfWeek?.length) clauses.push(`day_of_week = any(${p(filter.daysOfWeek)}::int[])`);

  listClause("instrument_id", filter.instrumentIds, "uuid");
  listClause("session_key", filter.sessions);
  listClause("actual_day_type", filter.dayTypes);
  listClause("open_type", filter.openTypes);
  listClause("volume_regime", filter.volumeRegimes);
  listClause("volatility_regime", filter.volatilityRegimes);
  listClause("hypothesis_outcome", filter.hypothesisOutcomes);
  listClause("direction", filter.directions);
  listClause("primary_domain_key", filter.primaryDomains);
  listClause("primary_domain_alignment", filter.primaryAlignments);
  listClause("duration_bucket", filter.durationBuckets);
  listClause("r_bucket", filter.rBuckets);

  if (filter.planned === "planned") clauses.push("planned");
  if (filter.planned === "unplanned") clauses.push("not planned");
  if (filter.conflicting === "any") clauses.push("any_conflicting_domain");
  if (filter.conflicting === "none") clauses.push("not any_conflicting_domain");

  if (filter.convictionMin !== undefined) clauses.push(`conviction >= ${p(filter.convictionMin)}`);
  if (filter.executionQualityMin !== undefined) {
    clauses.push(`execution_quality >= ${p(filter.executionQualityMin)}`);
  }
  if (filter.maeMax !== undefined) clauses.push(`mae_ticks <= ${p(filter.maeMax)}`);
  if (filter.mfeMin !== undefined) clauses.push(`mfe_ticks >= ${p(filter.mfeMin)}`);
  if (filter.eventWithinMinutes !== undefined) {
    clauses.push(`minutes_to_nearest_event <= ${p(filter.eventWithinMinutes)}`);
  }

  if (filter.flowFlags?.length) {
    const columns = filter.flowFlags
      .map((f) => FLOW_FLAG_COLUMNS[f])
      .filter((c): c is string => Boolean(c));
    if (columns.length) clauses.push(`(${columns.join(" or ")})`);
  }

  if (filter.levelTypes?.length) {
    clauses.push(`path_level_types && ${p(filter.levelTypes)}::text[]`);
  }
  if (filter.tagsAny?.length) clauses.push(`tag_labels && ${p(filter.tagsAny)}::text[]`);
  if (filter.tagsAll?.length) clauses.push(`tag_labels @> ${p(filter.tagsAll)}::text[]`);
  if (filter.tagsNone?.length) {
    clauses.push(`not coalesce(tag_labels, '{}'::text[]) && ${p(filter.tagsNone)}::text[]`);
  }

  if (!clauses.length) return { where: "true", params: [] };

  // Date bounds always constrain — an OR across them would silently widen the
  // window, which is not what "match any of these" means to anyone.
  if (filter.any) {
    const dateClauses = clauses.filter((c) => c.startsWith("day >=") || c.startsWith("day <="));
    const rest = clauses.filter((c) => !dateClauses.includes(c));
    if (!rest.length) return { where: dateClauses.join(" and ") || "true", params };
    const joined = `(${rest.join(" or ")})`;
    return { where: [...dateClauses, joined].join(" and "), params };
  }

  return { where: clauses.join(" and "), params };
}
