/**
 * Every built-in analysis, computed from the one flat fact shape. Pure and
 * tested: the Study page fetches trade_facts once and derives all eleven cards
 * from it, so a new card is a new function here plus a component.
 */
import { expectancy, correlation, rollingExpectancy, num, type Expectancy } from "@/lib/pnl";

export interface Fact {
  net_pnl: string | number;
  r_multiple: string | number | null;
  ticks_captured: string | number | null;
  duration_seconds: number | null;
  planned: boolean;
  direction: string;
  day: string;
  instrument_symbol: string;
  primary_domain_key: string | null;
  primary_domain_label: string | null;
  primary_domain_alignment: string | null;
  hypothesis_outcome: string | null;
  entry_bucket_15m: number | null;
  mae_ticks: number | null;
  mfe_ticks: number | null;
  conviction: number | null;
  execution_quality: number | null;
  actual_day_type: string | null;
  volume_regime: string | null;
  volatility_regime: string | null;
  any_conflicting_domain: boolean;
  mistake_labels: string[] | null;
  r_bucket: string | null;
  duration_bucket: string | null;
  session_key: string | null;
}

export interface Bucket extends Expectancy {
  key: string;
  label: string;
}

const toExpectancyInput = (f: Fact) => ({
  netPnl: num(f.net_pnl),
  rMultiple: f.r_multiple === null ? null : num(f.r_multiple),
  ticksCaptured: f.ticks_captured === null ? null : num(f.ticks_captured),
});

export function summarise(facts: Fact[]): Expectancy {
  return expectancy(facts.map(toExpectancyInput));
}

function bucketise(facts: Fact[], key: (f: Fact) => string | null): Map<string, Fact[]> {
  const groups = new Map<string, Fact[]>();
  for (const f of facts) {
    const k = key(f) ?? "—";
    const list = groups.get(k);
    if (list) list.push(f);
    else groups.set(k, [f]);
  }
  return groups;
}

/** Group by any accessor, summarise each group. The pivot builder uses this. */
export function groupBy(
  facts: Fact[],
  key: (f: Fact) => string | null,
  label: (k: string) => string = (k) => k,
): Bucket[] {
  return [...bucketise(facts, key).entries()]
    .map(([k, rows]) => ({ key: k, label: label(k), ...summarise(rows) }))
    .sort((a, b) => b.count - a.count);
}

export const R_BUCKETS = ["<=-2R", "-2R..-1R", "-1R..0", "0..1R", "1R..2R", "2R..3R", ">=3R"];

export function rHistogram(facts: Fact[]): { bucket: string; n: number }[] {
  const counts = new Map(R_BUCKETS.map((b) => [b, 0]));
  for (const f of facts) {
    if (f.r_bucket && counts.has(f.r_bucket)) counts.set(f.r_bucket, counts.get(f.r_bucket)! + 1);
  }
  return R_BUCKETS.map((bucket) => ({ bucket, n: counts.get(bucket)! }));
}

export interface MatrixCell extends Expectancy { row: string; col: string }

export function matrix(
  facts: Fact[],
  row: (f: Fact) => string,
  col: (f: Fact) => string,
): { rows: string[]; cols: string[]; cells: MatrixCell[] } {
  const rows = new Set<string>();
  const cols = new Set<string>();
  const grid = new Map<string, Map<string, Fact[]>>();

  for (const f of facts) {
    const r = row(f);
    const c = col(f);
    rows.add(r);
    cols.add(c);
    const inner = grid.get(r) ?? grid.set(r, new Map()).get(r)!;
    const list = inner.get(c);
    if (list) list.push(f);
    else inner.set(c, [f]);
  }

  const cells: MatrixCell[] = [];
  for (const [r, inner] of grid) {
    for (const [c, list] of inner) cells.push({ row: r, col: c, ...summarise(list) });
  }
  return { rows: [...rows].sort(), cols: [...cols].sort(), cells };
}

export const ALIGNMENT_ORDER = ["supportive", "neutral", "conflicting", "not_applicable", "unscored"];

/** Domain by alignment — the single most important table in the app. */
export function domainMatrix(facts: Fact[]) {
  const m = matrix(
    facts,
    (f) => f.primary_domain_label ?? "Not scored",
    (f) => f.primary_domain_alignment ?? "unscored",
  );
  return { ...m, cols: ALIGNMENT_ORDER.filter((a) => m.cols.includes(a)) };
}

export function plannedSplit(facts: Fact[]) {
  return {
    planned: summarise(facts.filter((f) => f.planned)),
    unplanned: summarise(facts.filter((f) => !f.planned)),
  };
}

export function timeOfDay(facts: Fact[]): (Bucket & { minutes: number })[] {
  return groupBy(facts, (f) => (f.entry_bucket_15m === null ? null : String(f.entry_bucket_15m)))
    .filter((b) => b.key !== "—")
    .map((b) => {
      const minutes = Number(b.key) * 15;
      const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
      const mm = String(minutes % 60).padStart(2, "0");
      return { ...b, label: `${hh}:${mm}`, minutes };
    })
    .sort((a, b) => a.minutes - b.minutes);
}

