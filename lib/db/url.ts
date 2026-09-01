/**
 * Where the connection string comes from.
 *
 * `DATABASE_URL` is the one you set by hand. The rest are what Vercel's
 * Supabase integration writes into the project for you — correct host,
 * correct password, nothing typed. Accepting them means the setup can be a
 * button rather than a string that has to be assembled without a single
 * mistake, which is where every failure in this project's history came from:
 * an unreplaced placeholder, a pooler host copied from an example, a password
 * that did not match.
 *
 * Order matters. A hand-set DATABASE_URL wins, because someone chose it
 * deliberately. The pooled URLs come next; the non-pooling one is last because
 * it resolves over IPv6, which serverless platforms commonly cannot reach.
 *
 * "Deliberately" is the operative word: a string still carrying the dashboard's
 * [YOUR-PASSWORD] placeholder was not chosen, it was half-pasted, and letting
 * it outrank a working value from the integration is how a correct setup stays
 * broken. Unusable candidates are skipped, and only reported if nothing else
 * works — the report is still better than "nothing is set".
 */
export interface Resolved {
  url: string;
  /** The variable it came from, so a health check can say which one is in play. */
  source: string;
}

const CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

/** Every variable that could carry a connection string, for error messages. */
export const CONNECTION_VARIABLES = [...CANDIDATES] as readonly string[];

/** A value that cannot possibly connect, however deliberately it was set. */
function unusable(url: string): boolean {
  if (/\[YOUR-PASSWORD\]/i.test(url)) return true;
  try {
    new URL(url);
    return false;
  } catch {
    return true;
  }
}

export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): Resolved | null {
  const present: Resolved[] = [];
  for (const name of CANDIDATES) {
    const value = env[name]?.trim();
    if (value) present.push({ url: value, source: name });
  }

  const workable = present.find((c) => !unusable(c.url));
  if (workable) return workable;

  // The integration also writes the parts separately. Assembling them is the
  // last resort but the most forgiving: nothing here has to be escaped by
  // hand, so a password full of reserved characters cannot break the URL.
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST, POSTGRES_DATABASE } = env;
  if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_HOST) {
    const user = encodeURIComponent(POSTGRES_USER);
    const password = encodeURIComponent(POSTGRES_PASSWORD);
    const database = POSTGRES_DATABASE || "postgres";
    return {
      url: `postgresql://${user}:${password}@${POSTGRES_HOST}/${database}`,
      source: "POSTGRES_USER/PASSWORD/HOST",
    };
  }

  // Nothing workable and no parts. Hand back the first thing that was set, so
  // the shape check can name what is wrong with it.
  return present[0] ?? null;
}
