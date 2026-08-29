/**
 * §8: "RLS on every table. Verify with a test that a second user sees nothing."
 *
 * These run against a real Postgres with the migrations applied. Without
 * DATABASE_URL they skip rather than fail, so `npm test` stays fast; CI and
 * local development run them with a database attached.
 *
 *   DATABASE_URL=postgresql://... npm test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("row level security", () => {
  let sql: ReturnType<typeof postgres>;
  let alice: string;
  let bob: string;

  /** Runs a callback as a given user, exactly as lib/db/client.ts does. */
  const asUser = <T,>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`select set_config('role', 'authenticated', true)`;
      return fn(tx);
    }) as Promise<T>;

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {} });
    const [a] = await sql<{ id: string }[]>`
      insert into auth.users (email) values (${`alice-${Date.now()}@test.local`}) returning id`;
    const [b] = await sql<{ id: string }[]>`
      insert into auth.users (email) values (${`bob-${Date.now()}@test.local`}) returning id`;
    alice = a.id;
    bob = b.id;

    await asUser(alice, async (tx) => {
      const [day] = await tx<{ id: string }[]>`
        insert into trading_days (user_id, date) values (${alice}, '2029-01-03'::date) returning id`;
      const [instrument] = await tx<{ id: string }[]>`
        select id from instruments where symbol = 'ES' and user_id is null limit 1`;
      await tx`
        insert into trades (user_id, trading_day_id, instrument_id, direction, entry_at)
        values (${alice}, ${day.id}, ${instrument.id}, 'long'::trade_direction, now())`;
      await tx`insert into tags (user_id, label, category) values (${alice}, 'alice only', 'setup')`;
      await tx`insert into rules (user_id, text) values (${alice}, 'alice rule')`;
    });
  }, 30_000);

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from auth.users where id in (${alice}, ${bob})`;
    await sql.end();
  });

  it("shows a user their own rows", async () => {
    const rows = await asUser(alice, (tx) => tx`select id from trading_days where date = '2029-01-03'`);
    expect(rows.length).toBe(1);
  });

  it("shows the second user nothing of the first user's data", async () => {
    const seen = await asUser(bob, async (tx) => ({
      days: await tx`select id from trading_days`,
      trades: await tx`select id from trades`,
      tags: await tx`select id from tags`,
      rules: await tx`select id from rules`,
      facts: await tx`select trade_id from trade_facts`,
      levelFacts: await tx`select prep_level_id from level_facts`,
      dayFacts: await tx`select trading_day_id from day_facts`,
    }));

    expect(seen.days.length).toBe(0);
    expect(seen.trades.length).toBe(0);
    expect(seen.tags.length).toBe(0);
    expect(seen.rules.length).toBe(0);
    // The views run with security_invoker, so they filter too.
    expect(seen.facts.length).toBe(0);
    expect(seen.levelFacts.length).toBe(0);
    expect(seen.dayFacts.length).toBe(0);
  });

  it("still shows both users the shared reference catalogue", async () => {
    const forAlice = await asUser(alice, (tx) => tx`select id from instruments where symbol = 'ES'`);
    const forBob = await asUser(bob, (tx) => tx`select id from instruments where symbol = 'ES'`);
    expect(forAlice.length).toBeGreaterThan(0);
    expect(forBob.length).toBe(forAlice.length);

    const domains = await asUser(bob, (tx) => tx`select key from edge_domains`);
    expect(domains.length).toBe(5);
  });

  it("refuses to let a user insert a row owned by someone else", async () => {
    await expect(
      asUser(bob, (tx) => tx`
        insert into trading_days (user_id, date) values (${alice}, '2029-02-01'::date)`),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses to let a user update or delete another user's row", async () => {
    const updated = await asUser(bob, (tx) => tx`
      update trading_days set status = 'debriefed' where date = '2029-01-03' returning id`);
    expect(updated.length).toBe(0);

    const deleted = await asUser(bob, (tx) => tx`
      delete from trading_days where date = '2029-01-03' returning id`);
    expect(deleted.length).toBe(0);

    // Alice's day survived both attempts.
    const still = await asUser(alice, (tx) => tx`
      select status from trading_days where date = '2029-01-03'`);
    expect(still.length).toBe(1);
    expect((still[0] as { status: string }).status).toBe("planned");
  });
});
