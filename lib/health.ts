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
import { isLocalHost, sslFor } from "./db/ssl";
import { CONNECTION_VARIABLES, connectionVariablesPresent, resolveDatabaseUrl } from "./db/url";

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
    "28P01": "the password in the connection string was rejected",
    "28000": "the role in the connection string is not allowed to connect",
    "3D000": "that database name does not exist on the server",
    "42501": "the role in the connection string lacks permission",
    ENOTFOUND: "the host in the connection string does not resolve",
    EAI_AGAIN: "the host in the connection string could not be resolved (DNS)",
    ECONNREFUSED: "nothing is listening on that host and port",
    ETIMEDOUT: "the connection timed out",
    CONNECT_TIMEOUT: "the connection timed out",
  };
  if (byCode[code]) return byCode[code];

  // postgres-js reports a plaintext rejection as a protocol error rather than
  // a code, and it is the single most likely failure against a hosted server.
  // Supavisor answers an unknown tenant with this rather than a Postgres code,
  // and it means the username is wrong, not the password.
  // Two different mistakes produce this, and naming only one sends people to
  // check a part that is already correct. The numeric prefix on the pooler host
  // varies per project, so a host copied from an example rather than from the
  // dashboard fails here exactly as a wrong username does.
  if (/Tenant or user not found|tenant\/user .* not found|ENOTFOUND/i.test(raw))
    return "the pooler does not recognise this tenant — either the username is not postgres.<project-ref>, or the host is the wrong pooler (its aws-N prefix and region must come from the dashboard, not from an example)";
  // Repeated bad passwords trip Supavisor's breaker, which then rejects even a
  // correct one for a few minutes. Worth naming: it makes a fix that already
  // works look like it failed, and the obvious response is to change the
  // password again, which starts the cycle over.
  if (/circuit breaker|temporarily blocked|too many authentication failures/i.test(raw))
    return "earlier failed attempts tripped the pooler's circuit breaker, which blocks all connections for a few minutes — wait, then retry before changing anything";
  if (/SSL|TLS|self.signed|certificate/i.test(raw)) return "the TLS handshake failed";
  if (/terminated|CONNECTION_CLOSED/i.test(raw)) return "the server closed the connection";
  return "the connection failed";
}

async function withConnection<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const url = resolveDatabaseUrl()!.url;
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

/**
 * What can be judged from the connection string alone, before dialling.
 *
 * A pooler host with a bare `postgres` username is the single most common way
 * this goes wrong, and it costs a deploy cycle to discover from the server's
 * reply. The rules come from Supabase's own connection docs: the shared pooler
 * authenticates as `postgres.<project-ref>`, the direct host as `postgres`.
 *
 * Exported for its own test; `serverless` is passed rather than read so the
 * test does not have to fake a platform.
 */
