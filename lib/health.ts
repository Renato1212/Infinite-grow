/**
 * What a running deployment can tell you about its own configuration.
 *
 * The three remaining setup steps all happen in someone else's dashboard, and
 * a check that runs on your laptop proves nothing about what Vercel is holding.
 * These run inside the deployment instead, so the answer is about the thing
 * actually serving traffic.
 *
 * Nothing here reads user rows and nothing here returns a value it was given:
 * no connection string, no key, no driver message. Driver failures are mapped
 * to a fixed set of causes, because "password authentication failed" is the
 * sentence that tells you which of the three steps you got wrong, while the
 * raw error carries the host and role along with it.
 */
import postgres from "postgres";
import { sslFor } from "./db/ssl";

export type Status = "ok" | "warn" | "fail";

export interface Check {
  name: string;
  status: Status;
  detail: string;
  /** What to do about it — omitted when there is nothing to do. */
  fix?: string;
  /**
   * True when nothing could actually be checked and only you can confirm it.
   * These are excluded from the summary: a status that can never reach "ok"
   * trains you to ignore it, which is worse than not reporting it.
   */
  manual?: boolean;
}

export interface Health {
  status: Status;
  checks: Check[];
}

/**
 * The worst *verified* status, since one failure makes the whole thing
 * unusable. Manual items are excluded — see Check.manual.
 */
export function overall(checks: Check[]): Status {
  const verified = checks.filter((c) => !c.manual);
  if (verified.some((c) => c.status === "fail")) return "fail";
  if (verified.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

/**
 * Maps a driver failure to a cause that is safe to print.
 *
 * Exported for its own test: this is the part that would leak a hostname or a
 * role name if it were ever reduced to `String(err)`.
 */
export function classifyDbError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const raw = err instanceof Error ? err.message : String(err);

  const byCode: Record<string, string> = {
    "28P01": "the password in DATABASE_URL was rejected",
    "28000": "the role in DATABASE_URL is not allowed to connect",
    "3D000": "that database name does not exist on the server",
    "42501": "the role in DATABASE_URL lacks permission",
    ENOTFOUND: "the host in DATABASE_URL does not resolve",
    EAI_AGAIN: "the host in DATABASE_URL could not be resolved (DNS)",
    ECONNREFUSED: "nothing is listening on that host and port",
    ETIMEDOUT: "the connection timed out",
    CONNECT_TIMEOUT: "the connection timed out",
  };
  if (byCode[code]) return byCode[code];

  // postgres-js reports a plaintext rejection as a protocol error rather than
  // a code, and it is the single most likely failure against a hosted server.
  if (/SSL|TLS|self.signed|certificate/i.test(raw)) return "the TLS handshake failed";
  if (/terminated|CONNECTION_CLOSED/i.test(raw)) return "the server closed the connection";
  return "the connection failed";
}

async function withConnection<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: sslFor(url),
    onnotice: () => {},
    connect_timeout: 10,
  });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Runs one query, returning null rather than throwing if the object is absent. */
