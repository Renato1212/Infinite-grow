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

/** The pieces the integration writes separately, assembled as a last resort. */
const PARTS = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_DATABASE",
] as const;

/** Every variable that could carry a connection string, for error messages. */
export const CONNECTION_VARIABLES = [...CANDIDATES] as readonly string[];

/**
 * Which of the variables are set, by name only.
 *
 * When nothing resolves, "no connection string is set" is true but useless: it
 * cannot distinguish a project with none of them from one where POSTGRES_HOST
 * is set and POSTGRES_PASSWORD was missed. Names and presence are not secrets,
 * so reporting them turns one round trip into an answer. Values never appear.
 */
export function connectionVariablesPresent(
  env: Record<string, string | undefined> = process.env,
): { present: string[]; missing: string[] } {
  const all = [...CANDIDATES, ...PARTS];
  const present = all.filter((name) => (env[name]?.trim() ?? "") !== "");
  // POSTGRES_USER and POSTGRES_DATABASE are derived or defaulted, so listing
  // them as missing sends people to set things that do not need setting. Only
  // report what actually has to come from a human.
  const derivable = new Set(["POSTGRES_USER", "POSTGRES_DATABASE"]);
  const needed = all.filter((name) => !derivable.has(name) || !databaseUser(env));
  return {
    present,
    missing: needed.filter((name) => !present.includes(name)),
  };
}

/**
 * The database username, derived when it was not set.
 *
 * Supabase's shared pooler authenticates as `postgres.<project-ref>`, and the
 * project ref is already in NEXT_PUBLIC_SUPABASE_URL, which the app needs for
 * auth regardless. There is no reason to make anyone type it a second time —
 * and typing it a second time is a chance to get it wrong.
 *
 * Only derived for a Supabase pooler host: elsewhere the username is not
 * predictable, and inventing one would replace a clear "not set" with a
 * confusing rejection.
 */
export function databaseUser(env: Record<string, string | undefined>): string | undefined {
  const explicit = env.POSTGRES_USER?.trim();
  if (explicit) return explicit;
  if (!env.POSTGRES_HOST?.includes("pooler.supabase.com")) return undefined;

  try {
    const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
    return ref ? `postgres.${ref}` : undefined;
  } catch {
    return undefined;
  }
}

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
  const { POSTGRES_PASSWORD, POSTGRES_HOST, POSTGRES_DATABASE } = env;
  const user = databaseUser(env);
  if (user && POSTGRES_PASSWORD && POSTGRES_HOST) {
    const database = POSTGRES_DATABASE || "postgres";
    return {
      url: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
        POSTGRES_PASSWORD,
      )}@${POSTGRES_HOST}/${database}`,
      source: "POSTGRES_PASSWORD/HOST",
    };
  }

  // Nothing workable and no parts. Hand back the first thing that was set, so
  // the shape check can name what is wrong with it.
  return present[0] ?? null;
}
