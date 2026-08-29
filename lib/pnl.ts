/**
 * All tick and P&L arithmetic. Mirrors public.recompute_trade() in
 * db/migrations/0006_derivations.sql — the database is the source of truth for
 * stored values, this module is what the UI uses for previews and what the
 * tests pin down.
 *
 * Prices arrive from Postgres `numeric` as strings. Parse once, here.
 */

export interface InstrumentSpec {
  tickSize: number;
  tickValue: number;
  pointValue?: number;
}

export interface Fill {
  price: number;
  quantity: number;
  isEntry: boolean;
  executedAt: string | Date;
  commission?: number;
}

export type Direction = "long" | "short";

export interface TradeMaths {
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  maxSize: number;
  matchedQuantity: number;
  ticksCaptured: number | null;
  grossPnl: number;
  commissions: number;
  netPnl: number;
  rMultiple: number | null;
}

/** numeric-as-string → number. Empty and null become `fallback`. */
export function num(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Rounds to the instrument's tick grid. 4001.13 on ES → 4001.25. */
export function roundToTick(price: number, tickSize: number): number {
  if (!(tickSize > 0)) return price;
  const decimals = decimalsFor(tickSize);
  return Number((Math.round(price / tickSize) * tickSize).toFixed(decimals));
}

export function decimalsFor(tickSize: number): number {
  const s = tickSize.toString();
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(10, s.length - dot - 1);
}

export function formatPrice(price: number | string | null, tickSize: number): string {
  if (price === null || price === "") return "—";
  return num(price).toFixed(decimalsFor(tickSize));
}

/** Signed tick distance travelled in the trade's favour. */
export function ticksBetween(
  entry: number,
  exit: number,
  direction: Direction,
  tickSize: number,
): number {
  const raw = (exit - entry) / tickSize;
  return direction === "long" ? raw : -raw;
}

export function computeTrade(
  fills: Fill[],
  direction: Direction,
  instrument: InstrumentSpec,
  opts: { initialStop?: number | null } = {},
): TradeMaths {
  const entries = fills.filter((f) => f.isEntry);
  const exits = fills.filter((f) => !f.isEntry);

  const entryQty = sum(entries.map((f) => f.quantity));
  const exitQty = sum(exits.map((f) => f.quantity));
  const commissions = round2(sum(fills.map((f) => f.commission ?? 0)));

  const avgEntryPrice = entryQty > 0
    ? sum(entries.map((f) => f.price * f.quantity)) / entryQty
    : null;
  const avgExitPrice = exitQty > 0
    ? sum(exits.map((f) => f.price * f.quantity)) / exitQty
    : null;

  // Peak absolute open position across the fill sequence — handles scale-in and
  // scale-out, which a simple sum of entry quantities does not.
  let running = 0;
  let maxSize = 0;
  for (const f of [...fills].sort(byTime)) {
    running += f.isEntry ? f.quantity : -f.quantity;
    maxSize = Math.max(maxSize, Math.abs(running));
  }

  const matchedQuantity = Math.min(entryQty, exitQty);

  let ticksCaptured: number | null = null;
  let grossPnl = 0;
  let rMultiple: number | null = null;

  if (avgEntryPrice !== null && avgExitPrice !== null) {
    ticksCaptured = ticksBetween(avgEntryPrice, avgExitPrice, direction, instrument.tickSize);
    grossPnl = round2(ticksCaptured * instrument.tickValue * (matchedQuantity || 1));

    const stop = opts.initialStop;
    if (stop !== null && stop !== undefined) {
      const riskTicks = Math.abs(avgEntryPrice - stop) / instrument.tickSize;
      if (riskTicks > 0) rMultiple = round4(ticksCaptured / riskTicks);
    }
  }

  return {
    avgEntryPrice,
    avgExitPrice,
    maxSize,
    matchedQuantity,
    ticksCaptured: ticksCaptured === null ? null : round4(ticksCaptured),
    grossPnl,
    commissions,
    netPnl: round2(grossPnl - commissions),
    rMultiple,
  };
}

/** The quick-entry path: no individual fills, just averages and a size. */
export function computeFromAverages(
  entry: number,
  exit: number | null,
  size: number,
  direction: Direction,
  instrument: InstrumentSpec,
  opts: { commissions?: number; initialStop?: number | null } = {},
): TradeMaths {
  const commissions = round2(opts.commissions ?? 0);
  if (exit === null) {
    return {
      avgEntryPrice: entry, avgExitPrice: null, maxSize: size, matchedQuantity: size,
      ticksCaptured: null, grossPnl: 0, commissions, netPnl: round2(-commissions),
      rMultiple: null,
    };
  }
  const ticks = ticksBetween(entry, exit, direction, instrument.tickSize);
  const gross = round2(ticks * instrument.tickValue * size);
  let rMultiple: number | null = null;
  if (opts.initialStop !== null && opts.initialStop !== undefined) {
    const riskTicks = Math.abs(entry - opts.initialStop) / instrument.tickSize;
    if (riskTicks > 0) rMultiple = round4(ticks / riskTicks);
  }
  return {
    avgEntryPrice: entry, avgExitPrice: exit, maxSize: size, matchedQuantity: size,
    ticksCaptured: round4(ticks), grossPnl: gross, commissions,
    netPnl: round2(gross - commissions), rMultiple,
  };
}

/* ── aggregate statistics ───────────────────────────────────────────────── */

export interface ExpectancyInput {
  netPnl: number;
  rMultiple?: number | null;
  ticksCaptured?: number | null;
}

export interface Expectancy {
  count: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number | null;
  grossWin: number;
  grossLoss: number;
  profitFactor: number | null;
  netPnl: number;
  avgWin: number | null;
  avgLoss: number | null;
  expectancy: number | null;
  expectancyR: number | null;
  avgR: number | null;
}

export function expectancy(trades: ExpectancyInput[]): Expectancy {
  const count = trades.length;
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const scratches = count - wins.length - losses.length;

  const grossWin = round2(sum(wins.map((t) => t.netPnl)));
  const grossLoss = round2(Math.abs(sum(losses.map((t) => t.netPnl))));
  const netPnl = round2(sum(trades.map((t) => t.netPnl)));

  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r !== null && r !== undefined);

  return {
    count,
    wins: wins.length,
    losses: losses.length,
    scratches,
    winRate: count ? round4(wins.length / count) : null,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? round4(grossWin / grossLoss) : grossWin > 0 ? null : null,
    netPnl,
    avgWin: wins.length ? round2(grossWin / wins.length) : null,
    avgLoss: losses.length ? round2(-grossLoss / losses.length) : null,
    expectancy: count ? round2(netPnl / count) : null,
    expectancyR: rs.length ? round4(sum(rs) / rs.length) : null,
    avgR: rs.length ? round4(sum(rs) / rs.length) : null,
  };
}

/** Rolling window expectancy, for the consistency chart. */
export function rollingExpectancy(trades: ExpectancyInput[], window = 20): (number | null)[] {
  return trades.map((_, i) => {
    if (i + 1 < window) return null;
    return expectancy(trades.slice(i + 1 - window, i + 1)).expectancy;
  });
}

/** Pearson r. Returns null below three pairs — see §6.3 on sample size. */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const x = xs.slice(0, n), y = ys.slice(0, n);
  const mx = sum(x) / n, my = sum(y) / n;
  let num_ = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num_ += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return round4(num_ / Math.sqrt(dx * dy));
}

/* ── helpers ───────────────────────────────────────────────────────────── */
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const byTime = (a: Fill, b: Fill) =>
  new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime();