async function tryQuery<T>(sql: postgres.Sql, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

async function databaseChecks(): Promise<Check[]> {
  if (!process.env.DATABASE_URL) {
    return [
      {
        name: "Database",
        status: "fail",
        detail: "DATABASE_URL is not set, so there is nothing to read or write.",
        fix: "Vercel → Settings → Environment Variables → add DATABASE_URL, then redeploy.",
      },
    ];
  }

  try {
    return await withConnection(async (sql) => {
      const checks: Check[] = [];

      const [shape] = await sql<
        { tables: number; policies: number; unprotected: number; views: number }[]
      >`
        select
          (select count(*)::int from information_schema.tables
             where table_schema = 'public' and table_type = 'BASE TABLE'
               and table_name <> 'schema_migrations') as tables,
          (select count(*)::int from pg_policies where schemaname = 'public') as policies,
          (select count(*)::int from pg_tables
             where schemaname = 'public' and not rowsecurity
               and tablename <> 'schema_migrations') as unprotected,
          (select count(*)::int from pg_views where schemaname = 'public') as views
      `;

      checks.push({
        name: "Database",
        status: "ok",
        detail: sslFor(process.env.DATABASE_URL!)
          ? "Reachable over TLS."
          : "Reachable, without TLS — expected only for a local database.",
      });

      if (shape.tables === 0) {
        checks.push({
          name: "Schema",
          status: "fail",
          detail: "Connected, but the database is empty.",
          fix: "Run npm run db:push against this DATABASE_URL.",
        });
        return checks;
      }

      const migrations = await tryQuery(sql, () =>
        sql<{ n: number; latest: string | null }[]>`
          select count(*)::int as n, max(name) as latest from schema_migrations
        `,
      );

      checks.push({
        name: "Schema",
        status: "ok",
        detail: `${shape.tables} tables, ${shape.views} views, ${
          migrations?.[0]?.n ?? 0
        } migrations applied${
          migrations?.[0]?.latest ? ` (latest ${migrations[0].latest})` : ""
        }.`,
      });

      // The property the whole privacy model rests on. It is cheap to assert
      // and catastrophic to assume.
      checks.push(
        shape.unprotected > 0
          ? {
              name: "Row level security",
              status: "fail",
              detail: `${shape.unprotected} table(s) have RLS switched off.`,
              fix: "Re-run npm run db:push; migration 0005 forces RLS on every table.",
            }
          : shape.policies !== shape.tables * 4
            ? {
                name: "Row level security",
                status: "warn",
                detail: `RLS is on everywhere, but there are ${shape.policies} policies for ${shape.tables} tables (four each expected).`,
                fix: "Check that migration 0005 applied cleanly.",
              }
            : {
                name: "Row level security",
                status: "ok",
                detail: `Forced on all ${shape.tables} tables, ${shape.policies} policies.`,
              },
      );

      const instruments = await tryQuery(sql, () =>
        sql<{ n: number }[]>`select count(*)::int as n from instruments where user_id is null`,
      );
      if (instruments) {
        checks.push(
          instruments[0].n > 0
            ? {
                name: "Reference data",
                status: "ok",
                detail: `${instruments[0].n} shared instruments in the catalogue.`,
              }
            : {
                name: "Reference data",
                status: "warn",
                detail: "The shared instrument catalogue is empty.",
                fix: "Re-run npm run db:push; migration 0008 seeds it.",
              },
        );
      }

      const bucket = await tryQuery(sql, () =>
        sql<{ public: boolean }[]>`select public from storage.buckets where id = 'media'`,
      );
      if (bucket !== null) {
        checks.push(
          bucket.length === 0
            ? {
                name: "Media storage",
                status: "warn",
                detail: "No 'media' bucket, so trade recordings cannot be uploaded.",
                fix: "Re-run npm run db:push; migration 0010 creates it.",
              }
            : bucket[0].public
              ? {
                  name: "Media storage",
                  status: "fail",
                  detail: "The 'media' bucket is public — recordings would be world-readable.",
                  fix: "Supabase → Storage → media → make it private.",
                }
              : { name: "Media storage", status: "ok", detail: "Private 'media' bucket present." },
        );
      }

      return checks;
    });
  } catch (err) {
    return [
      {
        name: "Database",
        status: "fail",
        detail: `DATABASE_URL is set, but ${classifyDbError(err)}.`,
        fix: "Supabase → Project Settings → Database → Connection string, and reset the password if you no longer have it.",
      },
    ];
  }
}

export async function supabaseChecks(): Promise<Check[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].filter(Boolean);
    return [
      {
        name: "Authentication",
        status: "fail",
        detail: `${missing.join(" and ")} not set, so nobody can sign in.`,
        fix: "Vercel → Settings → Environment Variables, then redeploy.",
      },
    ];
  }

  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return [
        {
          name: "Authentication",
          status: "fail",
          detail: `Supabase answered ${res.status} — most likely the anon key does not belong to this project URL.`,
          fix: "Supabase → Project Settings → API, and copy both values from the same project.",
        },
      ];
    }
    const settings = (await res.json()) as { disable_signup?: boolean };
    const checks: Check[] = [
      {
        name: "Authentication",
        status: "ok",
        detail: "Supabase reachable and the anon key is valid for this project.",
      },
    ];
    // This is the one security step the setup cannot do for you, and the only
    // one a machine can check: an open journal is one sign-up away from shared.
    checks.push(
      settings.disable_signup
        ? { name: "Sign-ups", status: "ok", detail: "Closed. Only existing accounts can sign in." }
        : {
            name: "Sign-ups",
            status: "warn",
            detail: "Anyone with the URL can still create an account.",
            fix: "Sign in first, then Supabase → Authentication → Sign In / Providers → Email → disable “Allow new users to sign up”.",
          },
    );
    return checks;
  } catch {
    return [
      {
        name: "Authentication",
        status: "fail",
        detail: "Could not reach the Supabase project at NEXT_PUBLIC_SUPABASE_URL.",
        fix: "Check the URL is the project's, not the dashboard's: https://<ref>.supabase.co",
      },
    ];
  }
}

/**
 * The redirect allowlist is not readable through any API, so this states the
 * one-line manual test rather than pretending to have checked it.
 */
function redirectCheck(): Check {
  return {
    name: "Auth redirect URLs",
    status: "warn",
    manual: true,
    detail: "Cannot be read back from Supabase, so this is the one step nothing can verify for you.",
    fix: "Send yourself a sign-in link: if it opens this host and signs you in, it is right. If it drops you on localhost, add <this origin>/auth/callback under Authentication → URL Configuration.",
  };
}

/**
 * What an caller is allowed to see.
 *
 * Detail is public only while the app is not yet working — which is exactly
 * when it is needed and when there is nothing behind it to protect, because no
 * session can exist until the setup is finished. Once it is green, an
 * anonymous caller gets the summary alone.
 */
export function visibleTo(health: Health, signedIn: boolean): Health | { status: Status } {
  if (signedIn) return health;
  if (health.status === "ok") return { status: health.status };
  return health;
}

export async function runHealth(): Promise<Health> {
  const [supabase, database] = await Promise.all([supabaseChecks(), databaseChecks()]);
  const checks = [...supabase, ...database, redirectCheck()];
  return { status: overall(checks), checks };
}
