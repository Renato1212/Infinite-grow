import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}

function connection() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  global.__pg ??= postgres(process.env.DATABASE_URL, {
    max: 10,
    prepare: false, // pgbouncer / Supabase session pooler
    onnotice: () => {},
  });
  return global.__pg;
}

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Runs `fn` inside a transaction that assumes the signed-in user's identity, so
 * every statement is filtered by the same RLS policies the Supabase client would
 * hit. There is deliberately no service-role data path in the application: if a
 * query returns a row here, it is a row this user is allowed to see.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const sql = connection();
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`select set_config('role', 'authenticated', true)`;
    const db = drizzle(tx as never, { schema });
    return fn(db as Db);
  }) as Promise<T>;
}

/** Raw SQL against the same RLS-enforced connection — for analytics. */
export async function withUserSql<T>(
  userId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = connection();
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`select set_config('role', 'authenticated', true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Read-only analytics role for the SQL console. Statement-timeout capped. */
export async function withReadOnlySql<T>(
  userId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = connection();
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`set local transaction read only`;
    await tx`set local statement_timeout = '10s'`;
    return fn(tx);
  }) as Promise<T>;
}

export { schema };