export function mistakesOverTime(facts: Fact[]) {
  const byMonth = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const f of facts) {
    const month = f.day.slice(0, 7);
    for (const label of f.mistake_labels ?? []) {
      const inner = byMonth.get(month) ?? byMonth.set(month, new Map()).get(month)!;
      inner.set(label, (inner.get(label) ?? 0) + 1);
      totals.set(label, (totals.get(label) ?? 0) + 1);
    }
  }
  const months = [...byMonth.keys()].sort();
  const labels = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  return {
    months,
    labels,
    series: months.map((month) => ({
      month,
      total: [...(byMonth.get(month)?.values() ?? [])].reduce((a, b) => a + b, 0),
      counts: Object.fromEntries(byMonth.get(month) ?? []),
    })),
  };
}

export function maeMfeScatter(facts: Fact[]) {
  return facts
    .filter((f) => f.mae_ticks !== null && f.mfe_ticks !== null)
    .map((f) => ({
      mae: f.mae_ticks!,
      mfe: f.mfe_ticks!,
      net: num(f.net_pnl),
      duration: f.duration_seconds ?? 0,
      symbol: f.instrument_symbol,
      day: f.day,
    }));
}

/** Rolling 20-trade expectancy, oldest first. */
export function consistency(facts: Fact[], window = 20) {
  const ordered = [...facts].reverse();
  const rolled = rollingExpectancy(ordered.map(toExpectancyInput), window);
  return ordered
    .map((f, i) => ({ day: f.day, value: rolled[i] }))
    .filter((p) => p.value !== null) as { day: string; value: number }[];
}

export interface NumericField {
  key: string;
  label: string;
  get: (f: Fact) => number | null;
}

export const CORRELATION_FIELDS: NumericField[] = [
  { key: "net_pnl", label: "Net P&L", get: (f) => num(f.net_pnl) },
  { key: "r_multiple", label: "R multiple", get: (f) => (f.r_multiple === null ? null : num(f.r_multiple)) },
  { key: "ticks", label: "Ticks captured", get: (f) => (f.ticks_captured === null ? null : num(f.ticks_captured)) },
  { key: "duration", label: "Duration (seconds)", get: (f) => f.duration_seconds },
  { key: "conviction", label: "Conviction", get: (f) => f.conviction },
  { key: "execution_quality", label: "Execution quality", get: (f) => f.execution_quality },
  { key: "mae", label: "MAE ticks", get: (f) => f.mae_ticks },
  { key: "mfe", label: "MFE ticks", get: (f) => f.mfe_ticks },
];

export function correlate(facts: Fact[], x: NumericField, y: NumericField) {
  const pairs = facts
    .map((f) => [x.get(f), y.get(f)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null);
  return {
    points: pairs.map(([a, b]) => ({ x: a, y: b })),
    r: correlation(pairs.map((p) => p[0]), pairs.map((p) => p[1])),
    n: pairs.length,
  };
}

/** Dimensions the pivot builder offers. Generic on purpose. */
export const PIVOT_DIMENSIONS: { key: string; label: string; get: (f: Fact) => string }[] = [
  { key: "instrument", label: "Instrument", get: (f) => f.instrument_symbol },
  { key: "direction", label: "Direction", get: (f) => f.direction },
  { key: "planned", label: "Planned", get: (f) => (f.planned ? "planned" : "improvised") },
  { key: "day_type", label: "Day type", get: (f) => f.actual_day_type ?? "unclassified" },
  { key: "volume", label: "Volume regime", get: (f) => f.volume_regime ?? "unrecorded" },
  { key: "volatility", label: "Volatility regime", get: (f) => f.volatility_regime ?? "unrecorded" },
  { key: "domain", label: "Primary domain", get: (f) => f.primary_domain_label ?? "not scored" },
  { key: "alignment", label: "Primary alignment", get: (f) => f.primary_domain_alignment ?? "unscored" },
  { key: "hypothesis", label: "Hypothesis outcome", get: (f) => f.hypothesis_outcome ?? "unlinked" },
  { key: "session", label: "Session", get: (f) => f.session_key ?? "unassigned" },
  { key: "duration", label: "Duration bucket", get: (f) => f.duration_bucket ?? "open" },
  { key: "r_bucket", label: "R bucket", get: (f) => f.r_bucket ?? "no R" },
  { key: "conviction", label: "Conviction", get: (f) => (f.conviction === null ? "unrated" : String(f.conviction)) },
  { key: "month", label: "Month", get: (f) => f.day.slice(0, 7) },
  { key: "weekday", label: "Weekday", get: (f) => WEEKDAYS[new Date(f.day + "T00:00:00Z").getUTCDay()] },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
