import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import { sslFor } from "./ssl";
import { resolveDatabaseUrl } from "./url";

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __drizzle: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function connection() {
  const resolved = resolveDatabaseUrl();
  if (!resolved) {
    throw new Error("DATABASE_URL is not set");
  }
  const { url } = resolved;
  global.__pg ??= postgres(url, {
    max: 10,
    prepare: false, // pgbouncer / Supabase poolers
    ssl: sslFor(url),
    onnotice: () => {},
  });
  return global.__pg;
}

function database() {
  global.__drizzle ??= drizzle(connection(), { schema });
  return global.__drizzle;
}

type Database = ReturnType<typeof database>;
/** The transaction handle Drizzle hands to `db.transaction()`. */
export type Db = Parameters<Parameters<Database["transaction"]>[0]>[0];

const claims = (userId: string) =>
  JSON.stringify({ sub: userId, role: "authenticated" });

/**
 * Runs `fn` inside a transaction that assumes the signed-in user's identity, so
 * every statement is filtered by the same RLS policies the Supabase client would
 * hit. There is deliberately no service-role data path in the application: if a
 * query returns a row here, it is a row this user is allowed to see.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return database().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims(userId)}, true)`);
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    return fn(tx);
  });
}

/** Raw SQL against the same RLS-enforced connection — for analytics. */
export async function withUserSql<T>(
  userId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return connection().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims(userId)}, true)`;
    await tx`select set_config('role', 'authenticated', true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** Read-only analytics role for the SQL console. Statement-timeout capped. */
export async function withReadOnlySql<T>(
  userId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return connection().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims(userId)}, true)`;
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`set local transaction read only`;
    await tx`set local statement_timeout = '10s'`;
    return fn(tx);
  }) as Promise<T>;
}

export { schema };
