/**
 * lib/pnl.ts and public.recompute_trade() implement the same arithmetic in two
 * languages. This pins them together: the same fills through both paths must
 * produce the same avg prices, ticks, P&L and R multiple.
 *
 * Skips without DATABASE_URL, like the RLS suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { computeTrade, type Fill } from "@/lib/pnl";

const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

interface Case {
  name: string;
  symbol: string;
  tickSize: number;
  tickValue: number;
  direction: "long" | "short";
  stop: number | null;
  fills: Fill[];
}

const t = (minute: number) => new Date(Date.UTC(2029, 2, 6, 14, minute)).toISOString();

const CASES: Case[] = [
  {
    name: "two fills, long, winner",
    symbol: "ES", tickSize: 0.25, tickValue: 12.5, direction: "long", stop: 4998,
    fills: [
      { price: 5000, quantity: 2, isEntry: true, executedAt: t(0), commission: 2.2 },
      { price: 5002.25, quantity: 2, isEntry: false, executedAt: t(7), commission: 2.2 },
    ],
  },
  {
    name: "scale-in then scale-out, short, loser",
    symbol: "CL", tickSize: 0.01, tickValue: 10, direction: "short", stop: 71.9,
    fills: [
      { price: 71.5, quantity: 1, isEntry: true, executedAt: t(0), commission: 1.1 },
      { price: 71.62, quantity: 2, isEntry: true, executedAt: t(3), commission: 2.2 },
      { price: 71.7, quantity: 2, isEntry: false, executedAt: t(9), commission: 2.2 },
      { price: 71.75, quantity: 1, isEntry: false, executedAt: t(14), commission: 1.1 },
    ],
  },
  {
    name: "64ths on the note complex",
    symbol: "ZN", tickSize: 0.015625, tickValue: 15.625, direction: "long", stop: 110.4375,
    fills: [
      { price: 110.5, quantity: 4, isEntry: true, executedAt: t(0), commission: 4 },
      { price: 110.578125, quantity: 4, isEntry: false, executedAt: t(20), commission: 4 },
    ],
  },
  {
    name: "no stop, so no R multiple",
    symbol: "GC", tickSize: 0.1, tickValue: 10, direction: "long", stop: null,
    fills: [
      { price: 2400, quantity: 1, isEntry: true, executedAt: t(0) },
      { price: 2403.4, quantity: 1, isEntry: false, executedAt: t(5) },
    ],
  },
];

suite("lib/pnl.ts agrees with recompute_trade()", () => {
  let sql: ReturnType<typeof postgres>;
  let userId: string;

  const asUser = <T,>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`select set_config('role', 'authenticated', true)`;
      return fn(tx);
    }) as Promise<T>;

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {} });
    const [u] = await sql<{ id: string }[]>`
      insert into auth.users (email) values (${`parity-${Date.now()}@test.local`}) returning id`;
    userId = u.id;
  }, 30_000);

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from auth.users where id = ${userId}`;
    await sql.end();
  });

  for (const c of CASES) {
    it(c.name, async () => {
      const db = await asUser(async (tx) => {
        const [day] = await tx<{ id: string }[]>`
          insert into trading_days (user_id, date) values (${userId}, '2029-03-06'::date)
          on conflict (user_id, date) do update set updated_at = now() returning id`;
        const [instrument] = await tx<{ id: string }[]>`
          select id from instruments where symbol = ${c.symbol} and user_id is null limit 1`;

        const [trade] = await tx<{ id: string }[]>`
          insert into trades (user_id, trading_day_id, instrument_id, direction, entry_at, initial_stop)
          values (${userId}, ${day.id}, ${instrument.id}, ${c.direction}::trade_direction,
                  ${c.fills[0].executedAt as string}, ${c.stop})
          returning id`;

        for (const f of c.fills) {
          const buying = c.direction === "long" ? f.isEntry : !f.isEntry;
          await tx`
            insert into trade_executions (user_id, trade_id, side, price, quantity, executed_at, is_entry, commission)
            values (${userId}, ${trade.id}, ${buying ? "buy" : "sell"}::execution_side,
                    ${f.price}, ${f.quantity}, ${f.executedAt as string}, ${f.isEntry}, ${f.commission ?? 0})`;
        }

        const [row] = await tx<{
          avg_entry_price: string; avg_exit_price: string; max_size: string;
          ticks_captured: string; gross_pnl: string; commissions: string;
          net_pnl: string; r_multiple: string | null;
        }[]>`
          select avg_entry_price, avg_exit_price, max_size, ticks_captured,
                 gross_pnl, commissions, net_pnl, r_multiple
          from trades where id = ${trade.id}`;

        await tx`delete from trades where id = ${trade.id}`;
        return row;
      });

      const ts = computeTrade(
        c.fills, c.direction,
        { tickSize: c.tickSize, tickValue: c.tickValue },
        { initialStop: c.stop },
      );

      expect(Number(db.avg_entry_price)).toBeCloseTo(ts.avgEntryPrice!, 6);
      expect(Number(db.avg_exit_price)).toBeCloseTo(ts.avgExitPrice!, 6);
      expect(Number(db.max_size)).toBeCloseTo(ts.maxSize, 6);
      expect(Number(db.ticks_captured)).toBeCloseTo(ts.ticksCaptured!, 3);
      expect(Number(db.gross_pnl)).toBeCloseTo(ts.grossPnl, 2);
      expect(Number(db.commissions)).toBeCloseTo(ts.commissions, 2);
      expect(Number(db.net_pnl)).toBeCloseTo(ts.netPnl, 2);

      if (ts.rMultiple === null) expect(db.r_multiple).toBeNull();
      else expect(Number(db.r_multiple)).toBeCloseTo(ts.rMultiple, 3);
    });
  }
});