export function checkConnectionShape(
  url: string,
  serverless: boolean,
  /** The variable it came from, so the advice names the one you would edit. */
  source = "DATABASE_URL",
): Check[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [
      {
        name: "Database",
        status: "fail",
        detail: `${source} is not a valid URL.`,
        // Far and away the usual cause, and invisible when you look at it.
        fix: "A reserved character in the password will do this. Percent-encode them: # is %23, @ is %40, / is %2F, ? is %3F, % is %25, & is %26, : is %3A, a space is %20.",
      },
    ];
  }

  const host = parsed.hostname;
  const user = decodeURIComponent(parsed.username);
  const password = parsed.password;
  const pooler = host.endsWith("pooler.supabase.com");
  const direct = /^db\.[a-z0-9]+\.supabase\.co$/.test(host);

  // A local database under trust authentication legitimately has no password;
  // only a remote host makes its absence a fault.
  if (!password && !isLocalHost(host)) {
    return [
      {
        name: "Database",
        status: "fail",
        detail: `${source} has no password in it.`,
        fix: "Supabase → Project Settings → Database → Connection string.",
      },
    ];
  }
  if (/%5B|%5D|\[|\]/.test(password) || /YOUR-PASSWORD/i.test(decodeURIComponent(password))) {
    return [
      {
        name: "Database",
        status: "fail",
        detail: `${source} still contains the [YOUR-PASSWORD] placeholder.`,
        fix: "Replace it with the real password from Supabase → Project Settings → Database.",
      },
    ];
  }
  if (pooler && !user.includes(".")) {
    return [
      {
        name: "Database",
        status: "fail",
        detail: `The pooler host needs the username postgres.<project-ref>, but this connects as "${user}".`,
        fix: "Copy the string from Supabase → Connect → Transaction pooler, which already has it right.",
      },
    ];
  }
  if (direct && user.includes(".")) {
    return [
      {
        name: "Database",
        status: "fail",
        detail: `The direct host authenticates as plain "postgres", but this connects as "${user}".`,
        fix: "Either drop the .<project-ref> from the username, or use the pooler host it belongs to.",
      },
    ];
  }

  // Not fatal, but it will never work from a serverless platform, and the
  // failure it produces looks like a network fault rather than a wrong choice.
  if (direct && serverless) {
    return [
      {
        name: "Database",
        status: "warn",
        detail: "This is the direct connection, which Supabase serves over IPv6; serverless platforms are commonly IPv4-only.",
        fix: "Use the transaction pooler string (aws-…pooler.supabase.com:6543) instead.",
      },
    ];
  }

  return [];
}

async function databaseChecks(): Promise<Check[]> {
  const resolved = resolveDatabaseUrl();
  if (!resolved) {
    // Say which variables the deployment can actually see. "None of them are
    // set" reads the same whether nothing was configured or one of four parts
    // was missed, and those need opposite fixes.
    const { present, missing } = connectionVariablesPresent();
    const seen = present.length
      ? `Set here: ${present.join(", ")}. Not set: ${missing.join(", ")}.`
      : `None of ${CONNECTION_VARIABLES.join(", ")} are set.`;
    return [
      {
        name: "Database",
        status: "fail",
        detail: `No usable connection string. ${seen}`,
        // The integration is the easier of the two, because it fills in the
        // host and password itself; assembling the string by hand is what
        // every failure here has come from.
        fix: "Easiest: Vercel → the project → Integrations → connect the Supabase project, which sets POSTGRES_URL for you. Otherwise add DATABASE_URL by hand. Either way, redeploy afterwards.",
      },
    ];
  }

  const shapeIssues = checkConnectionShape(resolved.url, Boolean(process.env.VERCEL), resolved.source);
  // A wrong shape names the mistake; the server's reply would only say "rejected".
  if (shapeIssues.some((c) => c.status === "fail")) return shapeIssues;

  try {
    return await withConnection(async (sql) => {
      const checks: Check[] = [...shapeIssues];

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
        detail: `${
          sslFor(resolved.url)
            ? "Reachable over TLS"
            : "Reachable, without TLS — expected only for a local database"
        }, using ${resolved.source}.`,
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
    const settings = (await res.json()) as {
      disable_signup?: boolean;
      mailer_autoconfirm?: boolean;
    };
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
    // Sign-in is email and password, so no link is involved and no redirect
    // allowlist is needed. Confirmation on sign-up is the one exception, and
    // unlike the allowlist itself this is readable, so it is checked rather
    // than left as an instruction.
    checks.push(
      settings.mailer_autoconfirm
        ? {
            name: "Email confirmation",
            status: "ok",
            detail: "Off — creating an account signs you straight in.",
          }
        : {
            name: "Email confirmation",
            status: "warn",
            detail:
              "On, so creating an account needs a link from your inbox before you can sign in.",
            fix: "Either confirm that one email, or turn off Authentication → Sign In / Providers → Email → Confirm email.",
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
  const checks = [...supabase, ...database];
  return { status: overall(checks), checks };
}
