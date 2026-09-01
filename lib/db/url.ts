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

export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): Resolved | null {
  for (const name of CANDIDATES) {
    const value = env[name]?.trim();
    if (value) return { url: value, source: name };
  }

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

  return null;
}
